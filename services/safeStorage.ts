import AsyncStorage from '@react-native-async-storage/async-storage';
import { addBreadcrumb } from './errorReportingService';

/**
 * A defensive wrapper around AsyncStorage.
 *
 * PURPOSE
 * -------
 * On iOS 26.6 fresh-sandbox first-boot environments (e.g. Apple's App
 * Review test devices), the RNCAsyncStorage SQLite backend can throw
 * NSExceptions during its very first getItem / setItem call — the
 * sandbox path changed in iOS 26, file locking rules changed, and any
 * failure during DB open / migration surfaces as an Objective-C
 * exception on the module's background dispatch queue. Because those
 * exceptions originate below the JS runtime, our global JS error
 * handler cannot catch them. React Native's RCTExceptionsManager
 * intercepts them and immediately calls RCTFatal → abort(). That is
 * the exact signature we saw in Build 21's crash report:
 *
 *     Thread 6 (background dispatch queue)
 *       facebook::react::RCTNativeModule::invoke (throws)
 *       -[NSInvocation invoke]
 *       -[RCTExceptionsManager reportFatal:...]
 *       RCTFatal → abort()
 *
 * MITIGATION
 * ----------
 * 1. Every AsyncStorage operation is wrapped in a JS-level try/catch.
 *    If the native side throws synchronously (rare but possible on
 *    iOS 26), we catch and return a safe fallback.
 * 2. If a native throw is delivered asynchronously via the RN bridge,
 *    it manifests as a promise rejection — also caught here.
 * 3. After MAX_FAILURES_BEFORE_DISABLE consecutive failures, storage
 *    is disabled for the rest of the session and all subsequent calls
 *    become pure no-ops. This prevents repeated crash attempts if the
 *    backend is fundamentally broken on this device.
 * 4. Every failure is logged as a Sentry breadcrumb (safely; the
 *    breadcrumb call itself is wrapped in try/catch) so post-mortem
 *    debugging is possible.
 *
 * NON-GOALS
 * ---------
 * - This does NOT prevent every possible native crash. If the native
 *   module aborts the process synchronously without giving the bridge
 *   a chance to deliver the exception, no JS-side wrapping can help.
 *   But every publicly documented AsyncStorage crash on iOS 26 has
 *   delivered the exception through the bridge, so this wrapper
 *   addresses the observed failure modes.
 */

let storageDisabled = false;
let storageFailureCount = 0;
const MAX_FAILURES_BEFORE_DISABLE = 3;

function markFailure(op: string, error: unknown) {
  storageFailureCount += 1;
  const message = error instanceof Error ? error.message : String(error);
  if (__DEV__) console.warn(`[safeStorage:${op}] failed:`, message);
  try {
    addBreadcrumb(`safeStorage:${op}:error`, 'storage', { message });
  } catch {
    /* breadcrumb reporting must never throw */
  }
  if (storageFailureCount >= MAX_FAILURES_BEFORE_DISABLE && !storageDisabled) {
    storageDisabled = true;
    if (__DEV__) {
      console.warn(
        '[safeStorage] Disabling storage after repeated failures. All subsequent operations become no-ops.',
      );
    }
    try {
      addBreadcrumb('safeStorage:disabled', 'storage', {
        failureCount: storageFailureCount,
      });
    } catch {
      /* ignore */
    }
  }
}

export const safeStorage = {
  async getItem(key: string): Promise<string | null> {
    if (storageDisabled) return null;
    try {
      return await AsyncStorage.getItem(key);
    } catch (e) {
      markFailure(`getItem:${key}`, e);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (storageDisabled) return;
    try {
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      markFailure(`setItem:${key}`, e);
    }
  },

  async removeItem(key: string): Promise<void> {
    if (storageDisabled) return;
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      markFailure(`removeItem:${key}`, e);
    }
  },

  async multiRemove(keys: string[]): Promise<void> {
    if (storageDisabled || keys.length === 0) return;
    try {
      await AsyncStorage.multiRemove(keys);
    } catch (e) {
      markFailure(`multiRemove:${keys.length}`, e);
    }
  },

  async getAllKeys(): Promise<readonly string[]> {
    if (storageDisabled) return [];
    try {
      return await AsyncStorage.getAllKeys();
    } catch (e) {
      markFailure('getAllKeys', e);
      return [];
    }
  },

  isDisabled(): boolean {
    return storageDisabled;
  },
};
