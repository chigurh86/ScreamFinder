/**
 * Web-only global error handler.
 *
 * On web there is no React Native bridge, no `RCTExceptionsManager`,
 * no `TurboModuleRegistry`, and no iOS 27 `ExceptionsManagerQueue`
 * crash to defuse — all of those concerns are native-only.
 *
 * This file replaces the native implementation entirely on the web
 * platform (resolved by Metro's `.web.ts` platform suffix) so that
 * the web bundle NEVER calls `require('react-native/...')` or
 * `require('react-native')`. Both of those requires trigger Metro's
 * fatal "Your web project is importing a module from 'react-native'
 * instead of 'react-native-web'" (expo.fyi/fb-batched-bridge-config-web)
 * when evaluated inside the web bundle.
 *
 * On web we still want to forward unhandled JS errors to the error
 * reporting service, but we do so via the standard browser APIs
 * (`window.addEventListener('error' | 'unhandledrejection')`) rather
 * than via React Native's `ErrorUtils` / `NativeModules.ExceptionsManager`
 * surface.
 */

import { captureException } from './errorReportingService';

let installed = false;

function safeStringify(v: unknown): string {
  try {
    if (v == null) return 'null';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyV: any = v;
      if (anyV.message) return String(anyV.message);
      return JSON.stringify(v);
    }
    return String(v);
  } catch {
    return '[unstringifiable]';
  }
}

/**
 * Installs browser-level global error listeners. Safe to call multiple
 * times; only the first call takes effect. The handler itself NEVER
 * throws — a throw here would defeat its purpose.
 */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = globalThis as any;

    if (typeof g.addEventListener === 'function') {
      // Uncaught synchronous errors (window.onerror equivalent).
      g.addEventListener('error', (event: ErrorEvent) => {
        try {
          const err =
            event?.error instanceof Error
              ? event.error
              : new Error(safeStringify(event?.message || event));
          try {
            captureException(err, { source: 'window.error' });
          } catch {
            /* reporting is best-effort */
          }
        } catch {
          /* never throw */
        }
      });

      // Unhandled promise rejections.
      g.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
        try {
          const reason = event?.reason;
          const err =
            reason instanceof Error
              ? reason
              : new Error(safeStringify(reason));
          try {
            captureException(err, { source: 'window.unhandledrejection' });
          } catch {
            /* reporting is best-effort */
          }
          try {
            if (typeof event.preventDefault === 'function') {
              event.preventDefault();
            }
          } catch {
            /* ignore */
          }
        } catch {
          /* never throw */
        }
      });
    }
  } catch (e) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[GlobalErrorHandler.web] install failed', e);
    }
  }
}

// Auto-install at module load — matches the native file's behavior so
// the single `import '../services/globalErrorHandler'` in app/_layout.tsx
// works identically on both platforms. Fully guarded; cannot throw.
try {
  installGlobalErrorHandlers();
} catch {
  /* installGlobalErrorHandlers is designed to never throw */
}
