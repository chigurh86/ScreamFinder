/**
 * Global JavaScript error handler.
 *
 * Purpose: prevent unhandled JS exceptions and unhandled promise
 * rejections from escalating to React Native's `RCTFatal()` code path,
 * which raises an NSException on the
 * `com.facebook.react.ExceptionsManagerQueue` and terminates the
 * process with SIGABRT.
 *
 * ─────────────────────────────────────────────────────────────────
 * BUILD 32 CRITICAL REWRITE (iOS 27 crash mitigation)
 * ─────────────────────────────────────────────────────────────────
 *
 * Build 31 shipped a patch that forced `isFatal: false` before
 * forwarding calls to native `RCTExceptionsManager.reportException`.
 * That patch STILL crashed on iPhone 17 Pro Max running iOS 27.0
 * with the same signature:
 *
 *   Thread N (com.facebook.react.ExceptionsManagerQueue)
 *     __pthread_kill
 *     abort
 *     __abort_message
 *     demangling_terminate_handler()
 *     _objc_terminate()
 *     std::__terminate
 *     __cxa_rethrow
 *     objc_exception_rethrow           ← native @catch rethrew
 *     ScreamFinder+4727848              ← RCTModuleMethod dispatch
 *     ScreamFinder+4726340
 *     _dispatch_call_block_and_release
 *
 * Root cause: iOS 27 tightened NSInvocation / JSI marshalling paths.
 * Even with `isFatal: false`, `-[RCTExceptionsManager reportException:]`
 * itself raises an NSException on iOS 27 while unpacking the payload
 * (stack frame validation, message coercion, or the new
 * NSExceptionTerminating hook). The bridge's outer `@catch` sees an
 * exception name matching its known-fatal list and unconditionally
 * `@throw`s (that's the `objc_exception_rethrow` in the trace).
 * Nothing above catches it → `_objc_terminate` → SIGABRT.
 *
 * Conclusion: any call from JS into native ExceptionsManager on
 * iOS 27 is unsafe. `isFatal: false` is not enough — we must
 * NEVER invoke the native module at all.
 *
 * FIX: fully defuse every `NativeModules.ExceptionsManager` method
 * with no-op JS stubs. Errors are still logged locally and forwarded
 * to Sentry (if configured); only the native bridge invocation is
 * skipped. LogBox / red-box is DEV-only and unaffected in production.
 *
 * Belt-and-suspenders: also install a JS-side global `ErrorUtils`
 * handler that swallows uncaught errors before RN's own default
 * handler tries to route them through ExceptionsManager, and patch
 * `TurboModuleRegistry.get('ExceptionsManager')` in case that returns
 * a different object than `NativeModules.ExceptionsManager`.
 */

import { captureException } from './errorReportingService';

let installed = false;

/**
 * Detect whether we are running inside a browser-like environment
 * (Expo Web / React Native Web). On web there is no native bridge,
 * no RCTExceptionsManager, and no TurboModuleRegistry — attempting to
 * `require()` those native-only modules triggers Metro's
 * "importing from react-native instead of react-native-web" fatal
 * error, which is exactly what this handler is supposed to prevent.
 *
 * We detect web via `document`/`window` globals rather than importing
 * `Platform` from react-native, so this detection itself cannot
 * trigger the same fatal we're guarding against.
 */
function isWebRuntime(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = globalThis as any;
    return (
      typeof g.document !== 'undefined' &&
      typeof g.window !== 'undefined' &&
      typeof g.navigator !== 'undefined'
    );
  } catch {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeStringify(v: any): string {
  try {
    if (v == null) return 'null';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') {
      if (v.message) return String(v.message);
      return JSON.stringify(v);
    }
    return String(v);
  } catch {
    return '[unstringifiable]';
  }
}

