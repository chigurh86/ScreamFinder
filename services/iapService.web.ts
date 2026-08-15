// Web stub - Apple IAP is not available on web platform

export interface IAPProduct {
  productId: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  localizedPrice: string;
}

export type { IAPProduct as IAPProductType };

export interface IAPPurchase {
  productId: string;
  transactionId: string;
  transactionReceipt: string;
  transactionDate: number;
}

export const IAP_PRODUCT_ID = 'com.screamfinder.pro.yearly';

export async function initializeIAP(): Promise<boolean> {
  return false;
}

export async function getProducts(): Promise<IAPProduct[]> {
  return [];
}

export async function requestSubscription(): Promise<IAPPurchase | null> {
  return null;
}

export async function restorePurchases(): Promise<IAPPurchase[]> {
  return [];
}

export async function finishTransaction(_purchase: IAPPurchase): Promise<void> {
  // no-op on web
}

export async function endIAPConnection(): Promise<void> {
  // no-op on web
}

export function isIOSPlatform(): boolean {
  return false;
}
