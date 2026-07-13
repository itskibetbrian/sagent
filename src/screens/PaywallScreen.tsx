import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Check, LoaderCircle, X } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { textFont } from '../constants/typography';
import { useTheme } from '../hooks/useTheme';
import { BrandIcon } from '../components/common/BrandIcon';
import { useAuth } from '../providers/AuthProvider';
import { useEntitlement } from '../hooks/useEntitlement';
import { NativeSubscriptionProduct } from '../services/nativeBilling';
import { useSubscription } from '../hooks/useSubscription';

const BENEFITS = [
  'Reclaim 4+ Hours a Month — stop retyping the same messages. Send any message in under 10 seconds.',
  'Infinite Messages — never run out of space for your winning talk tracks.',
  'No Watermark — send scripts without the "Sent via Sagent" tag. Professionalism only.',
];

// Billing prices must match the Google Play Console products exactly:
// monthly -> $9.99, yearly -> $89.99.
const SUBSCRIPTION_SKUS = {
  monthly: 'com.sagent.app.premium.monthly',
  yearly: 'com.sagent.app.premium.yearly',
} as const;

// Hoisted so the array reference is stable across renders — prevents the
// useSubscription skus effect from firing on every re-render.
const SUBSCRIPTION_SKUS_LIST = Object.values(SUBSCRIPTION_SKUS) as string[];

type PlanKey = keyof typeof SUBSCRIPTION_SKUS;

interface PlanConfig {
  label: string;
  /** Displayed price — placeholder until real price is fetched */
  price: string;
  period: string;
  badge?: string;
}

// Hardcoded placeholder prices shown immediately (before any network fetch).
const PLACEHOLDER_PLANS: Record<PlanKey, PlanConfig> = {
  monthly: { label: 'Monthly', price: '$9.99', period: '/month' },
  yearly: { label: 'Yearly', price: '$89.99', period: '/year', badge: 'Save 25%' }, // badge recalculated from prices when products are loaded
};

const getPeriodLabel = (billingPeriod?: string | null): string | null => {
  switch (billingPeriod) {
    case 'P1M': return '/month';
    case 'P1Y': return '/year';
    default: return null;
  }
};

const mergePlanWithProduct = (
  base: PlanConfig,
  product: NativeSubscriptionProduct | undefined,
): PlanConfig => {
  if (!product) return base;
  const offer = product.offers.find(o => o.formattedPrice);
  if (!offer) return base;
  return {
    ...base,
    price: offer.formattedPrice ?? base.price,
    period: getPeriodLabel(offer.billingPeriod) ?? base.period,
  };
};

