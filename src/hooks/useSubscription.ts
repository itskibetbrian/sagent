import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import nativeBilling, { NativeBillingState, NativeSubscriptionProduct } from '../services/nativeBilling';
import auth from '@react-native-firebase/auth';
import {
  getUserFacingBillingMessage,
  PURCHASE_VERIFICATION_FALLBACK,
  BillingResponseCode,
} from '../utils/billingErrors';

// Replace with your actual backend URL when deploying
const BACKEND_VERIFY_URL = 'https://your-backend.com/api/verify-purchase';

export interface UseSubscriptionResult {
  isAvailable: boolean;
  isPurchasing: boolean;
  billingState: NativeBillingState;
  products: NativeSubscriptionProduct[];
  purchase: (productId: string, offerToken: string) => Promise<void>;
  restorePurchases: () => Promise<void>;
}

/**
 * Sanitise a NativeBillingState error so that the `message` field
 * contains only a user-safe string. The raw native message is logged
 * to console.error for debugging.
 */
function sanitiseBillingError(state: NativeBillingState): NativeBillingState {
  if (state.status !== 'error') return state;

  // Log the raw native message for devs
  console.error('[Billing] Native error:', { message: state.message, code: state.code });

  // USER_CANCELED → silently reset to ready (no error state at all)
  if (state.code === BillingResponseCode.USER_CANCELED) {
    return { status: 'ready' };
  }

  const userMessage = getUserFacingBillingMessage(state.code);
  return {
    ...state,
    // userMessage is null only for USER_CANCELED, which is handled above
    message: userMessage ?? undefined,
  };
}

export function useSubscription(skus: string[]): UseSubscriptionResult {
  const [billingState, setBillingState] = useState<NativeBillingState>({ status: 'initializing' });
  const [products, setProducts] = useState<NativeSubscriptionProduct[]>([]);
  const [isPurchasing, setIsPurchasing] = useState(false);

  // Initialize and fetch subscriptions
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

    return () => {
      isMounted = false;
    };
  }, [skus]);

  // Listen for billing state changes and handle backend verification
  useEffect(() => {
    if (!nativeBilling.isAvailable() || Platform.OS !== 'android') return;

    let isMounted = true;

    const unsubscribe = nativeBilling.subscribe(async (state) => {
      if (!isMounted) return;

      // Sanitise before exposing to UI
      const safeState = sanitiseBillingError(state);
      setBillingState(safeState);

      if (safeState.status === 'error' || safeState.status === 'ready') {
        setIsPurchasing(false);
      }

      // Handle successful purchases
      if (state.status === 'subscribed' && state.purchases) {
        const unacknowledged = state.purchases.filter(p => !p.isAcknowledged);

        for (const purchase of unacknowledged) {
          try {
            const currentUser = auth().currentUser;
            if (!currentUser) throw new Error('User not authenticated');

            const idToken = await currentUser.getIdToken();

            // 1. Verify with Backend
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
              // Log the raw HTTP details for devs only
              console.error('[Billing] Backend verification failed:', {
                status: response.status,
                statusText: response.statusText,
                productId: purchase.productId,
              });
              throw new Error('Backend verification failed');
            }

            const data = await response.json();

            // 2. If valid, unlock premium and acknowledge
            // We rely on Firestore listener for actual entitlement state, 
            // but we can acknowledge the purchase natively.
            await nativeBilling.acknowledgePurchase(purchase.purchaseToken);
          } catch (error) {
            console.error('[Billing] Purchase verification/acknowledgement error:', error);
            // Surface a generic, user-safe fallback
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
  }, []);

  const purchase = useCallback(async (productId: string, offerToken: string) => {
    if (!nativeBilling.isAvailable()) {
      throw new Error('Billing is not available on this device.');
    }
    setIsPurchasing(true);
    try {
      await nativeBilling.launchPurchase(productId, offerToken);
      // The listener above will handle the rest of the flow
    } catch (error: any) {
      console.error('[Billing] launchPurchase error:', error);
      setIsPurchasing(false);

      // Map native error code to user-friendly message
      const code = error?.code ?? error?.userInfo?.code;
      const userMessage = getUserFacingBillingMessage(code);

      // USER_CANCELED → null → silent return (no throw)
      if (userMessage === null) return;

      throw new Error(userMessage);
    }
  }, []);

  const restorePurchases = useCallback(async () => {
    if (!nativeBilling.isAvailable()) {
      throw new Error('Billing is not available on this device.');
    }
    setIsPurchasing(true);
    try {
      await nativeBilling.initialize();
      const state = await nativeBilling.getCurrentState();
      
      if (state.status === 'subscribed') {
        // If there are purchases, verify them via backend logic again if needed,
        // or just rely on the listener logic picking them up.
      }
      setBillingState(sanitiseBillingError(state));
    } catch (error: any) {
      console.error('[Billing] restorePurchases error:', error);

      const code = error?.code ?? error?.userInfo?.code;
      const userMessage = getUserFacingBillingMessage(code);

      if (userMessage === null) return;

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
