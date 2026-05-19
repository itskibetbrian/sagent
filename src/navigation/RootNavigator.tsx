// src/navigation/RootNavigator.tsx

import React, { useEffect, useState } from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, LogBox, Image, Text, StyleSheet, StatusBar } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { db } from '../services/database';
import { RootStackParamList } from '../types';

import OnboardingScreen from '../screens/OnboardingScreen';
import AddSnippetScreen from '../screens/AddSnippetScreen';
import PaywallScreen from '../screens/PaywallScreen';
import ManageCategoriesScreen from '../screens/ManageCategoriesScreen';
import MainTabNavigator from './MainTabNavigator';
import { SnippetsProvider } from '../hooks/useSnippets';
import { useTheme } from '../hooks/useTheme';
import { syncPremiumStatusFromBilling, watchPremiumStatusFromBilling } from '../services/premiumSync';
import { textFont } from '../constants/typography';

// Ignore specific warnings if necessary
LogBox.ignoreLogs(['Non-serializable values were found in the navigation state']);

const Stack = createNativeStackNavigator<RootStackParamList>();

const LaunchSplash = ({ backgroundColor, textColor }: { backgroundColor: string; textColor: string }) => (
  <View style={[splashStyles.container, { backgroundColor }]}>
    <Image source={require('../../assets/splash.png')} style={splashStyles.logo} resizeMode="contain" />
    <Text style={[splashStyles.title, { color: textColor }]}>Sagent</Text>
  </View>
);

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
  const splashText = theme.text;

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
    const unsubscribe = watchPremiumStatusFromBilling();

    (async () => {
      try {
        await Promise.all([
          db.init(),
          new Promise(resolve => setTimeout(resolve, 1200)),
        ]);
        try {
          await syncPremiumStatusFromBilling();
        } catch {
          // Keep launch resilient if Google Play is temporarily unavailable.
        }
        const [onboarded, hasOnboarded] = await Promise.all([
          db.getPreference('onboarded'),
          db.getPreference('hasOnboarded'),
        ]);
        setInitialRoute(onboarded === 'true' || hasOnboarded === 'true' ? 'Main' : 'Onboarding');
      } catch {
        setInitialRoute('Onboarding');
      } finally {
        setIsReady(true);
      }
    })();

    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (isReady && isThemeReady && fontsReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsReady, isReady, isThemeReady]);

  if (!isReady || !isThemeReady || !fontsReady) {
    return <LaunchSplash backgroundColor={splashBg} textColor={splashText} />;
  }

  return (
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
  );
};

export default RootNavigator;

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logo: {
    width: 220,
    height: 220,
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    ...textFont('black'),
    letterSpacing: 1.2,
  },
});