export const PaywallScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const [plan, setPlan] = useState<PlanKey>('yearly');
  const { user, signInWithGoogleAndLink } = useAuth();
  const { isPro, loading: isCheckingPremium } = useEntitlement();
  const [isLinkingAuth, setIsLinkingAuth] = useState(false);

  const {
    isAvailable,
    isPurchasing,
    billingState,
    products,
    purchase: launchPurchase,
    restorePurchases,
  } = useSubscription(SUBSCRIPTION_SKUS_LIST);

  // ── Redirect already-subscribed users away from the paywall ──────────────
  // Guard against calling goBack() before the screen is fully mounted/focused,
  // which corrupts the navigation stack on React Navigation 6.
  useEffect(() => {
    if (isCheckingPremium) return;
    if (!isPro) return;
    // Defer by one frame so the screen has finished mounting before we navigate
    const timer = setTimeout(() => {
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [isPro, isCheckingPremium, navigation]);

  // ── Handle successful purchase ────────────────────────────────────────────
  useEffect(() => {
    if (billingState.status !== 'subscribed') return;
    const timer = setTimeout(() => {
      Alert.alert('Premium enabled', 'Your plan is now active on this device.');
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [billingState.status, navigation]);

  // ── Build product lookup map ──────────────────────────────────────────────
  const subscriptionsBySku = useMemo(
    () => products.reduce<Record<string, NativeSubscriptionProduct>>((acc, p) => {
      acc[p.productId] = p;
      return acc;
    }, {}),
    [products],
  );

  // Merge fetched prices over the placeholders (if available).
  // Until products arrive the user always sees the hardcoded prices.
  const plans = useMemo<Record<PlanKey, PlanConfig>>(
    () => {
      const monthly = mergePlanWithProduct(PLACEHOLDER_PLANS.monthly, subscriptionsBySku[SUBSCRIPTION_SKUS.monthly]);
      const yearly = mergePlanWithProduct(PLACEHOLDER_PLANS.yearly, subscriptionsBySku[SUBSCRIPTION_SKUS.yearly]);
      // Recalculate the badge from actual prices if both are available
      if (subscriptionsBySku[SUBSCRIPTION_SKUS.monthly] && subscriptionsBySku[SUBSCRIPTION_SKUS.yearly]) {
        const monthlyPrice = monthly.price.replace(/[^0-9.]/g, '');
        const yearlyPrice = yearly.price.replace(/[^0-9.]/g, '');
        const monthlyNum = parseFloat(monthlyPrice);
        const yearlyNum = parseFloat(yearlyPrice);
        if (monthlyNum > 0 && yearlyNum > 0) {
          const yearlyPerMonth = yearlyNum / 12;
          const savings = Math.round((1 - yearlyPerMonth / monthlyNum) * 100);
          if (savings > 0) {
            yearly.badge = `Save ${savings}%`;
          }
        }
      }
      return { monthly, yearly };
    },
    [subscriptionsBySku],
  );

  const active = plans[plan];

  // ── Purchase ──────────────────────────────────────────────────────────────
  const handlePurchase = useCallback(async () => {
    // Auth gate: anonymous users must link a Google account first
    if (user?.isAnonymous) {
      setIsLinkingAuth(true);
      try {
        await signInWithGoogleAndLink();
      } catch {
        Toast.show({ type: 'error', text1: 'Sign in failed. Please try again.' });
        setIsLinkingAuth(false);
        return;
      }
      setIsLinkingAuth(false);
    }

    if (!isAvailable) {
      Toast.show({ type: 'error', text1: 'Billing is not available on this device.' });
      return;
    }

    const subscription = subscriptionsBySku[SUBSCRIPTION_SKUS[plan]];
    if (!subscription) {
      Toast.show({ type: 'error', text1: 'Product not available. Please try again in a moment.' });
      return;
    }

    const offer = subscription.offers[0];
    if (!offer) {
      Toast.show({ type: 'error', text1: 'No offer available for this product.' });
      return;
    }

    try {
      await launchPurchase(subscription.productId, offer.offerToken);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: error?.message ?? 'Purchase failed. Please try again.' });
    }
  }, [isAvailable, launchPurchase, plan, signInWithGoogleAndLink, subscriptionsBySku, user?.isAnonymous]);

  // ── Restore ───────────────────────────────────────────────────────────────
  const handleRestore = useCallback(async () => {
    if (!isAvailable) {
      Toast.show({ type: 'error', text1: 'Billing is not available on this device.' });
      return;
    }
    try {
      const freshState = await restorePurchases();
      if (freshState.status === 'subscribed') {
        Alert.alert('Restore successful', 'Your premium subscription has been restored.');
        if (navigation.canGoBack()) navigation.goBack();
      } else {
        Toast.show({ type: 'info', text1: 'No active subscription was found.' });
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: error?.message ?? 'Restore failed. Please try again.' });
    }
  }, [isAvailable, navigation, restorePurchases]);

  if (isCheckingPremium) {
    return <View style={[styles.container, { backgroundColor: theme.background }]} />;
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      {/* ── Dismiss button ── */}
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={[styles.dismiss, { backgroundColor: theme.surface, borderColor: theme.border }]}
        activeOpacity={0.75}
      >
        <X size={24} color={theme.text} strokeWidth={3} />
      </TouchableOpacity>

      {/* ── Hero ── */}
      <View style={styles.hero}>
        <BrandIcon size={88} />
        <Text style={[styles.heroTitle, { color: theme.text }]}>Sagent Pro</Text>
        <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
          Save 4+ Hours a Month.
        </Text>
      </View>

      {/* ── Benefits list ── */}
      <View style={[styles.benefitsList, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {BENEFITS.map(text => (
          <View key={text} style={styles.benefitRow}>
            <View style={[styles.checkCircle, { backgroundColor: `${theme.success}20` }]}>
              <Check size={14} color={theme.success} strokeWidth={2.5} />
            </View>
            <Text style={[styles.benefitText, { color: theme.text }]}>{text}</Text>
          </View>
        ))}
      </View>

      {/* ── Plan toggle ── */}
      <View style={styles.toggle}>
        {(['monthly', 'yearly'] as const).map(key => {
          const p = plans[key];
          const isActive = plan === key;
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.planCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
                isActive && { borderColor: theme.primary, backgroundColor: theme.surfaceAlt },
              ]}
              onPress={() => setPlan(key)}
              activeOpacity={0.82}
            >
              {key === 'yearly' ? (
                <>
                  {p.badge && (
                    <View style={[styles.inlineBadge, { backgroundColor: theme.primary }]}>
                      <Text style={[styles.badgeText, { color: theme.onPrimary }]}>{p.badge}</Text>
                    </View>
                  )}
                  <Text style={[styles.planLabel, { color: isActive ? theme.primary : theme.textSecondary }]}>
                    {p.label}
                  </Text>
                </>
              ) : (
                <Text style={[styles.planLabel, { color: isActive ? theme.primary : theme.textSecondary }]}>
                  {p.label}
                </Text>
              )}
              <Text style={[styles.planPrice, { color: theme.text }]}>{p.price}</Text>
              <Text style={[styles.planPeriod, { color: isActive ? theme.primary : theme.textSecondary }]}>
                {p.period}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── CTA ── */}
      <TouchableOpacity
        style={[
          styles.cta,
          { backgroundColor: theme.primary, shadowColor: theme.primary },
          (isPurchasing || isLinkingAuth) && styles.ctaDisabled,
        ]}
        onPress={() => void handlePurchase()}
        disabled={isPurchasing || isLinkingAuth}
        activeOpacity={0.85}
      >
        {isLinkingAuth ? (
          <View style={styles.loadingRow}>
            <LoaderCircle size={18} color={theme.onPrimary} />
            <Text style={[styles.ctaText, { color: theme.onPrimary }]}>Signing In...</Text>
          </View>
        ) : isPurchasing ? (
          <View style={styles.loadingRow}>
            <LoaderCircle size={18} color={theme.onPrimary} />
            <Text style={[styles.ctaText, { color: theme.onPrimary }]}>Processing...</Text>
          </View>
        ) : (
          <Text style={[styles.ctaText, { color: theme.onPrimary }]}>
            {user?.isAnonymous
              ? `Sign in to Start ${active.label}`
              : `Start ${active.label} — ${active.price}${active.period}`}
          </Text>
        )}
      </TouchableOpacity>

      {/* ── Restore ── */}
      <TouchableOpacity
        onPress={() => void handleRestore()}
        style={[styles.restoreButton, { borderColor: theme.border }]}
        activeOpacity={0.85}
        disabled={isPurchasing}
      >
        <Text style={[styles.restoreButtonText, { color: theme.text }]}>Restore purchase</Text>
      </TouchableOpacity>

      <Text style={[styles.finePrint, { color: theme.textSecondary }]}>
        Sagent Pro. Cancel anytime.
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 64, paddingBottom: 60 },
  dismiss: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  hero: { alignItems: 'center', marginBottom: 28, gap: 12 },
  heroTitle: { ...textFont('bold'), fontSize: 30 },
  heroSubtitle: { ...textFont('regular'), fontSize: 17, textAlign: 'center', lineHeight: 27 },
  benefitsList: { borderRadius: 20, borderWidth: 1, padding: 20, gap: 16, marginBottom: 28 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  checkCircle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  benefitText: { ...textFont('regular'), fontSize: 16, flex: 1, lineHeight: 23 },
  toggle: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  planCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 12,
    alignItems: 'center',
    gap: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  inlineBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: { ...textFont('semibold'), fontSize: 11 },
  planLabel: { ...textFont('semibold'), fontSize: 13, marginBottom: 4 },
  planPrice: { ...textFont('bold'), fontSize: 20 },
  planPeriod: { ...textFont('regular'), fontSize: 11 },
  cta: {
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
    marginBottom: 16,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { ...textFont('bold'), fontSize: 17 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  restoreButton: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  restoreButtonText: { ...textFont('semibold'), fontSize: 15 },
  finePrint: { ...textFont('regular'), fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
});

export default PaywallScreen;
