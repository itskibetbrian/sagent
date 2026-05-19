import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

// Play Console prices must match Sagent's paywall exactly:
// monthly subscription product -> $9.99, yearly subscription product -> $89.99.

export type NativeBillingStatus =
  | 'initializing'
  | 'ready'
  | 'purchasing'
  | 'subscribed'
  | 'error';

export interface NativeBillingState {
  status: NativeBillingStatus;
  message?: string;
  code?: number;
}

export interface NativeSubscriptionOffer {
  basePlanId?: string | null;
  offerId?: string | null;
  offerToken: string;
  formattedPrice?: string | null;
  billingPeriod?: string | null;
  priceAmountMicros?: number | null;
  priceCurrencyCode?: string | null;
  recurrenceMode?: number | null;
}

export interface NativeSubscriptionProduct {
  productId: string;
  name?: string;
  title?: string;
  description?: string;
  productType?: string;
  offers: NativeSubscriptionOffer[];
}

type BillingNativeModule = {
  initialize(): Promise<void>;
  fetchSubscriptions(productIds: string[]): Promise<NativeSubscriptionProduct[]>;
  launchPurchase(productId: string, offerToken: string): Promise<void>;
  getCurrentState(): Promise<NativeBillingState>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

const moduleRef = NativeModules.BillingModule as BillingNativeModule | undefined;

const emitter =
  Platform.OS === 'android' && moduleRef
    ? new NativeEventEmitter(moduleRef as never)
    : null;

export const nativeBilling = {
  isAvailable(): boolean {
    return Platform.OS === 'android' && Boolean(moduleRef);
  },

  async initialize(): Promise<void> {
    if (!moduleRef) throw new Error('Native billing is not available on this device.');
    await moduleRef.initialize();
  },

  async fetchSubscriptions(productIds: string[]): Promise<NativeSubscriptionProduct[]> {
    if (!moduleRef) throw new Error('Native billing is not available on this device.');
    return moduleRef.fetchSubscriptions(productIds);
  },

  async launchPurchase(productId: string, offerToken: string): Promise<void> {
    if (!moduleRef) throw new Error('Native billing is not available on this device.');
    await moduleRef.launchPurchase(productId, offerToken);
  },

  async getCurrentState(): Promise<NativeBillingState> {
    if (!moduleRef) return { status: 'error', message: 'Native billing unavailable' };
    return moduleRef.getCurrentState();
  },

  subscribe(listener: (state: NativeBillingState) => void): (() => void) | null {
    if (!emitter) return null;
    const subscription = emitter.addListener('billingStateChanged', listener);
    return () => subscription.remove();
  },
};

export default nativeBilling;
