import { Platform } from 'react-native';

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

let iapModule: any = null;
let isIapInitialized = false;

async function getIAP() {
  if (Platform.OS !== 'ios') return null;
  if (iapModule) return iapModule;

  try {
    iapModule = require('react-native-iap');
    return iapModule;
  } catch (e) {
    console.log('[IAP] react-native-iap not available:', e);
    return null;
  }
}

export async function initializeIAP(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  if (isIapInitialized) return true;

  try {
    const iap = await getIAP();
    if (!iap) return false;

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
  if (Platform.OS !== 'ios') return [];

  try {
    const iap = await getIAP();
    if (!iap) return [];

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
  if (Platform.OS !== 'ios') return null;

  try {
    const iap = await getIAP();
    if (!iap) return null;

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
  if (Platform.OS !== 'ios') return [];

  try {
    const iap = await getIAP();
    if (!iap) return [];

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
  if (Platform.OS !== 'ios') return;

  try {
    const iap = await getIAP();
    if (!iap) return;

    await iap.finishTransaction({ purchase, isConsumable: false });
    console.log('[IAP] Transaction finished:', purchase.transactionId);
  } catch (e) {
    console.error('[IAP] Finish transaction failed:', e);
  }
}

export async function endIAPConnection(): Promise<void> {
  if (Platform.OS !== 'ios' || !isIapInitialized) return;

  try {
    const iap = await getIAP();
    if (!iap) return;

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
