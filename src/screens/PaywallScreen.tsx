import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Check, LoaderCircle, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { textFont } from '../constants/typography';
import { useTheme } from '../hooks/useTheme';
import { BrandIcon } from '../components/common/BrandIcon';
import { db } from '../services/database';
import nativeBilling, {
  NativeBillingState,
  NativeSubscriptionOffer,
  NativeSubscriptionProduct,
} from '../services/nativeBilling';
import { syncPremiumStatusFromBilling } from '../services/premiumSync';

const BENEFITS = [
  'Reclaim 4+ Hours a Month — stop retyping the same messages. Send any message in under 10 seconds.',
  'Infinite Messages — never run out of space for your winning talk-tracks.',
  'No Watermark — send scripts without the "Sent via Sagent" tag. Professionalism only.',
];

// Billing prices must match the Google Play Console products exactly:
// monthly -> $9.99, yearly -> $89.99.
const SUBSCRIPTION_SKUS = {
  monthly: 'com.sagent.app.premium.monthly',
  yearly: 'com.sagent.app.premium.yearly',
} as const;

type PlanKey = keyof typeof SUBSCRIPTION_SKUS;

interface PlanConfig {
  label: string;
  price: string;
  period: string;
  badge?: string;
}

const FALLBACK_PLANS: Record<PlanKey, PlanConfig> = {
  monthly: { label: 'Monthly', price: '$9.99', period: '/month' },
  yearly: { label: 'Yearly', price: '$89.99', period: '/year', badge: 'Save 25%' },
};

const getPeriodLabel = (billingPeriod?: string | null, planKey?: PlanKey): string | null => {
  switch (billingPeriod) {
    case 'P1M':
      return '/month';
    case 'P1Y':
      return '/year';
    default:
      return null;
  }
};

const getPlanFromSubscription = (
  subscription: NativeSubscriptionProduct | undefined,
  fallback: PlanConfig
): PlanConfig => {
  if (!subscription) {
    return fallback;
  }

  const phase = subscription.offers.find(offer => offer.formattedPrice);

  return {
    ...fallback,
    price: phase?.formattedPrice ?? fallback.price,
    period: getPeriodLabel(phase?.billingPeriod, fallback.label.toLowerCase() as PlanKey) ?? fallback.period,
  };
};

