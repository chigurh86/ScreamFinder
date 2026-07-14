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
 * Loads `react-native-iap` with a literal require wrapped in try/catch.
 * The IS_EXPO_GO guard above ensures we never hit this on Expo Go, where
 * the native module isn't linked. In EAS-built binaries the module is
 * present and this succeeds cleanly.
 *
 * NOTE: Metro's newer static analyser rejects `require(variable)`, so we
 * MUST pass a literal string here. Bundling is guarded by the try/catch
 * in case the package isn't installed on a particular build target.
 */
function getIAPModule(): any {
  if (Platform.OS !== 'ios') return null;
  if (IS_EXPO_GO) return null;
  if (iapModule) return iapModule;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    iapModule = require('react-native-iap');
  } catch {
    iapModule = null;
  }
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
