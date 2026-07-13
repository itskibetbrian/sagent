import { db } from './database';
import nativeBilling, { NativeBillingState } from './nativeBilling';

const PREMIUM_ENABLED_KEY = 'premium_enabled';

/**
 * Read from the Firestore-backed SQLite preference which is the
 * authoritative source when a backend is configured.
 */
const applyBillingStateToPremium = async (state: NativeBillingState): Promise<void> => {
  // When BACKEND_VERIFY_URL is set the entitlement is managed server-side
  // via Firestore → useEntitlement → SQLite sync, so we skip local updates.
  // When no backend is configured we fall back to the local billing state.
  if (state.status === 'subscribed') {
    await db.setPreference(PREMIUM_ENABLED_KEY, 'true');
    return;
  }

  if (state.status === 'ready') {
    await db.setPreference(PREMIUM_ENABLED_KEY, 'false');
  }
};

export const syncPremiumStatusFromBilling = async (): Promise<NativeBillingState | null> => {
  if (!nativeBilling.isAvailable()) {
    return null;
  }

  await nativeBilling.initialize();
  const currentState = await nativeBilling.getCurrentState();
  await applyBillingStateToPremium(currentState);
  return currentState;
};

export const watchPremiumStatusFromBilling = (
  onState?: (state: NativeBillingState) => void
): (() => void) | null => {
  if (!nativeBilling.isAvailable()) {
    return null;
  }

  return nativeBilling.subscribe(state => {
    void applyBillingStateToPremium(state);
    onState?.(state);
  });
};

export default {
  syncPremiumStatusFromBilling,
  watchPremiumStatusFromBilling,
};
