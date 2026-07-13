import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import nativeBilling, { NativeBillingState, NativeSubscriptionProduct } from '../services/nativeBilling';
import auth from '@react-native-firebase/auth';
import {
  getUserFacingBillingMessage,
  PURCHASE_VERIFICATION_FALLBACK,
  BillingResponseCode,
} from '../utils/billingErrors';

// Set this to your real backend verification endpoint before releasing to production.
// Configure via app.json under expo.extra.backendVerifyUrl — no code change needed.
// Leave empty to skip server-side verification (acceptable for development only).
let _backendVerifyUrl: string | undefined;
try {
  // Read from app.json extra config at build time.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  _backendVerifyUrl = require('../../app.json')?.expo?.extra?.backendVerifyUrl;
} catch { /* ignore */ }
const BACKEND_VERIFY_URL: string = (_backendVerifyUrl && typeof _backendVerifyUrl === 'string')
  ? _backendVerifyUrl
  : '';

export interface UseSubscriptionResult {
  isAvailable: boolean;
  isPurchasing: boolean;
  billingState: NativeBillingState;
  products: NativeSubscriptionProduct[];
  purchase: (productId: string, offerToken: string) => Promise<void>;
  // Returns the billing state observed after the restore attempt so callers
  // can read the correct (non-stale) status without relying on React state.
  restorePurchases: () => Promise<NativeBillingState>;
}

/**
 * Sanitise a NativeBillingState error so that the `message` field
 * contains only a user-safe string. The raw native message is logged
 * to console.error for debugging.
 */
function sanitiseBillingError(state: NativeBillingState): NativeBillingState {
  if (state.status !== 'error') return state;

  console.error('[Billing] Native error:', { message: state.message, code: state.code });

  // USER_CANCELED → silently reset to ready (no error shown to the user)
  if (state.code === BillingResponseCode.USER_CANCELED) {
    return { status: 'ready' };
  }

  const userMessage = getUserFacingBillingMessage(state.code);
  return {
    ...state,
    message: userMessage ?? undefined,
  };
}

export function useSubscription(skus: string[]): UseSubscriptionResult {
  const [billingState, setBillingState] = useState<NativeBillingState>({ status: 'initializing' });
  const [products, setProducts] = useState<NativeSubscriptionProduct[]>([]);
  const [isPurchasing, setIsPurchasing] = useState(false);

  // ── Initialise billing and fetch product catalogue ──────────────────────
  useEffect(() => {
    if (!nativeBilling.isAvailable() || Platform.OS !== 'android') {
      setBillingState({ status: 'error', message: 'Billing is not available on this device.' });
      return;
    }

    let isMounted = true;

    const setup = async () => {
      try {
        await nativeBilling.initialize();
        const currentState = await nativeBilling.getCurrentState();
        if (isMounted) setBillingState(sanitiseBillingError(currentState));

        const fetchedProducts = await nativeBilling.fetchSubscriptions(skus);
        if (isMounted) setProducts(fetchedProducts);
      } catch (error: any) {
        console.error('[Billing] Setup failed:', error);
        if (isMounted) {
          const userMessage = getUserFacingBillingMessage(error?.code);
          setBillingState({
            status: 'error',
            message: userMessage ?? 'Something went wrong. Please try again, or contact support.',
          });
        }
      }
    };

    void setup();

    return () => { isMounted = false; };
  }, [skus]);

  // ── Listen for billing state changes and handle acknowledgement ──────────
  useEffect(() => {
    if (!nativeBilling.isAvailable() || Platform.OS !== 'android') return;

    let isMounted = true;

    const unsubscribe = nativeBilling.subscribe(async (state) => {
      if (!isMounted) return;

      const safeState = sanitiseBillingError(state);
      setBillingState(safeState);

      if (safeState.status === 'error' || safeState.status === 'ready') {
        setIsPurchasing(false);
      }

      // ── Acknowledge unacknowledged purchases ─────────────────────────────
      if (state.status === 'subscribed' && state.purchases) {
        const unacknowledged = state.purchases.filter(p => !p.isAcknowledged);

        for (const purchase of unacknowledged) {
          try {
            if (BACKEND_VERIFY_URL) {
              // ── Server-side verification (production) ──────────────────
              const currentUser = auth().currentUser;
              if (!currentUser) throw new Error('User not authenticated');

              const idToken = await currentUser.getIdToken();

              const response = await fetch(BACKEND_VERIFY_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                  uid: currentUser.uid,
                  purchaseToken: purchase.purchaseToken,
                  productId: purchase.productId,
                }),
              });

              if (!response.ok) {
                console.error('[Billing] Backend verification failed:', {
                  status: response.status,
                  statusText: response.statusText,
                  productId: purchase.productId,
                });
                throw new Error('Backend verification failed');
              }
            } else {
              // ── No backend — acknowledge directly ──────────────────────
              // Without a backend the Firestore entitlement document must be
              // written manually or via a Google Play RTDN webhook later.
              // We still acknowledge with Google Play so the purchase is not
              // auto-refunded after 3 days.
              console.warn(
                '[Billing] BACKEND_VERIFY_URL is not set. ' +
                'Acknowledging purchase without server verification. ' +
                'Set BACKEND_VERIFY_URL before production release.'
              );
            }

            await nativeBilling.acknowledgePurchase(purchase.purchaseToken);
          } catch (error) {
            console.error('[Billing] Purchase verification/acknowledgement error:', error);
            if (isMounted) {
              setBillingState({
                status: 'error',
                message: PURCHASE_VERIFICATION_FALLBACK,
              });
            }
          }
        }

        setIsPurchasing(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [skus]);

  // ── purchase ─────────────────────────────────────────────────────────────
  const purchase = useCallback(async (productId: string, offerToken: string) => {
    if (!nativeBilling.isAvailable()) {
      throw new Error('Billing is not available on this device.');
    }
    setIsPurchasing(true);
    try {
      await nativeBilling.launchPurchase(productId, offerToken);
      // The subscriber above handles the rest of the flow.
    } catch (error: any) {
      console.error('[Billing] launchPurchase error:', error);
      setIsPurchasing(false);

      const code = error?.code ?? error?.userInfo?.code;
      const userMessage = getUserFacingBillingMessage(code);

      if (userMessage === null) return; // USER_CANCELED — silent
      throw new Error(userMessage);
    }
  }, []);

  // ── restorePurchases ─────────────────────────────────────────────────────
  // Returns the freshly-fetched NativeBillingState so callers can check
  // the result synchronously without reading stale React state.
  const restorePurchases = useCallback(async (): Promise<NativeBillingState> => {
    if (!nativeBilling.isAvailable()) {
      throw new Error('Billing is not available on this device.');
    }
    setIsPurchasing(true);
    try {
      await nativeBilling.initialize();
      const state = await nativeBilling.getCurrentState();
      const safeState = sanitiseBillingError(state);
      setBillingState(safeState);
      return safeState; // ← return so callers don't read stale closure state
    } catch (error: any) {
      console.error('[Billing] restorePurchases error:', error);

      const code = error?.code ?? error?.userInfo?.code;
      const userMessage = getUserFacingBillingMessage(code);

      if (userMessage === null) return { status: 'ready' }; // USER_CANCELED — silent
      throw new Error(userMessage);
    } finally {
      setIsPurchasing(false);
    }
  }, []);

  return {
    isAvailable: nativeBilling.isAvailable() && Platform.OS === 'android',
    isPurchasing,
    billingState,
    products,
    purchase,
    restorePurchases,
  };
}