/**
 * Replace every method on the native ExceptionsManager wrapper with a
 * no-op JS stub. This is the ONLY thing standing between a JS throw
 * and the iOS 27 RCTFatal → NSException → abort() path.
 *
 * We do not call the original bridge method under any circumstance.
 * If native ExceptionsManager is fundamentally broken on iOS 27 (which
 * Build 31's crash proves), preserving the isFatal=false code path
 * still triggers the abort. Total isolation is the only safe posture.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function defuseExceptionsManagerObject(em: any, source: string): boolean {
  if (!em || em.__sfDefused) return false;
  try {
    // 1. `reportException` — modern (RN 0.60+) path. JS builds a
    //    payload object with `{message, originalMessage, name, stack,
    //    id, isFatal, extraData}` and calls this method. We log JS-
    //    side and return without touching native.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    em.reportException = (errorData: any) => {
      try {
        if (__DEV__) {
          console.warn(
            `[ExceptionsManager defused:${source}] reportException`,
            safeStringify(errorData?.message),
          );
        }
        // Forward to Sentry / console but NEVER to native.
        try {
          const err = new Error(
            safeStringify(errorData?.message || errorData?.originalMessage || 'JS Exception'),
          );
          if (errorData?.stack) {
            try {
              err.stack = Array.isArray(errorData.stack)
                ? errorData.stack.map((f: any) => safeStringify(f)).join('\n')
                : safeStringify(errorData.stack);
            } catch {
              /* ignore stack coercion errors */
            }
          }
          captureException(err, {
            source: 'ExceptionsManager.reportException',
            isFatal: !!errorData?.isFatal,
          });
        } catch {
          /* reporting is best-effort; a broken Sentry must not crash */
        }
      } catch {
        /* the defused stub must NEVER throw */
      }
    };

    // 2. `reportFatalException` — legacy (pre-0.60) path some libraries
    //    still call directly. Full no-op.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    em.reportFatalException = (message: any, _stack: any, _exceptionId: any) => {
      try {
        if (__DEV__) {
          console.warn(
            `[ExceptionsManager defused:${source}] reportFatalException`,
            safeStringify(message),
          );
        }
        try {
          captureException(new Error(safeStringify(message)), {
            source: 'ExceptionsManager.reportFatalException',
            isFatal: true,
          });
        } catch {
          /* ignore */
        }
      } catch {
        /* never throw */
      }
    };

    // 3. `reportSoftException` — the "just log it" path. Some Hermes
    //    tooling routes benign warnings through here. Full no-op.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    em.reportSoftException = (message: any, _stack: any, _exceptionId: any) => {
      try {
        if (__DEV__) {
          console.warn(
            `[ExceptionsManager defused:${source}] reportSoftException`,
            safeStringify(message),
          );
        }
      } catch {
        /* never throw */
      }
    };

    // 4. Other methods that dispatch on the same queue. Any call to
    //    these could also trip the iOS 27 native bug on this queue,
    //    so we no-op them too.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    em.updateExceptionMessage = (_message: any, _stack: any, _exceptionId: any) => {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    em.dismissRedbox = () => {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    em.reportExtraData = (_extraData: any, _exceptionId: any) => {};

    em.__sfDefused = true;

    if (__DEV__) {
      console.log(
        `[GlobalErrorHandler] ExceptionsManager fully defused (source=${source}). No native RCTExceptionsManager calls will ever be made from this JS runtime.`,
      );
    }
    return true;
  } catch (e) {
    if (__DEV__) {
      console.warn(
        `[GlobalErrorHandler] Failed to defuse ExceptionsManager (source=${source}):`,
        e,
      );
    }
    return false;
  }
}

/**
 * Try to defuse every JS reference to the native ExceptionsManager we
 * can find. In RN 0.79 legacy architecture the two normal paths are:
 *
 *   a) `NativeModules.ExceptionsManager`
 *   b) `TurboModuleRegistry.get('ExceptionsManager')`
 *
 * They usually return the same object but we cannot rely on that on
 * every RN patch level, so we handle both. Any additional lookup path
 * a future RN release adds is not covered here, but every current
 * caller in the RN codebase funnels through one of these two.
 */
