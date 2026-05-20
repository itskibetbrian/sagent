// src/navigation/RootNavigator.tsx

import React, { useEffect, useState } from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, LogBox, StyleSheet, StatusBar } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { db } from '../services/database';
import { RootStackParamList } from '../types';

import OnboardingScreen from '../screens/OnboardingScreen';
import AddSnippetScreen from '../screens/AddSnippetScreen';
import PaywallScreen from '../screens/PaywallScreen';
import ManageCategoriesScreen from '../screens/ManageCategoriesScreen';
import MainTabNavigator from './MainTabNavigator';
import { SnippetsProvider } from '../hooks/useSnippets';
import { CategoriesProvider } from '../hooks/useCategories';
import { useTheme } from '../hooks/useTheme';
import { syncPremiumStatusFromBilling, watchPremiumStatusFromBilling } from '../services/premiumSync';
import { textFont } from '../constants/typography';

// Ignore specific warnings if necessary
LogBox.ignoreLogs(['Non-serializable values were found in the navigation state']);

const Stack = createNativeStackNavigator<RootStackParamList>();

const LaunchSplash = ({ backgroundColor, surfaceColor, skeletonColor }: {
  backgroundColor: string;
  surfaceColor: string;
  skeletonColor: string;
}) => {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <View style={[splashStyles.container, { backgroundColor }]}>
      <StatusBar barStyle={backgroundColor === '#14131C' ? 'light-content' : 'dark-content'} backgroundColor={backgroundColor} />
      <View style={[splashStyles.headerRow, { backgroundColor: surfaceColor }]}>
        <View style={[splashStyles.headerTitle, { backgroundColor: skeletonColor }]} />
        <View style={[splashStyles.headerAction, { backgroundColor: skeletonColor }]} />
      </View>
      <View style={[splashStyles.searchBar, { backgroundColor: surfaceColor }]}>
        <View style={[splashStyles.searchLine, { backgroundColor: skeletonColor }]} />
      </View>
      <View style={splashStyles.chipRow}>
        {[104, 82, 96].map(width => (
          <View key={width} style={[splashStyles.chip, { width, backgroundColor: surfaceColor }]}>
            <View style={[splashStyles.chipLine, { backgroundColor: skeletonColor }]} />
          </View>
        ))}
      </View>
      {[0, 1, 2].map(item => (
        <View key={item} style={[splashStyles.card, { backgroundColor: surfaceColor }]}>
          <View style={[splashStyles.cardBadge, { backgroundColor: skeletonColor }]} />
          <View style={[splashStyles.cardTitle, { backgroundColor: skeletonColor }]} />
          <View style={[splashStyles.cardLine, { backgroundColor: skeletonColor }]} />
          <View style={[splashStyles.cardLineShort, { backgroundColor: skeletonColor }]} />
        </View>
      ))}
    </View>
  );
};

interface RootNavigatorProps {
  fontsReady: boolean;
}

export const RootNavigator: React.FC<RootNavigatorProps> = ({ fontsReady }) => {
  const { theme, mode, isThemeReady } = useTheme();
  const [isReady, setIsReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState<'Onboarding' | 'Main'>('Onboarding');

  // Use theme colors immediately to prevent flashes. 
  // useTheme provides the correct mode (dark/light) based on system pref instantly.
  const splashBg = theme.background;
  const splashSkeleton = mode === 'dark' ? '#2F2A42' : '#DDD6FE';
  const navTheme = {
    ...DarkTheme,
    dark: mode === 'dark',
    colors: {
      ...DarkTheme.colors,
      background: theme.background,
      card: theme.header,
      text: theme.text,
      border: theme.border,
      primary: theme.primary,
      notification: theme.primary,
    },
  };

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        await db.init();
        const [onboarded, hasOnboarded] = await Promise.all([
          db.getPreference('onboarded'),
          db.getPreference('hasOnboarded'),
        ]);
        if (!isMounted) return;
        setInitialRoute(onboarded === 'true' || hasOnboarded === 'true' ? 'Main' : 'Onboarding');
      } catch {
        if (!isMounted) return;
        setInitialRoute('Onboarding');
      } finally {
        if (isMounted) setIsReady(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;

    const unsubscribe = watchPremiumStatusFromBilling();
    syncPremiumStatusFromBilling().catch(() => {
      // Keep launch resilient if Google Play is temporarily unavailable.
    });

    return () => {
      unsubscribe?.();
    };
  }, [isReady]);

  useEffect(() => {
    if (isThemeReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isThemeReady]);

  if (!isReady || !isThemeReady || !fontsReady) {
    return (
      <LaunchSplash
        backgroundColor={splashBg}
        surfaceColor={theme.surface}
        skeletonColor={splashSkeleton}
      />
    );
  }

  return (
    <CategoriesProvider>
      <SnippetsProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar
            barStyle={mode === 'dark' ? 'light-content' : 'dark-content'}
            backgroundColor={theme.background}
          />
          <Stack.Navigator
            initialRouteName={initialRoute}
            screenOptions={{
              headerStyle: { backgroundColor: theme.header },
              headerTintColor: theme.text,
              headerShadowVisible: false,
              headerTitleStyle: { ...textFont('bold'), fontSize: 17, color: theme.text },
              contentStyle: { backgroundColor: theme.background },
              animation: 'fade',
              animationDuration: 250,
            }}
          >
            <Stack.Screen
              name="Onboarding"
              component={OnboardingScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Main"
              component={MainTabNavigator}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="AddSnippet"
              component={AddSnippetScreen}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="Paywall"
              component={PaywallScreen}
              options={{ presentation: 'modal', headerShown: false }}
            />
            <Stack.Screen
              name="ManageCategories"
              component={ManageCategoriesScreen}
              options={{ title: 'Categories' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SnippetsProvider>
    </CategoriesProvider>
  );
};

export default RootNavigator;

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 64,
  },
  headerRow: {
    height: 68,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    width: '48%',
    height: 18,
    borderRadius: 9,
  },
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 12,
  },
  searchBar: {
    height: 52,
    borderRadius: 16,
    paddingHorizontal: 16,
    justifyContent: 'center',
    marginBottom: 14,
  },
  searchLine: {
    width: '58%',
    height: 14,
    borderRadius: 7,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  chip: {
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLine: {
    width: '58%',
    height: 10,
    borderRadius: 5,
  },
  card: {
    minHeight: 132,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  cardBadge: {
    width: 72,
    height: 20,
    borderRadius: 10,
    marginBottom: 18,
  },
  cardTitle: {
    width: '68%',
    height: 18,
    borderRadius: 9,
    marginBottom: 14,
  },
  cardLine: {
    width: '100%',
    height: 12,
    borderRadius: 6,
    marginBottom: 10,
  },
  cardLineShort: {
    width: '74%',
    height: 12,
    borderRadius: 6,
  },
});
