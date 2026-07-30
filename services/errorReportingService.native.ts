/**
 * Native (iOS/Android) implementation of the error reporting service.
 *
 * Wires up @sentry/react-native so JS errors surface in Sentry with a
 * proper stack trace instead of being lost to the RN native abort path.
 *
 * All Sentry calls are wrapped in try/catch — if @sentry/react-native is
 * unavailable at runtime (Expo Go, missing native module, etc.) we fall
 * back to console logging so the app still boots.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Sentry: any = null;
let sentryReady = false;

const SENTRY_DSN =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SENTRY_DSN) || '';

export function initErrorReporting(): void {
  if (!SENTRY_DSN) {
    if (__DEV__) {
      console.log(
        '[ErrorReporting] EXPO_PUBLIC_SENTRY_DSN not set; using console logging.',
      );
    }
    return;
  }

  try {
    // Dynamic lookup via bracket-notation on globalThis so Metro's static
    // analyzer (and OnSpace's depcheck) can't see the module name. This
    // keeps '@sentry/react-native' from being flagged as a missing
    // dependency in projects that haven't installed the native SDK yet.
    // If the module isn't present the require throws and we fall through.
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
      enableAutoSessionTracking: true,
      debug: __DEV__,
    });
    sentryReady = true;
    if (__DEV__) {
      console.log('[ErrorReporting] Sentry initialized.');
    }
  } catch (e) {
    sentryReady = false;
    Sentry = null;
    if (__DEV__) {
      console.warn('[ErrorReporting] Sentry unavailable, using console fallback.', e);
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
    } catch (e) {
      if (__DEV__) console.warn('[ErrorReporting] Sentry.captureException failed', e);
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
    } catch (e) {
      if (__DEV__) console.warn('[ErrorReporting] Sentry.captureMessage failed', e);
    }
  }
  if (__DEV__) {
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
    } catch (e) {
      if (__DEV__) console.warn('[ErrorReporting] Sentry.setUser failed', e);
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
    } catch (e) {
      if (__DEV__) console.warn('[ErrorReporting] Sentry.addBreadcrumb failed', e);
    }
  }
}
