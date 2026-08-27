import { Platform } from 'react-native';
import { safeStorage } from './safeStorage';
import { getSupabaseClient } from '@/template';

/**
 * Known-benign Supabase auth error fragments that occur when a stored
 * refresh token expires or was invalidated (e.g. user cleared cookies,
 * or Supabase rotated tokens on the server). These are handled
 * internally by Supabase (which clears the local session) but the raw
 * console.error surfaces them in the Expo LogBox overlay, causing
 * confusing red-screen "Uncaught Error" popups in dev.
 *
 * Once a refresh fails, Supabase already discards the bad tokens, so
 * a subsequent render behaves as if the user is signed out — exactly
 * what we want.
 */
const BENIGN_AUTH_ERROR_FRAGMENTS = [
  'Invalid Refresh Token',
  'Refresh Token Not Found',
  'refresh_token_not_found',
  'Auth session missing',
  'AuthSessionMissingError',
  'AuthApiError: Invalid Refresh Token',
];

let suppressed = false;

function serializeArg(arg: unknown): string {
  if (arg === null || arg === undefined) return '';
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

function isBenignAuthError(args: unknown[]): boolean {
  try {
    const combined = args.map(serializeArg).join(' ');
    return BENIGN_AUTH_ERROR_FRAGMENTS.some((f) => combined.includes(f));
  } catch {
    return false;
  }
}

/**
 * Wrap `console.error` so known-benign Supabase auth errors do not
 * trigger the Expo LogBox overlay in development. All other errors
 * pass through untouched.
 *
 * Also triggers a background cleanup of the stored session so the
 * next initialization doesn't re-fire the same error.
 */
export function suppressBenignAuthErrors(): void {
  if (suppressed) return;
  suppressed = true;

  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (isBenignAuthError(args)) {
      // Fire-and-forget cleanup; never throws.
      void clearStaleAuthTokens();
      // Downgrade to a plain log so it isn't picked up by LogBox.
      if (__DEV__) {
        console.log('[Auth] Cleared stale Supabase refresh token.');
      }
      return;
    }
    originalError(...args);
  };
}

/**
 * Best-effort removal of any stored Supabase session tokens. Runs in
 * two passes: (1) ask the Supabase client to sign out locally, and
 * (2) manually strip any leftover `sb-*-auth-token` keys from
 * AsyncStorage / localStorage. Every step is wrapped in try/catch so
 * it can safely be invoked from an error handler.
 */
export async function clearStaleAuthTokens(): Promise<void> {
  // Pass 1: use the Supabase client to sign out locally if available.
  try {
    const supabase = getSupabaseClient();
    // `scope: 'local'` only clears the client-side session; it does not
    // attempt to hit the network (which would fail again with an
    // invalid refresh token).
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  } catch {
    // Client may not be initialized yet; fall through to manual cleanup.
  }

  // Pass 2: manually purge any Supabase auth keys from storage.
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      const keys = Object.keys(window.localStorage);
      keys.forEach((k) => {
        if (k.startsWith('sb-') && k.includes('-auth-token')) {
          try {
            window.localStorage.removeItem(k);
          } catch {
            /* ignore */
          }
        }
      });
    } else {
      const keys = await safeStorage.getAllKeys();
      const authKeys = keys.filter(
        (k) => k.startsWith('sb-') && k.includes('-auth-token')
      );
      if (authKeys.length > 0) {
        await safeStorage.multiRemove(authKeys);
      }
    }
  } catch {
    /* ignore */
  }
}
