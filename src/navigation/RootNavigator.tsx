// src/navigation/RootNavigator.tsx

import React, { useEffect, useState } from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LogBox, StatusBar } from 'react-native';

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
        const onboarded = await db.getPreference('onboarded');
        if (!isMounted) return;
        // Only check 'onboarded' — 'hasOnboarded' was a duplicate from an earlier version
        setInitialRoute(onboarded === 'true' ? 'Main' : 'Onboarding');
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

  if (!isReady || !isThemeReady || !fontsReady) {
    return null;
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
