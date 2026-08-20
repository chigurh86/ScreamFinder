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

  // Sentry initialization is intentionally wrapped in defensive layers.
  // The previous implementation reached for `globalThis['req'+'uire']`,
  // which is undefined in Hermes release builds — that undefined access
  // followed by a call threw a non-Error object, which on iOS 26 could
  // escalate to a native abort before React ever mounted.
  //
  // We now:
  //   1. Detect Sentry availability without calling anything.
  //   2. Fully swallow ALL failures — there is no scenario where a
  //      Sentry init failure should ever crash the app.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = globalThis as any;
    // Hermes exposes require as a *scoped* function, not on globalThis.
    // If it's genuinely not there, bail cleanly — we simply run without
    // Sentry (which is exactly the same behavior as when DSN is empty).
    const dynamicRequire =
      typeof g['require'] === 'function' ? g['require'] :
      typeof g['__r'] === 'function' ? null : // __r takes module IDs, not names
      null;

    if (typeof dynamicRequire !== 'function') {
      if (__DEV__) {
        console.log(
          '[ErrorReporting] Dynamic require unavailable; running without Sentry.',
        );
      }
      return;
    }

    const moduleName = '@sentry/' + 'react-native';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mod: any = null;
    try {
      mod = dynamicRequire(moduleName);
    } catch {
      // Module not linked — fall back to console silently.
      return;
    }

    if (!mod || typeof mod.init !== 'function') {
      return;
    }

    try {
      mod.init({
        dsn: SENTRY_DSN,
        tracesSampleRate: 0.2,
        enableAutoSessionTracking: true,
        debug: __DEV__,
      });
      Sentry = mod;
      sentryReady = true;
      if (__DEV__) {
        console.log('[ErrorReporting] Sentry initialized.');
      }
    } catch {
      Sentry = null;
      sentryReady = false;
    }
  } catch {
    // Absolute last-resort catch — any unexpected error here must NOT
    // propagate, or it can crash the app at boot.
    Sentry = null;
    sentryReady = false;
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
