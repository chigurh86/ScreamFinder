/**
 * Native (iOS/Android) implementation of the error reporting service.
 *
 * Uses `@sentry/react-native` when it is installed and a DSN is configured.
 * The Sentry module is loaded via a parameter-based dynamic `require()`
 * so that Metro's static analyser never tries to pre-resolve it — this
 * mirrors the pattern used by `iapService.native.ts` and prevents the
 * "Requiring unknown module" runtime error when the optional native
 * dependency isn't linked (e.g. in Expo Go).
 *
 * When Sentry is unavailable we degrade gracefully to console logging so
 * the app continues to run and errors are still visible in dev.
 */

const SENTRY_DSN =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SENTRY_DSN) || '';

let sentry: any = null;
let sentryInitialized = false;
let sentryLoadAttempted = false;

/**
 * Runtime module loader. Because `name` is a function parameter, Metro
 * will not statically pre-assign a module ID to `@sentry/react-native`
 * during bundling, so an unresolved module can never crash the app at
 * startup.
 */
function loadOptionalModule(name: string): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(name);
  } catch {
    return null;
  }
}

function getSentry(): any {
  if (sentry) return sentry;
  if (sentryLoadAttempted) return null;
  sentryLoadAttempted = true;

  // Assemble the package name at runtime so no literal appears in source.
  const parts: string[] = [];
  parts.push('@sentry');
  parts.push('react-native');
  const moduleName = parts.join('/');
  sentry = loadOptionalModule(moduleName);
  return sentry;
}

export function initErrorReporting(): void {
  if (sentryInitialized) return;

  if (!SENTRY_DSN) {
    if (__DEV__) {
      console.log(
        '[ErrorReporting] EXPO_PUBLIC_SENTRY_DSN not configured; using console logging.'
      );
    }
    return;
  }

  if (__DEV__) {
    // Skip Sentry in development to avoid noise.
    console.log('[ErrorReporting] Development build; Sentry disabled.');
    return;
  }

  const S = getSentry();
  if (!S || typeof S.init !== 'function') {
    console.log(
      '[ErrorReporting] @sentry/react-native is not installed; falling back to console logging.'
    );
    return;
  }

  try {
    S.init({
      dsn: SENTRY_DSN,
      enableAutoSessionTracking: true,
      tracesSampleRate: 0.2,
    });
    sentryInitialized = true;
  } catch (e) {
    console.error('[ErrorReporting] Failed to initialize Sentry:', e);
  }
}

export function captureException(
  error: Error,
  context?: Record<string, unknown>
): void {
  const S = getSentry();
  if (sentryInitialized && S && typeof S.captureException === 'function') {
    try {
      S.captureException(error, context ? { extra: context } : undefined);
      return;
    } catch (e) {
      console.error('[ErrorReporting] Sentry capture failed:', e);
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
  level: 'info' | 'warning' | 'error' = 'info'
): void {
  const S = getSentry();
  if (sentryInitialized && S && typeof S.captureMessage === 'function') {
    try {
      S.captureMessage(message, level);
      return;
    } catch {
      // Fall through to console
    }
  }

  if (__DEV__) {
    console.log(`[ErrorReporting:${level}] ${message}`);
  }
}

export function setUserContext(
  user: { id: string; email?: string | null } | null
): void {
  const S = getSentry();
  if (!sentryInitialized || !S || typeof S.setUser !== 'function') return;

  try {
    if (user) {
      S.setUser({ id: user.id, email: user.email || undefined });
    } else {
      S.setUser(null);
    }
  } catch {
    // Silent no-op — user context is best-effort
  }
}

export function addBreadcrumb(
  message: string,
  category: string = 'app',
  data?: Record<string, unknown>
): void {
  const S = getSentry();
  if (!sentryInitialized || !S || typeof S.addBreadcrumb !== 'function') return;

  try {
    S.addBreadcrumb({
      message,
      category,
      data,
      level: 'info',
    });
  } catch {
    // Silent no-op
  }
}
