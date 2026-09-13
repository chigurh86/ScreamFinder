/**
 * Global JavaScript error handler.
 *
 * Purpose: prevent unhandled JS exceptions and unhandled promise
 * rejections from escalating to React Native's `RCTFatal()` code path,
 * which raises an NSException on the
 * `com.facebook.react.ExceptionsManagerQueue` and terminates the
 * process with SIGABRT.
 *
 * The Build 18 crash log showed exactly that path:
 *     Thread 5 (ExceptionsManagerQueue)
 *       → __cxa_rethrow
 *       → objc_exception_rethrow
 *       → abort()
 *
 * That happens when React Native's default global JS error handler
 * receives an error flagged `isFatal = true` and forwards it to native.
 * By installing our own handler BEFORE any other JS runs, we downgrade
 * every JS error to non-fatal, log it locally, forward it to Sentry
 * (if configured), and keep the app running.
 *
 * A crash during boot is far worse UX than a silently degraded feature.
 * The ErrorBoundary continues to catch render errors and show the
 * themed fallback UI; this handler is the last line of defense for
 * async errors, event-handler errors, and unhandled rejections that
 * live outside the React render tree.
 */

import { captureException } from './errorReportingService';

let installed = false;

/**
 * BUILD 28 CRITICAL DEFENSE: Monkey-patch
 * `NativeModules.ExceptionsManager.reportException` (and the legacy
 * `reportFatalException`) to force `isFatal: false` on every call.
 *
 * Why: The Xcode Organizer crash from Build 21 (iPhone 17 Pro, iOS
 * 26.6) — and the pattern Apple has repeatedly hit on iPhone 17 Pro
 * Max iOS 27.0 — shows this exact backtrace:
 *
 *   Thread 6 (dispatch queue)
 *     __exceptionPreprocess
 *     objc_exception_throw
 *     RCTFatal                                       ← the abort trigger
 *     -[RCTExceptionsManager reportFatal:...]
 *     -[RCTExceptionsManager reportException:]       ← JS→native call
 *     RCTNativeModule::invoke                        ← bridge dispatch
 *
 * The chain is: JS throws → RN's framework (MessageQueue,
 * timers, event handlers) internally calls
 * `NativeExceptionsManager.reportException({isFatal:true, ...})` →
 * native sees isFatal=true → calls RCTFatal → NSException → SIGABRT.
 *
 * Our `ErrorUtils.setGlobalHandler` override does NOT intercept this
 * path because it fires from RN's own bridge callback code, not from
 * the "uncaught error" path that ErrorUtils covers.
 *
 * By patching `reportException` at the NativeModules boundary, we
 * intercept every possible caller — framework, third-party library,
 * or our own code — and strip the isFatal flag before native ever
 * receives it. The error is still logged to Sentry (via our
 * globalErrorHandler + captureException) and the DEV LogBox. Only
 * the abort path is defused.
 */
function patchExceptionsManagerFatalPath(): void {
  try {
    // Lazy require so a broken react-native import cannot crash the
    // globalErrorHandler module load itself.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RN = require('react-native');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const NM: any = RN?.NativeModules;
    if (!NM) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const em: any = NM.ExceptionsManager;
    if (!em || em.__sfFatalPatched) return;

    // 1. `reportException` — the modern (RN 0.60+) path. JS builds a
    //    payload object with `{message, originalMessage, name, stack,
    //    id, isFatal, extraData}` and calls this method. Native's
    //    implementation checks `errorData.isFatal` and, if true, calls
    //    RCTFatal(). We copy the payload and force isFatal=false so
    //    native never takes the RCTFatal branch.
    if (typeof em.reportException === 'function') {
      const origReport = em.reportException.bind(em);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      em.reportException = (errorData: any) => {
        try {
          const safeData = errorData
            ? { ...errorData, isFatal: false }
            : { isFatal: false };
          return origReport(safeData);
        } catch {
          /* bridge call itself threw — swallow so the patch never
             becomes the crash source it is meant to prevent */
        }
      };
    }

    // 2. `reportFatalException` — the legacy (pre-0.60) path some
    //    libraries still call directly. Route it through
    //    `reportSoftException` if available, or drop it entirely.
    if (typeof em.reportFatalException === 'function') {
      const softHandler =
        typeof em.reportSoftException === 'function'
          ? em.reportSoftException.bind(em)
          : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      em.reportFatalException = (
        message: any,
        stack: any,
        exceptionId: any,
      ) => {
        try {
          if (softHandler) {
            return softHandler(message, stack, exceptionId);
          }
          if (__DEV__) {
            console.error(
              '[ExceptionsManager patched] fatal downgraded:',
              message,
            );
          }
        } catch {
          /* swallow */
        }
      };
    }

    em.__sfFatalPatched = true;

    if (__DEV__) {
      console.log(
        '[GlobalErrorHandler] ExceptionsManager reportException patched — RCTFatal path defused.',
      );
    }
  } catch (e) {
    if (__DEV__) {
      console.warn(
        '[GlobalErrorHandler] ExceptionsManager patch failed',
        e,
      );
    }
  }
}

// React Native exposes a global `ErrorUtils` object (typed loosely here
// so this file compiles on web where it doesn't exist).
type RNErrorUtils = {
  setGlobalHandler: (fn: (error: Error, isFatal?: boolean) => void) => void;
  getGlobalHandler: () => (error: Error, isFatal?: boolean) => void;
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

  // 0. Patch ExceptionsManager FIRST, before anything else. This is
  //    the last line of defense against RCTFatal → SIGABRT: even if
  //    our ErrorUtils global handler misses a fatal error (which does
  //    happen for errors thrown inside RN's own MessageQueue callbacks
  //    and bridge dispatch code), the ExceptionsManager patch strips
  //    the isFatal flag before native ever sees it. See the function's
  //    doc comment for the exact crash pattern this defuses.
  patchExceptionsManagerFatalPath();

  // 1. Intercept the RN global JS error handler. This is what receives
  //    every uncaught JS throw. We downgrade fatality and swallow, so
  //    RCTFatal / RCTExceptionsManager never fires abort() on us.
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
              : new Error(
                  typeof error === 'string'
                    ? error
                    : (() => {
                        try {
                          return JSON.stringify(error);
                        } catch {
                          return 'Unknown error';
                        }
                      })(),
                );

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
              : new Error(
                  typeof reason === 'string'
                    ? reason
                    : (() => {
                        try {
                          return JSON.stringify(reason);
                        } catch {
                          return 'Unhandled promise rejection';
                        }
                      })(),
                );
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
                  : new Error(
                      typeof rejection === 'string'
                        ? rejection
                        : (() => {
                            try {
                              return JSON.stringify(rejection);
                            } catch {
                              return `Unhandled promise rejection (id ${id})`;
                            }
                          })(),
                    );
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
try {
  installGlobalErrorHandlers();
} catch {
  /* installGlobalErrorHandlers is designed to never throw —
     the outer try/catch is belt-and-suspenders. */
}
