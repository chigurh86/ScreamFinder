/**
 * Native-only global error handler.
 *
 * This module is imported as the VERY FIRST line of app/_layout.tsx so
 * it runs as a module-load side effect before anything else in the app
 * can throw. On iPadOS 27 beta Apple App Review observed a reproducible
 * crash on an iPad Air 11-inch (M3):
 *
 *   Thread 9 Crashed: Dispatch queue: com.facebook.react.ExceptionsManagerQueue
 *   0 libsystem_kernel.dylib __pthread_kill
 *   1 libsystem_pthread.dylib pthread_kill
 *   2 libsystem_c.dylib abort
 *   3 libc++abi.dylib __abort_message
 *   4 libc++abi.dylib demangling_terminate_handler()
 *   5 libobjc.A.dylib _objc_terminate()
 *   6 libc++abi.dylib std::__terminate(void (*)())
 *   7 libc++abi.dylib __cxa_rethrow + 188
 *   8 libobjc.A.dylib objc_exception_rethrow + 44
 *   9 ScreamFinder    <RCTExceptionsManager reportFatalException>
 *
 * ROOT CAUSE: when a fatal JS exception is reported via
 * NativeExceptionsManager.reportException(data) with data.isFatal=true,
 * React Native's RCTExceptionsManager eventually calls RCTFatal() which
 * @throw's an NSException on the ExceptionsManagerQueue. iPadOS 27's
 * dispatch runtime does not catch that rethrow at the queue boundary —
 * it routes to std::terminate -> abort() instead. This downgrades every
 * JS crash on iPadOS 27 to an immediate process kill, which Apple App
 * Review correctly flags as "crashes on launch" (Guideline 2.1(a)).
 *
 * THE FIX: intercept the exception reporting chain in JS, BEFORE the
 * native rethrow path is ever entered. We do this at four layers:
 *
 *   1. global.ErrorUtils.setGlobalHandler(): install a wrapper that
 *      forces isFatal=false, and also override setGlobalHandler so
 *      third parties (Sentry, Reanimated, etc.) can't re-install a
 *      fatal-propagating handler.
 *   2. global.ErrorUtils.reportFatalError(): redirect to reportError()
 *      so no caller can smuggle a fatal flag through the API.
 *   3. NativeModules.ExceptionsManager.reportException: monkey-patch
 *      so any data.isFatal is forced to false before native sees it.
 *   4. NativeModules.ExceptionsManager.reportFatalException: redirect
 *      to reportSoftException() so RCTFatal is never reached.
 *
 * All patches are wrapped in try/catch — this file must never itself
 * throw during module init, or we recreate exactly the crash we're
 * trying to prevent.
 */

import { captureException } from './errorReportingService';

let installed = false;

function safeMessage(e: unknown): string {
  try {
    if (e == null) return '(null error)';
    if (typeof e === 'string') return e;
    if (e instanceof Error) return e.message || String(e);
    if (typeof e === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyE: any = e;
      if (anyE.message) return String(anyE.message);
      try {
        return JSON.stringify(e);
      } catch {
        return '[object]';
      }
    }
    return String(e);
  } catch {
    return '(unstringifiable error)';
  }
}

function reportSafely(error: unknown, source: string) {
  try {
    const e = error instanceof Error ? error : new Error(safeMessage(error));
    captureException(e, { source });
  } catch {
    /* reporting is best-effort — never let a reporting failure propagate */
  }
}

/**
 * Layer 1 + 2: wrap global.ErrorUtils so any handler installed via it
 * can never see isFatal=true, and reportFatalError is neutralized.
 */
function patchErrorUtils(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = globalThis as any;
    const ErrorUtils = g.ErrorUtils;
    if (!ErrorUtils || typeof ErrorUtils !== 'object') return;

    const originalSet = ErrorUtils.setGlobalHandler;

    // Install our own default handler first so even if no one else
    // calls setGlobalHandler, we are the handler of record.
    const defaultHandler = (err: unknown) => {
      reportSafely(err, 'ErrorUtils.defaultHandler');
    };

    if (typeof originalSet === 'function') {
      try {
        originalSet.call(ErrorUtils, defaultHandler);
      } catch {
        /* ignore */
      }

      // Replace setGlobalHandler so any later caller (Sentry, RN itself)
      // is force-wrapped with isFatal=false.
      ErrorUtils.setGlobalHandler = function patchedSetGlobalHandler(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handler: any,
      ): void {
        const wrapped = (err: unknown, _isFatal?: boolean) => {
          reportSafely(err, 'ErrorUtils.wrappedHandler');
          try {
            if (typeof handler === 'function') {
              // Always pass isFatal=false regardless of what the caller intended.
              handler(err, false);
            }
          } catch (e) {
            reportSafely(e, 'ErrorUtils.wrappedHandler.inner');
          }
        };
        try {
          originalSet.call(ErrorUtils, wrapped);
        } catch (e) {
          reportSafely(e, 'ErrorUtils.setGlobalHandler.rethrow');
        }
      };
    }

    // Neutralize reportFatalError if present.
    if (typeof ErrorUtils.reportFatalError === 'function') {
      ErrorUtils.reportFatalError = function patchedReportFatalError(
        err: unknown,
      ): void {
        reportSafely(err, 'ErrorUtils.reportFatalError');
        try {
          if (typeof ErrorUtils.reportError === 'function') {
            ErrorUtils.reportError(err);
          }
        } catch {
          /* swallow — do NOT invoke the original fatal reporter */
        }
      };
    }
  } catch (e) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[GlobalErrorHandler.native] patchErrorUtils failed', e);
    }
  }
}

