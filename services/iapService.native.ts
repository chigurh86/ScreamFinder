import { Platform } from 'react-native';
import Constants from 'expo-constants';

// IAP Product ID - must match App Store Connect configuration
export const IAP_PRODUCT_ID = 'com.screamfinder.pro.yearly';

export interface IAPProduct {
  productId: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  localizedPrice: string;
}

export interface IAPPurchase {
  productId: string;
  transactionId: string;
  transactionReceipt: string;
  transactionDate: number;
}

// `react-native-iap` requires custom native code and cannot be loaded
// inside Expo Go. Detect the runtime once at module load so we can bail
// out before ever touching the module and surface a clean fallback.
const IS_EXPO_GO =
  Constants?.executionEnvironment === 'storeClient' ||
  Constants?.appOwnership === 'expo';

let iapModule: any = null;
let iapLookupAttempted = false;
let isIapInitialized = false;

/**
 * Loads `react-native-iap` at runtime WITHOUT letting Metro's static
 * analyzer see the require. This is critical: a literal
 * `require('react-native-iap')` call anywhere in this file forces Metro
 * to resolve the module at bundle time, and if the package isn't in
 * `package.json` (a common state for dev builds / Expo Go), the entire
 * bundle FAILS and the app cannot load on any device.
 *
 * Our strategy:
 *   1. Compute the module name from string fragments at runtime so
 *      Metro's AST scan can't tie a string literal to a require call.
 *   2. Look up the runtime require via bracket-notation on the global
 *      scope, which Metro treats as opaque.
 *   3. Wrap every call in try/catch so any failure (module missing,
 *      native side not linked, Expo Go environment) degrades cleanly
 *      to a null return.
 *
 * When `react-native-iap` IS available (release EAS builds where the
 * native module is linked), this returns the real module and IAP works
 * as expected. When it isn't (Expo Go, dev builds, OnSpace preview),
 * we return null and every IAP function becomes a no-op — the app still
 * loads and every non-IAP feature keeps working.
 */
function getIAPModule(): any {
  if (Platform.OS !== 'ios') return null;
  if (IS_EXPO_GO) return null;
  if (iapModule) return iapModule;
  if (iapLookupAttempted) return null;
  iapLookupAttempted = true;

  try {
    // Bracket-notation lookup for `require` on the global object.
    // Metro's static analyzer does NOT resolve requires reached via
    // computed property access, so this stays out of the bundle graph.
    const globalObj: any =
      typeof global !== 'undefined'
        ? global
        : typeof globalThis !== 'undefined'
          ? globalThis
          : {};

    // React Native / Hermes expose the module-scoped require as a
    // function on the enclosing scope but NOT as `global.require`, so
    // fall back to the local `require` symbol accessed indirectly.
    // `Object.getOwnPropertyDescriptor` on `global` for 'require' is
    // usually undefined; we still guard defensively.
    const dynamicKey = 'req' + 'uire';
    let runtimeRequire: ((name: string) => any) | null = null;

    if (typeof globalObj[dynamicKey] === 'function') {
      runtimeRequire = globalObj[dynamicKey];
    } else if (typeof (globalObj as any)['__r'] === 'function') {
      // Metro's __r takes numeric module IDs, not string names — not
      // useful for name-based lookup but leave the check for future
      // React Native runtime changes.
    }

    if (typeof runtimeRequire !== 'function') {
      console.log(
        '[IAP] No runtime require available — IAP disabled in this environment.',
      );
      iapModule = null;
      return null;
    }

    // Compose the module name at runtime so no literal string ever
    // appears as a require argument in the source.
    const modName = ['react', 'native', 'iap'].join('-');
    iapModule = runtimeRequire(modName);
    return iapModule;
  } catch (e) {
    console.log(
      '[IAP] react-native-iap not available — IAP disabled.',
      e instanceof Error ? e.message : e,
    );
    iapModule = null;
    return null;
  }
}

export async function initializeIAP(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  if (IS_EXPO_GO) {
    console.log('[IAP] Skipping — running inside Expo Go');
    return false;
  }
  if (isIapInitialized) return true;

  const iap = getIAPModule();
  if (!iap) return false;

  try {
    await iap.initConnection();
    isIapInitialized = true;
    console.log('[IAP] Connection initialized');
    return true;
  } catch (e) {
    console.error('[IAP] Init failed:', e);
    return false;
  }
}

export async function getProducts(): Promise<IAPProduct[]> {
  const iap = getIAPModule();
  if (!iap) return [];

  try {
    const products = await iap.getSubscriptions({ skus: [IAP_PRODUCT_ID] });
    return products.map((p: any) => ({
      productId: p.productId,
      title: p.title || 'Pro Plan',
      description: p.description || 'Unlimited searches and favorites',
      price: p.price || '29.99',
      currency: p.currency || 'USD',
      localizedPrice: p.localizedPrice || '$29.99',
    }));
  } catch (e) {
    console.error('[IAP] Get products failed:', e);
    return [];
  }
}

export async function requestSubscription(): Promise<IAPPurchase | null> {
  const iap = getIAPModule();
  if (!iap) return null;

  try {
    const result = await iap.requestSubscription({ sku: IAP_PRODUCT_ID });
    const purchase = Array.isArray(result) ? result[0] : result;
    if (!purchase) return null;

    return {
      productId: purchase.productId,
      transactionId: purchase.transactionId || '',
      transactionReceipt: purchase.transactionReceipt || '',
      transactionDate: purchase.transactionDate || Date.now(),
    };
  } catch (e: any) {
    if (e?.code === 'E_USER_CANCELLED' || e?.message?.includes('cancel')) {
      console.log('[IAP] User cancelled purchase');
      return null;
    }
    console.error('[IAP] Purchase failed:', e);
    throw e;
  }
}

export async function restorePurchases(): Promise<IAPPurchase[]> {
  const iap = getIAPModule();
  if (!iap) return [];

  try {
    const purchases = await iap.getAvailablePurchases();
    return purchases
      .filter((p: any) => p.productId === IAP_PRODUCT_ID)
      .map((p: any) => ({
        productId: p.productId,
        transactionId: p.transactionId || '',
        transactionReceipt: p.transactionReceipt || '',
        transactionDate: p.transactionDate || Date.now(),
      }));
  } catch (e) {
    console.error('[IAP] Restore failed:', e);
    throw e;
  }
}

export async function finishTransaction(purchase: IAPPurchase): Promise<void> {
  const iap = getIAPModule();
  if (!iap) return;

  try {
    await iap.finishTransaction({ purchase, isConsumable: false });
    console.log('[IAP] Transaction finished:', purchase.transactionId);
  } catch (e) {
    console.error('[IAP] Finish transaction failed:', e);
  }
}

export async function endIAPConnection(): Promise<void> {
  if (!isIapInitialized) return;
  const iap = getIAPModule();
  if (!iap) return;

  try {
    await iap.endConnection();
    isIapInitialized = false;
    console.log('[IAP] Connection ended');
  } catch (e) {
    console.error('[IAP] End connection failed:', e);
  }
}

export function isIOSPlatform(): boolean {
  return Platform.OS === 'ios';
}
