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
