/**
 * billingErrors.ts
 *
 * Maps Google Play BillingResponseCode values to user-facing messages.
 * These codes originate from the Kotlin BillingManager → BillingModule → NativeBilling bridge.
 *
 * Reference: https://developer.android.com/reference/com/android/billingclient/api/BillingClient.BillingResponseCode
 */

/** Google Play BillingResponseCode constants (mirrored from the Android SDK). */
export const BillingResponseCode = {
  SERVICE_TIMEOUT: -3,
  FEATURE_NOT_SUPPORTED: -2,
  SERVICE_DISCONNECTED: -1,
  OK: 0,
  USER_CANCELED: 1,
  SERVICE_UNAVAILABLE: 2,
  BILLING_UNAVAILABLE: 3,
  ITEM_UNAVAILABLE: 4,
  DEVELOPER_ERROR: 5,
  ERROR: 6,
  ITEM_ALREADY_OWNED: 7,
  ITEM_NOT_OWNED: 8,
  NETWORK_ERROR: 12,
} as const;

/**
 * User-facing messages keyed by BillingResponseCode.
 * `null` means the alert should be suppressed entirely (silent return).
 */
const BILLING_USER_MESSAGES: Record<number, string | null> = {
  [BillingResponseCode.USER_CANCELED]: null, // silent — user chose to dismiss
  [BillingResponseCode.ITEM_ALREADY_OWNED]: 'You already have an active subscription.',
  [BillingResponseCode.SERVICE_UNAVAILABLE]: 'Google Play is temporarily unavailable. Please try again in a few minutes.',
  [BillingResponseCode.SERVICE_DISCONNECTED]: 'Connection to Google Play was lost. Please try again.',
  [BillingResponseCode.BILLING_UNAVAILABLE]: 'Billing is not available on this device.',
  [BillingResponseCode.ITEM_UNAVAILABLE]: 'This subscription is not available right now.',
  [BillingResponseCode.DEVELOPER_ERROR]: 'Something went wrong. Please try again, or contact support.',
  [BillingResponseCode.ERROR]: 'Something went wrong. Please try again, or contact support.',
  [BillingResponseCode.NETWORK_ERROR]: 'Please check your internet connection and try again.',
  [BillingResponseCode.SERVICE_TIMEOUT]: 'Google Play took too long to respond. Please try again.',
  [BillingResponseCode.FEATURE_NOT_SUPPORTED]: 'This feature is not supported on your device.',
  [BillingResponseCode.ITEM_NOT_OWNED]: 'No active subscription was found.',
};

const GENERIC_BILLING_FALLBACK =
  'Something went wrong with your purchase. Please try again, or contact support if this keeps happening.';

/**
 * Returns a user-facing message for a given BillingResponseCode.
 *
 * - Returns `null` for USER_CANCELED → caller should silently return (no alert).
 * - Returns a friendly string for all other known codes.
 * - Returns a generic fallback for unknown codes.
 */
export function getUserFacingBillingMessage(code?: number): string | null {
  if (code === undefined || code === null) return GENERIC_BILLING_FALLBACK;
  if (code in BILLING_USER_MESSAGES) return BILLING_USER_MESSAGES[code];
  return GENERIC_BILLING_FALLBACK;
}

/**
 * Consistent fallback message for backend/network failures during purchase verification.
 * Used when fetch() to the verification endpoint fails or returns a non-OK status.
 */
export const PURCHASE_VERIFICATION_FALLBACK =
  "We couldn't complete your purchase. Please try again, or contact support if this keeps happening.";
