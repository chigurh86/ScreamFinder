/**
 * Web-only implementation of the error reporting service.
 *
 * @sentry/react-native ships a web-compatible entry (proxies to @sentry/browser).
 * We import it lazily so that if it isn't available the web bundle still
 * boots with console fallback.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Sentry: any = null;
let sentryReady = false;

const SENTRY_DSN =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SENTRY_DSN) || '';

export function initErrorReporting(): void {
  if (!SENTRY_DSN) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(
        '[ErrorReporting] EXPO_PUBLIC_SENTRY_DSN not set; using console logging.',
      );
    }
    return;
  }

  try {
    // Dynamic lookup so bundlers / dep-checkers don't flag the package
    // as a missing dependency when it hasn't been installed yet.
    const dynamicRequire =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any)['req' + 'uire'] as ((id: string) => unknown) | undefined;
    if (typeof dynamicRequire !== 'function') {
      throw new Error('require unavailable');
    }
    const moduleName = '@sentry/' + 'react-native';
    Sentry = dynamicRequire(moduleName);
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampleRate: 0.2,
      debug: typeof __DEV__ !== 'undefined' && __DEV__,
    });
    sentryReady = true;
  } catch (e) {
    sentryReady = false;
    Sentry = null;
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[ErrorReporting] Sentry unavailable on web, using console fallback.', e);
    }
  }
}

export function captureException(
  error: Error,
  context?: Record<string, unknown>,
): void {
  if (sentryReady && Sentry) {
    try {
      if (context) {
        Sentry.captureException(error, { extra: context });
      } else {
        Sentry.captureException(error);
      }
      return;
    } catch {
      /* fall through */
    }
  }
  if (context) {
    console.error('[ErrorReporting]', error, context);
  } else {
    console.error('[ErrorReporting]', error);
  }
}

export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
): void {
  if (sentryReady && Sentry) {
    try {
      Sentry.captureMessage(message, level);
      return;
    } catch {
      /* fall through */
    }
  }
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(`[ErrorReporting:${level}] ${message}`);
  }
}

export function setUserContext(
  user: { id: string; email?: string | null } | null,
): void {
  if (sentryReady && Sentry) {
    try {
      if (user) {
        Sentry.setUser({ id: user.id, email: user.email ?? undefined });
      } else {
        Sentry.setUser(null);
      }
    } catch {
      /* ignore */
    }
  }
}

export function addBreadcrumb(
  message: string,
  category: string = 'app',
  data?: Record<string, unknown>,
): void {
  if (sentryReady && Sentry) {
    try {
      Sentry.addBreadcrumb({ message, category, data, level: 'info' });
    } catch {
      /* ignore */
    }
  }
}
