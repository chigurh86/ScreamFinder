import { Platform } from 'react-native';

/**
 * Lightweight, gracefully-degrading wrapper around Sentry React Native.
 *
 * - In production with `EXPO_PUBLIC_SENTRY_DSN` configured, errors are
 *   forwarded to Sentry for remote tracking.
 * - In development, errors are logged to the console only (no remote noise).
 * - If the Sentry SDK is not yet installed or fails to initialize, every
 *   call falls back to a no-op so the rest of the app keeps working.
 */

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const RELEASE_VERSION = process.env.EXPO_PUBLIC_APP_VERSION || '1.0.0';

// Resolve Sentry lazily and defensively. If the package isn't available
// (for example during a fresh checkout before npm install), we simply
// behave as a no-op reporter rather than crashing the app boundary.
type SentryModule = typeof import('@sentry/react-native');
let SentryRef: SentryModule | null = null;
let initialized = false;

function loadSentry(): SentryModule | null {
  if (SentryRef) return SentryRef;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    SentryRef = require('@sentry/react-native') as SentryModule;
    return SentryRef;
  } catch {
    return null;
  }
}

/**
 * Initialize the error reporter. Safe to call multiple times.
 * Only activates when a DSN is configured AND not in development.
 */
export function initErrorReporting(): void {
  if (initialized) return;

  if (!SENTRY_DSN) {
    if (__DEV__) {
      console.log(
        '[ErrorReporting] EXPO_PUBLIC_SENTRY_DSN is not set; remote error reporting is disabled.'
      );
    }
    initialized = true;
    return;
  }

  const Sentry = loadSentry();
  if (!Sentry) {
    if (__DEV__) {
      console.warn(
        '[ErrorReporting] @sentry/react-native is not installed; falling back to console logging.'
      );
    }
    initialized = true;
    return;
  }

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      debug: false,
      enabled: !__DEV__,
      enableAutoSessionTracking: true,
      sessionTrackingIntervalMillis: 30000,
      tracesSampleRate: 0.2,
      release: RELEASE_VERSION,
      environment: __DEV__ ? 'development' : 'production',
      // Filter out noisy or expected errors before they leave the device.
      beforeSend(event) {
        if (__DEV__) return null;
        return event;
      },
    });

    Sentry.setTag('platform', Platform.OS);
    initialized = true;

    if (__DEV__) {
      console.log('[ErrorReporting] Sentry initialized successfully.');
    }
  } catch (err) {
    console.warn('[ErrorReporting] Failed to initialize Sentry:', err);
    initialized = true;
  }
}

/**
 * Capture a runtime exception. Always console.errors locally; only ships
 * to Sentry in production with a configured DSN.
 */
export function captureException(
  error: Error,
  context?: Record<string, unknown>
): void {
  // Always log locally so errors are visible during development & in logs.
  if (context) {
    console.error('[ErrorReporting]', error, context);
  } else {
    console.error('[ErrorReporting]', error);
  }

  const Sentry = loadSentry();
  if (!Sentry || !SENTRY_DSN || __DEV__) return;

  try {
    Sentry.withScope((scope) => {
      scope.setTag('platform', Platform.OS);
      if (context) {
        for (const [key, value] of Object.entries(context)) {
          try {
            scope.setExtra(key, value as never);
          } catch {
            // skip non-serializable values
          }
        }
      }
      Sentry.captureException(error);
    });
  } catch (err) {
    console.warn('[ErrorReporting] Failed to capture exception:', err);
  }
}

/**
 * Capture a message-level event (info/warning/error) for breadcrumbs and
 * non-fatal diagnostic logging.
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info'
): void {
  if (__DEV__) {
    console.log(`[ErrorReporting:${level}] ${message}`);
  }

  const Sentry = loadSentry();
  if (!Sentry || !SENTRY_DSN || __DEV__) return;

  try {
    Sentry.captureMessage(message, level);
  } catch (err) {
    console.warn('[ErrorReporting] Failed to capture message:', err);
  }
}

/**
 * Associate the current user with future error reports. Pass `null` to
 * clear the user context after sign-out.
 */
export function setUserContext(
  user: { id: string; email?: string | null } | null
): void {
  const Sentry = loadSentry();
  if (!Sentry || !SENTRY_DSN || __DEV__) return;

  try {
    if (user) {
      Sentry.setUser({ id: user.id, email: user.email ?? undefined });
    } else {
      Sentry.setUser(null);
    }
  } catch (err) {
    console.warn('[ErrorReporting] Failed to set user context:', err);
  }
}

/**
 * Add a breadcrumb to track user actions leading up to an error.
 */
export function addBreadcrumb(
  message: string,
  category: string = 'app',
  data?: Record<string, unknown>
): void {
  const Sentry = loadSentry();
  if (!Sentry || !SENTRY_DSN || __DEV__) return;

  try {
    Sentry.addBreadcrumb({
      message,
      category,
      level: 'info',
      data: data as Record<string, never> | undefined,
      timestamp: Date.now() / 1000,
    });
  } catch {
    // ignore
  }
}