export const PaywallScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const [plan, setPlan] = useState<PlanKey>('yearly');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [products, setProducts] = useState<NativeSubscriptionProduct[]>([]);
  const [billingState, setBillingState] = useState<NativeBillingState>({ status: 'initializing' });
  const [isCheckingPremium, setIsCheckingPremium] = useState(true);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const isPremium = (await db.getPreference('premium_enabled', 'false')) === 'true';
      if (!isMounted) {
        return;
      }

      if (isPremium) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Main', params: { screen: 'Settings' } }],
        });
        return;
      }

      setIsCheckingPremium(false);
    })();

    return () => {
      isMounted = false;
    };
  }, [navigation]);

  useEffect(() => {
    if (!nativeBilling.isAvailable() || Platform.OS !== 'android') {
      return;
    }

    let isMounted = true;
    const unsubscribe = nativeBilling.subscribe(async state => {
      if (!isMounted) {
        return;
      }

      setBillingState(state);

      if (state.status === 'subscribed') {
        try {
          await db.setPreference('premium_enabled', 'true');
          await db.setPreference('premium_prompt_seen', 'true');
          Alert.alert(
            'Premium enabled',
            `Your ${plan === 'yearly' ? 'yearly' : 'monthly'} plan is now active on this device.`
          );
          navigation.goBack();
        } catch (error: any) {
          Alert.alert('Purchase completed', error?.message ?? 'Premium was purchased, but setup did not finish cleanly.');
        } finally {
          setIsPurchasing(false);
        }
        return;
      }

      if (state.status === 'error') {
        setIsPurchasing(false);
        Alert.alert('Billing error', state.message ?? 'Google Play Billing encountered an error.');
        return;
      }

      if (state.status === 'ready') {
        setIsPurchasing(false);
      }
    });

    void (async () => {
      try {
        const currentState = await syncPremiumStatusFromBilling();
        if (!currentState) {
          throw new Error('Native billing is not available on this device.');
        }
        if (isMounted) setBillingState(currentState);

        const result = await nativeBilling.fetchSubscriptions(Object.values(SUBSCRIPTION_SKUS));
        if (isMounted) setProducts(result);
      } catch (error: any) {
        if (isMounted) {
          setBillingState({ status: 'error', message: error?.message });
          Alert.alert('Google Play unavailable', error?.message ?? 'Unable to load premium plans from Google Play.');
        }
      }
    })();

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [navigation, plan]);

  const subscriptionsBySku = useMemo(() => {
    return products.reduce<Record<string, NativeSubscriptionProduct>>((acc, subscription) => {
      acc[subscription.productId] = subscription;
      return acc;
    }, {});
  }, [products]);

  const plans = useMemo<Record<PlanKey, PlanConfig>>(
    () => ({
      monthly: getPlanFromSubscription(subscriptionsBySku[SUBSCRIPTION_SKUS.monthly], FALLBACK_PLANS.monthly),
      yearly: getPlanFromSubscription(subscriptionsBySku[SUBSCRIPTION_SKUS.yearly], FALLBACK_PLANS.yearly),
    }),
    [subscriptionsBySku]
  );

  const active = plans[plan];

  const purchase = async () => {
    if (!plan) {
      return;
    }

    if (Platform.OS !== 'android') {
      Alert.alert('Google Play only', 'This checkout flow is currently available in the Android app only.');
      return;
    }

    if (!nativeBilling.isAvailable()) {
      Alert.alert('Google Play unavailable', 'Native billing is not available right now.');
      return;
    }

    if (billingState.status === 'initializing') {
      Alert.alert('Google Play unavailable', 'Google Play is not ready yet. Please try again in a moment.');
      return;
    }

    const sku = SUBSCRIPTION_SKUS[plan];
    const subscription = subscriptionsBySku[sku];

    if (!subscription) {
      Alert.alert(
        'Plan not ready',
        'This plan is not available from Google Play yet. Add the matching subscription product in Play Console and try again.'
      );
      return;
    }

    const offer = subscription.offers.find((item: NativeSubscriptionOffer) => item.offerToken);
    const offerToken = offer?.offerToken ?? null;

    if (!offerToken) {
      Alert.alert('Plan not ready', 'This plan is missing a Google Play offer token.');
      return;
    }

    setIsPurchasing(true);
    try {
      await nativeBilling.launchPurchase(subscription.productId, offerToken);
    } catch (error: any) {
      setIsPurchasing(false);
      Alert.alert('Checkout failed', error?.message ?? 'Unable to open the Google Play purchase popup.');
    }
  };

  if (isCheckingPremium) {
    return null;
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <BrandIcon size={88} />
        <Text style={[styles.heroTitle, { color: theme.text }]}>Sagent Pro Closer</Text>
        <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
          Join the top 1% of closers.
        </Text>
      </View>

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

      <View style={styles.toggle}>
        {(['monthly', 'yearly'] as const).map(key => {
          const selectedPlan = plans[key];
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
                <View style={[styles.inlineBadge, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.badgeText, { color: theme.onPrimary }]}>{selectedPlan.badge}</Text>
                </View>
              ) : (
                <Text style={[styles.planLabel, { color: isActive ? theme.primary : theme.textSecondary }]}>
                  {selectedPlan.label}
                </Text>
              )}
              <Text style={[styles.planPrice, { color: theme.text }]}>{selectedPlan.price}</Text>
              <Text style={[styles.planPeriod, { color: isActive ? theme.primary : theme.textSecondary }]}>
                {selectedPlan.period}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[
          styles.cta,
          { backgroundColor: theme.primary, shadowColor: theme.primary },
          isPurchasing && styles.ctaDisabled,
        ]}
        onPress={() => void purchase()}
        disabled={isPurchasing}
        activeOpacity={0.85}
      >
        {isPurchasing ? (
          <View style={styles.loadingRow}>
            <LoaderCircle size={18} color={theme.onPrimary} style={{ transform: [{ rotate: '0deg' }] }} />
            <Text style={[styles.ctaText, { color: theme.onPrimary }]}>Processing...</Text>
          </View>
        ) : (
          <Text style={[styles.ctaText, { color: theme.onPrimary }]}>
            Start {active.label} — {active.price}{active.period}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={[styles.finePrint, { color: theme.textSecondary }]}>
        Sagent Pro Closer. Cancel anytime.
      </Text>

      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.dismiss}>
        <X size={20} color={theme.textMuted} />
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 60 },
  hero: { alignItems: 'center', marginVertical: 32, gap: 12 },
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
  badge: { position: 'absolute', top: 10, right: 10, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
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
  finePrint: { ...textFont('regular'), fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  dismiss: { position: 'absolute', top: 16, right: 16, padding: 8 },
});

export default PaywallScreen;
