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
let isIapInitialized = false;

/**
 * Runtime module loader. Metro's static analyser only recognises the
 * pattern `require('literal string')` as a bundling target — because
 * `name` here is a function parameter, Metro will NOT attempt to
 * statically resolve or pre-assign a module ID to `react-native-iap`.
 * That avoids the "Requiring unknown module <id>" runtime error we see
 * in Expo Go where the native module is not linked.
 */
function loadNativeIap(name: string): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(name);
  } catch {
    return null;
  }
}

function getIAPModule(): any {
  if (Platform.OS !== 'ios') return null;
  if (IS_EXPO_GO) return null;
  if (iapModule) return iapModule;

  // Assemble the package name at runtime so it never appears as a
  // literal argument to `require()` anywhere in the source Metro parses.
  const parts: string[] = [];
  parts.push('react');
  parts.push('native');
  parts.push('iap');
  const moduleName = parts.join('-');
  iapModule = loadNativeIap(moduleName);
  return iapModule;
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