/**
 * Layer 3 + 4: patch NativeModules.ExceptionsManager so no `isFatal: true`
 * payload ever reaches native, and the deprecated `reportFatalException`
 * entry point is also neutralized.
 */
function patchNativeExceptionsManager(): void {
  try {
    // Lazy require so we don't crash on web. The .native.ts suffix should
    // keep this file off the web bundle, but double-protect anyway.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RN = require('react-native');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const NM: any = (RN && RN.NativeModules) || {};
    const EM = NM.ExceptionsManager;
    if (!EM) return;

    // Override reportException (modern API). Force isFatal: false.
    if (typeof EM.reportException === 'function') {
      const original = EM.reportException.bind(EM);
      EM.reportException = (data: unknown) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const d: any = data && typeof data === 'object' ? data : {};
          if (d && d.isFatal) {
            d.isFatal = false;
          }
          return original(d);
        } catch {
          /* swallow — this module must never throw */
          return undefined;
        }
      };
    }

    // Override reportFatalException. Redirect to reportSoftException to
    // avoid the RCTFatal → objc_exception_rethrow path.
    if (typeof EM.reportFatalException === 'function') {
      EM.reportFatalException = (
        message: string,
        stack: unknown,
        exceptionId: number,
      ) => {
        try {
          if (typeof EM.reportSoftException === 'function') {
            return EM.reportSoftException(message, stack, exceptionId);
          }
        } catch {
          /* swallow */
        }
        return undefined;
      };
    }

    // Also patch the TurboModule shim path if it exists (new arch).
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const TMR: any = RN && (RN as any).TurboModuleRegistry;
      if (TMR && typeof TMR.get === 'function') {
        const tbEM = TMR.get('ExceptionsManager');
        if (tbEM && tbEM !== EM) {
          if (typeof tbEM.reportException === 'function') {
            const orig = tbEM.reportException.bind(tbEM);
            tbEM.reportException = (data: unknown) => {
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const d: any = data && typeof data === 'object' ? data : {};
                if (d && d.isFatal) {
                  d.isFatal = false;
                }
                return orig(d);
              } catch {
                return undefined;
              }
            };
          }
          if (typeof tbEM.reportFatalException === 'function') {
            tbEM.reportFatalException = (
              message: string,
              stack: unknown,
              exceptionId: number,
            ) => {
              try {
                if (typeof tbEM.reportSoftException === 'function') {
                  return tbEM.reportSoftException(message, stack, exceptionId);
                }
              } catch {
                /* swallow */
              }
              return undefined;
            };
          }
        }
      }
    } catch {
      /* TurboModuleRegistry may not exist on old arch */
    }
  } catch (e) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        '[GlobalErrorHandler.native] patchNativeExceptionsManager failed',
        e,
      );
    }
  }
}

/**
 * Layer 5: unhandled promise rejection tracker. Hermes exposes
 * `HermesInternal.enablePromiseRejectionTracker` which fires BEFORE
 * RN's default handler, giving us a chance to swallow the rejection.
 */
function patchPromiseRejection(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = globalThis as any;

    const HermesInternal = g.HermesInternal;
    if (
      HermesInternal &&
      typeof HermesInternal.enablePromiseRejectionTracker === 'function'
    ) {
      try {
        HermesInternal.enablePromiseRejectionTracker({
          allRejections: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onUnhandled: (_id: number, rejection: any) => {
            reportSafely(rejection, 'promise.unhandled');
          },
          onHandled: () => {
            /* no-op */
          },
        });
      } catch {
        /* swallow */
      }
    }
  } catch (e) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        '[GlobalErrorHandler.native] patchPromiseRejection failed',
        e,
      );
    }
  }
}

export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  // Order matters: patch NativeExceptionsManager FIRST so any error
  // thrown during the subsequent patches is already contained at the
  // native boundary. Then patch ErrorUtils so the JS-side handler
  // chain is wrapped. Finally patch Hermes promise rejection.
  patchNativeExceptionsManager();
  patchErrorUtils();
  patchPromiseRejection();
}

// Auto-install at module load — this is the whole point of the file.
try {
  installGlobalErrorHandlers();
} catch {
  /* installGlobalErrorHandlers is designed to never throw */
}

export default installGlobalErrorHandlers;