function defuseAllExceptionsManagerRefs(): void {
  // No-op on web. react-native-web has no RCTExceptionsManager and no
  // TurboModuleRegistry. Requiring those native-only paths from a web
  // bundle triggers Metro's fatal "importing from react-native instead
  // of react-native-web" error (expo.fyi/fb-batched-bridge-config-web),
  // which is exactly the kind of crash this handler exists to prevent.
  // The iOS 27 ExceptionsManagerQueue crash this function defuses
  // simply does not exist on web.
  if (isWebRuntime()) {
    return;
  }

  // (a) NativeModules.ExceptionsManager
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RN = require('react-native');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const em: any = RN?.NativeModules?.ExceptionsManager;
    defuseExceptionsManagerObject(em, 'NativeModules');
  } catch (e) {
    if (__DEV__) {
      console.warn('[GlobalErrorHandler] NativeModules access threw', e);
    }
  }

  // (b) TurboModuleRegistry.get('ExceptionsManager')
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TMR = require('react-native/Libraries/TurboModule/TurboModuleRegistry');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const em: any = TMR?.get?.('ExceptionsManager');
    // If it's the same object we already defused, __sfDefused is true
    // and defuseExceptionsManagerObject bails cleanly. Otherwise we
    // patch a distinct wrapper.
    defuseExceptionsManagerObject(em, 'TurboModuleRegistry');
  } catch (e) {
    if (__DEV__) {
      console.warn('[GlobalErrorHandler] TurboModuleRegistry access threw', e);
    }
  }
}

// React Native exposes a global `ErrorUtils` object (typed loosely here
// so this file compiles on web where it doesn't exist).
type RNErrorUtils = {
  setGlobalHandler: (fn: (error: Error, isFatal?: boolean) => void) => void;
  getGlobalHandler: () => (error: Error, isFatal?: boolean) => void;
  reportError?: (error: Error) => void;
  reportFatalError?: (error: Error) => void;
};

