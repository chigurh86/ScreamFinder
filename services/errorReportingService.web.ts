/**
 * Web-only stub for the error reporting service.
 *
 * `@sentry/react-native` is native-only and cannot be bundled on web.
 * On the web platform we degrade to console logging so the app still
 * runs and errors are visible during development.
 */

export function initErrorReporting(): void {
  if (__DEV__) {
    console.log('[ErrorReporting] Web platform: Sentry disabled, using console logging only.');
  }
}

export function captureException(
  error: Error,
  context?: Record<string, unknown>
): void {
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
  if (__DEV__) {
    console.log(`[ErrorReporting:${level}] ${message}`);
  }
}

export function setUserContext(
  _user: { id: string; email?: string | null } | null
): void {
  // no-op on web
}

export function addBreadcrumb(
  _message: string,
  _category: string = 'app',
  _data?: Record<string, unknown>
): void {
  // no-op on web
}
