/**
 * Native (iOS/Android) implementation of the error reporting service.
 *
 * Console-only implementation. If Sentry integration is desired later,
 * install `@sentry/react-native` and add a literal `require('@sentry/react-native')`
 * wrapped in try/catch here (Metro no longer allows dynamic `require(variable)`).
 */

export function initErrorReporting(): void {
  if (__DEV__) {
    console.log('[ErrorReporting] Using console logging (Sentry not configured).');
  }
}

export function captureException(
  error: Error,
  context?: Record<string, unknown>,
): void {
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
  if (__DEV__) {
    console.log(`[ErrorReporting:${level}] ${message}`);
  }
}

export function setUserContext(
  _user: { id: string; email?: string | null } | null,
): void {
  // No-op: user context is only useful with a remote reporter.
}

export function addBreadcrumb(
  _message: string,
  _category: string = 'app',
  _data?: Record<string, unknown>,
): void {
  // No-op: breadcrumbs are only useful with a remote reporter.
}