function getErrorUtils(): RNErrorUtils | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = globalThis as any;
    if (g && g.ErrorUtils && typeof g.ErrorUtils.setGlobalHandler === 'function') {
      return g.ErrorUtils as RNErrorUtils;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Installs the global error and unhandled-rejection handlers. Safe to
 * call multiple times; only the first call takes effect.
 *
 * Every step of this function is wrapped in try/catch: this handler
 * itself must NEVER throw, because a throw here would defeat its
 * entire purpose.
 */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  // 0. DEFUSE ExceptionsManager FIRST, before anything else. This is
  //    the last line of defense against RCTFatal → SIGABRT on iOS 27:
  //    even if our ErrorUtils global handler misses a fatal error
  //    (which does happen for errors thrown inside RN's own
  //    MessageQueue callbacks and bridge dispatch code), the defused
  //    ExceptionsManager guarantees no native invocation happens on
  //    the ExceptionsManagerQueue. See the module doc comment for the
  //    exact crash pattern this defuses.
  defuseAllExceptionsManagerRefs();

  // 0.5. Schedule a second defuse pass on the next tick. In some
  //      RN boot sequences, `TurboModuleRegistry.get('ExceptionsManager')`
  //      returns null on the very first synchronous access (the native
  //      module hasn't finished registering yet). A second pass a tick
  //      later catches those cases so no ExceptionsManager reference
  //      ever remains un-defused. Skipped on web entirely — see
  //      `defuseAllExceptionsManagerRefs` for the full explanation.
  if (!isWebRuntime()) {
    try {
      setTimeout(() => {
        try {
          defuseAllExceptionsManagerRefs();
        } catch {
          /* never throw */
        }
      }, 0);
    } catch {
      /* setTimeout is defined in every JS runtime we ship on */
    }
  }

  // 1. Intercept the RN global JS error handler. This is what receives
  //    every uncaught JS throw. We swallow so RN's default handler
  //    (which routes through ExceptionsManager) never fires.
  try {
    const eu = getErrorUtils();
    if (eu) {
      const previous = (() => {
        try {
          return eu.getGlobalHandler();
        } catch {
          return null;
        }
      })();

      eu.setGlobalHandler((error, isFatal) => {
        try {
          const err =
            error instanceof Error
              ? error
              : new Error(safeStringify(error));

          if (__DEV__) {
            console.error(
              `[GlobalErrorHandler] ${isFatal ? 'FATAL' : 'non-fatal'} JS error:`,
              err,
            );
          }

          try {
            captureException(err, {
              source: 'GlobalErrorHandler',
              isFatal: !!isFatal,
            });
          } catch {
            /* ignore reporting failures */
          }

          // In DEV, forward to the previous handler so the LogBox red
          // screen still appears and developers can debug. In
          // production, we intentionally do NOT call the previous
          // handler, because the default RN handler is exactly what
          // triggers the RCTFatal → SIGABRT crash we're preventing.
          if (__DEV__ && previous && typeof previous === 'function') {
            try {
              previous(err, isFatal);
            } catch {
              /* ignore */
            }
          }
        } catch {
          /* handler itself must never throw */
        }
      });

      if (__DEV__) {
        console.log('[GlobalErrorHandler] RN global handler installed.');
      }
    }
  } catch (e) {
    if (__DEV__) console.warn('[GlobalErrorHandler] setGlobalHandler failed', e);
  }

  // 1.5. Additionally override `ErrorUtils.reportError` / `reportFatalError`.
  //      Some libraries (and RN's own internals) bypass the global
  //      handler and call these directly. Both route through
  //      ExceptionsManager if we don't intercept.
  try {
    const eu = getErrorUtils();
    if (eu) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (eu as any).reportError = (error: Error) => {
        try {
          if (__DEV__) console.warn('[GlobalErrorHandler] reportError:', error);
          try {
            captureException(
              error instanceof Error ? error : new Error(safeStringify(error)),
              { source: 'ErrorUtils.reportError' },
            );
          } catch {
            /* ignore */
          }
        } catch {
          /* never throw */
        }
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (eu as any).reportFatalError = (error: Error) => {
        try {
          if (__DEV__) console.warn('[GlobalErrorHandler] reportFatalError:', error);
          try {
            captureException(
              error instanceof Error ? error : new Error(safeStringify(error)),
              { source: 'ErrorUtils.reportFatalError', isFatal: true },
            );
          } catch {
            /* ignore */
          }
        } catch {
          /* never throw */
        }
      };
    }
  } catch (e) {
    if (__DEV__) console.warn('[GlobalErrorHandler] reportError override failed', e);
  }

  // 2. Intercept unhandled promise rejections. On modern Hermes these
  //    fire an `unhandledrejection` event on globalThis just like the
  //    browser. On older RN versions they route through Promise's
  //    internal handler; we cover both.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = globalThis as any;
    if (typeof g.addEventListener === 'function') {
      g.addEventListener('unhandledrejection', (event: any) => {
        try {
          const reason = event?.reason;
          const err =
            reason instanceof Error
              ? reason
              : new Error(safeStringify(reason));
          if (__DEV__) {
            console.warn('[GlobalErrorHandler] Unhandled rejection:', err);
          }
          try {
            captureException(err, {
              source: 'unhandledrejection',
            });
          } catch {
            /* ignore */
          }
          try {
            if (typeof event.preventDefault === 'function') {
              event.preventDefault();
            }
          } catch {
            /* ignore */
          }
        } catch {
          /* handler must never throw */
        }
      });
    }

    // HermesInternal exposes enablePromiseRejectionTracker; if we can
    // hook it we get a synchronous callback for every rejection that
    // wasn't caught within a tick.
    if (g.HermesInternal && typeof g.HermesInternal.enablePromiseRejectionTracker === 'function') {
      try {
        g.HermesInternal.enablePromiseRejectionTracker({
          allRejections: true,
          onUnhandled: (id: number, rejection: unknown) => {
            try {
              const err =
                rejection instanceof Error
                  ? rejection
                  : new Error(safeStringify(rejection) || `Unhandled promise rejection (id ${id})`);
              if (__DEV__) {
                console.warn(
                  `[GlobalErrorHandler] Hermes unhandled rejection ${id}:`,
                  err,
                );
              }
              try {
                captureException(err, {
                  source: 'HermesPromiseRejectionTracker',
                  rejectionId: id,
                });
              } catch {
                /* ignore */
              }
            } catch {
              /* never throw */
            }
          },
        });
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    if (__DEV__) console.warn('[GlobalErrorHandler] rejection hook failed', e);
  }
}

// Auto-install at module load. Fully guarded; cannot throw. When this
// file is imported as a side-effect at the very top of app/_layout.tsx,
// the handler installs BEFORE any other module in the import graph
// finishes evaluating — so errors thrown during module init of
// AppContext, expo-router, template auth, or any third-party module
// are intercepted and downgraded to non-fatal before RN's RCTFatal path
// can abort() the process.
//
// 2026-10-07: added `isWebRuntime()` early return in
// defuseAllExceptionsManagerRefs so the web bundle no longer tries
// to `require('react-native/Libraries/TurboModule/TurboModuleRegistry')`,
// which triggered Metro's fb-batched-bridge-config-web fatal.
try {
  installGlobalErrorHandlers();
} catch {
  /* installGlobalErrorHandlers is designed to never throw —
     the outer try/catch is belt-and-suspenders. */
}
