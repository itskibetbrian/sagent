import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import nativeBilling, { NativeBillingState, NativeSubscriptionProduct } from '../services/nativeBilling';
import auth from '@react-native-firebase/auth';

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

export function useSubscription(skus: string[]): UseSubscriptionResult {
  const [billingState, setBillingState] = useState<NativeBillingState>({ status: 'initializing' });
  const [products, setProducts] = useState<NativeSubscriptionProduct[]>([]);
  const [isPurchasing, setIsPurchasing] = useState(false);

  // Initialize and fetch subscriptions
  useEffect(() => {
    if (!nativeBilling.isAvailable() || Platform.OS !== 'android') {
      setBillingState({ status: 'error', message: 'Billing not available on this platform' });
      return;
    }

    let isMounted = true;

    const setup = async () => {
      try {
        await nativeBilling.initialize();
        const currentState = await nativeBilling.getCurrentState();
        if (isMounted) setBillingState(currentState);

        const fetchedProducts = await nativeBilling.fetchSubscriptions(skus);
        if (isMounted) setProducts(fetchedProducts);
      } catch (error: any) {
        if (isMounted) setBillingState({ status: 'error', message: error?.message });
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
      setBillingState(state);

      if (state.status === 'error' || state.status === 'ready') {
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
              throw new Error('Backend verification failed');
            }

            const data = await response.json();

            // 2. If valid, unlock premium and acknowledge
            // We rely on Firestore listener for actual entitlement state, 
            // but we can acknowledge the purchase natively.
            await nativeBilling.acknowledgePurchase(purchase.purchaseToken);
          } catch (error) {
            console.error('Failed to verify purchase with backend:', error);
            // Optional: Handle retry logic or alert user
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
      setIsPurchasing(false);
      throw error;
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
      setBillingState(state);
    } catch (error: any) {
      throw error;
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
