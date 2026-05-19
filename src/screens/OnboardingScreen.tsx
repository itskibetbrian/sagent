// src/screens/OnboardingScreen.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db } from '../services/database';
import * as WebBrowser from 'expo-web-browser';
import { RootStackParamList } from '../types';
import { useTheme } from '../hooks/useTheme';
import { ANIMATION_DURATION } from '../constants';
import { textFont } from '../constants/typography';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export const OnboardingScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const { theme } = useTheme();
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: 'Meet Sagent',
      subtitle: 'Save the messages you send most often, then share them from one clean library.',
      accent: theme.primary,
      body: (
        <View style={styles.guideList}>
          <Text style={[styles.guideLine, { color: theme.text }]}>Tap any message card to open the native share sheet.</Text>
          <Text style={[styles.guideLine, { color: theme.text }]}>Use the clipboard icon when you only need a silent copy.</Text>
          <Text style={[styles.guideLine, { color: theme.text }]}>Long-press a message card when you want to edit it.</Text>
        </View>
      ),
    },
    {
      title: 'Start with examples',
      subtitle: 'Sagent includes ready-made Sales and Support messages on first launch.',
      accent: theme.success,
      body: (
        <View style={styles.guideList}>
          <Text style={[styles.guideLine, { color: theme.text }]}>Sales: price lists, payment links, thank-yous, follow-ups, and FAQs.</Text>
          <Text style={[styles.guideLine, { color: theme.text }]}>Support: issue received, troubleshooting steps, and resolved updates.</Text>
          <Text style={[styles.guideLine, { color: theme.text }]}>Create your own categories anytime from Messages.</Text>
        </View>
      ),
    },
    {
      title: 'Send faster',
      subtitle: 'Free Sagent includes 50 shared messages per month with a Sagent watermark.',
      accent: theme.primary,
      body: (
        <View style={styles.guideList}>
          <Text style={[styles.guideLine, { color: theme.text }]}>Premium unlocks unlimited folders and messages.</Text>
          <Text style={[styles.guideLine, { color: theme.text }]}>Premium shared messages send without the Sagent watermark.</Text>
          <Text style={[styles.guideLine, { color: theme.text }]}>Your messages and preferences stay stored locally on this device.</Text>
        </View>
      ),
    },
  ];

  const isLast = step === steps.length - 1;
  const current = steps[step];

  const handleNext = async () => {
    if (isLast) {
      await db.setPreference('onboarded', 'true');
      await db.setPreference('hasOnboarded', 'true');
      navigation.replace('Main');
      return;
    }

    setStep(prev => prev + 1);
  };

  const handleSkip = () => {
    setStep(steps.length - 1);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Animated.View
        key={step}
        entering={FadeInRight.duration(ANIMATION_DURATION.normal)}
        exiting={FadeOutLeft.duration(ANIMATION_DURATION.fast)}
        style={[styles.card, { backgroundColor: theme.surface, borderColor: current.accent }]}
      >
        <View style={[styles.accent, { backgroundColor: current.accent }]} />
        <Text style={[styles.title, { color: theme.text }]}>{current.title}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{current.subtitle}</Text>
        {current.body}
      </Animated.View>

      <View style={styles.dots}>
        {steps.map((item, index) => (
          <View
            key={item.title}
            style={[
              styles.dot,
              {
                backgroundColor: index === step ? current.accent : theme.border,
                width: index === step ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>

      <TouchableOpacity
        style={[styles.btn, { backgroundColor: current.accent }]}
        onPress={handleNext}
        activeOpacity={0.85}
      >
        <Text style={[styles.btnText, { color: theme.onPrimary }]}>{isLast ? 'Start sending' : 'Next'}</Text>
      </TouchableOpacity>

      {isLast && (
        <Text style={[styles.footerAgreement, { color: theme.textSecondary }]}>
          By continuing, you agree to our{' '}
          <Text 
            style={[styles.link, { color: theme.primary }]}
            onPress={() => WebBrowser.openBrowserAsync('https://sagent.app/terms')}
          >
            Terms of Service
          </Text>
          {' '}and{' '}
          <Text 
            style={[styles.link, { color: theme.primary }]}
            onPress={() => WebBrowser.openBrowserAsync('https://sagent.app/privacy')}
          >
            Privacy Policy
          </Text>
        </Text>
      )}

      {!isLast && (
        <TouchableOpacity onPress={handleSkip} style={styles.skip}>
          <Text style={[styles.skipText, { color: theme.textSecondary }]}>Skip</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 24,
    marginBottom: 32,
  },
  accent: {
    width: 54,
    height: 6,
    borderRadius: 999,
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    ...textFont('extrabold'),
    marginBottom: 12,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 18,
  },
  guideList: {
    gap: 12,
  },
  guideLine: {
    fontSize: 14,
    lineHeight: 21,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 28,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  btn: {
    width: '100%',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  btnText: {
    fontSize: 17,
    ...textFont('bold'),
  },
  skip: {
    padding: 8,
  },
  skipText: {
    fontSize: 15,
  },
  footerAgreement: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
    lineHeight: 18,
    ...textFont('regular'),
  },
  link: {
    textDecorationLine: 'underline',
    ...textFont('semibold'),
  },
});

export default OnboardingScreen;
