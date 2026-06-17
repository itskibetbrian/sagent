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
  monthly: { label: 'Monthly', price: '...', period: '' },
  yearly: { label: 'Yearly', price: '...', period: '', badge: 'Save 25%' },
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
    period: getPeriodLabel(phase?.billingPeriod, fallback.label.toLowerCase() as PlanKey) ?? (phase?.formattedPrice ? (fallback.label === 'Monthly' ? '/month' : '/year') : fallback.period),
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
  } = useSubscription(Object.values(SUBSCRIPTION_SKUS));

  useEffect(() => {
    if (isCheckingPremium) return;

    if (isPro) {
      // We use settings screen as an example of gated area
        navigation.reset({
          index: 0,
          routes: [{ name: 'Main', params: { screen: 'Settings' } }],
        });
        return;
      }
  }, [isPro, isCheckingPremium, navigation]);

  useEffect(() => {
    if (billingState.status === 'subscribed') {
      Alert.alert(
        'Premium enabled',
        `Your plan is now active on this device.`
      );
      navigation.goBack();
    } else if (billingState.status === 'error' && billingState.message) {
      Toast.show({ type: 'error', text1: billingState.message });
    }
  }, [billingState.status, billingState.message, navigation]);

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

  const handlePurchase = async () => {
    // Auth Gate: If user is anonymous, force them to sign in to Google
    if (user?.isAnonymous) {
      setIsLinkingAuth(true);
      try {
        await signInWithGoogleAndLink();
      } catch (e) {
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
      Toast.show({ type: 'error', text1: 'Product not available on this device.' });
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
      Toast.show({ type: 'error', text1: error?.message ?? 'Purchase failed' });
    }
  };

  const handleRestore = async () => {
    if (!isAvailable) {
      Toast.show({ type: 'error', text1: 'Billing is not available on this device.' });
      return;
    }

    try {
      await restorePurchases();
      if (billingState.status === 'subscribed') {
        Alert.alert('Restore successful', 'Your premium subscription has been restored.');
        navigation.goBack();
      } else {
        Toast.show({ type: 'info', text1: 'No active subscription was found.' });
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: error?.message ?? 'Restore failed' });
    }
  };

  if (isCheckingPremium) {
    return null;
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <BrandIcon size={88} />
        <Text style={[styles.heroTitle, { color: theme.text }]}>Sagent Pro</Text>
        <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
          Save 4+ Hours a Month.
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
        (isPurchasing || isLinkingAuth) && styles.ctaDisabled,
      ]}
      onPress={() => void handlePurchase()}
      disabled={isPurchasing || isLinkingAuth}
      activeOpacity={0.85}
    >
      {isLinkingAuth ? (
        <View style={styles.loadingRow}>
          <LoaderCircle size={18} color={theme.onPrimary} style={{ transform: [{ rotate: '0deg' }] }} />
          <Text style={[styles.ctaText, { color: theme.onPrimary }]}>Signing In...</Text>
        </View>
      ) : isPurchasing ? (
        <View style={styles.loadingRow}>
            <LoaderCircle size={18} color={theme.onPrimary} style={{ transform: [{ rotate: '0deg' }] }} />
            <Text style={[styles.ctaText, { color: theme.onPrimary }]}>Processing...</Text>
          </View>
      ) : (
        <Text style={[styles.ctaText, { color: theme.onPrimary }]}>
          {user?.isAnonymous 
            ? `Sign in to Start ${active.label}` 
            : active.price === '...' 
              ? `Start ${active.label}` 
              : `Start ${active.label} — ${active.price}${active.period}`}
        </Text>
      )}
    </TouchableOpacity>

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



      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={[styles.dismiss, { backgroundColor: theme.surface, borderColor: theme.border }]}
        activeOpacity={0.75}
      >
        <X size={24} color={theme.text} strokeWidth={3} />
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
  restoreButton: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  restoreButtonText: { ...textFont('semibold'), fontSize: 15 },
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
  },
});

export default PaywallScreen;
