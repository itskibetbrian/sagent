// App.tsx — root entry point

import 'react-native-gesture-handler';
import React from 'react';
import { Text, TextInput } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync().catch(() => {});

import { RootNavigator } from './src/navigation/RootNavigator';
import { textFont } from './src/constants/typography';
import { ThemeProvider, useTheme } from './src/hooks/useTheme';
import { CategoriesProvider } from './src/hooks/useCategories';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
} from '@expo-google-fonts/inter';

const TextWithDefaults = Text as typeof Text & { defaultProps?: { style?: unknown } };
const TextInputWithDefaults = TextInput as typeof TextInput & { defaultProps?: { style?: unknown } };

TextWithDefaults.defaultProps = TextWithDefaults.defaultProps ?? {};
TextWithDefaults.defaultProps.style = [TextWithDefaults.defaultProps.style, textFont()];

TextInputWithDefaults.defaultProps = TextInputWithDefaults.defaultProps ?? {};
TextInputWithDefaults.defaultProps.style = [TextInputWithDefaults.defaultProps.style, textFont()];

const AppShell: React.FC<{ fontsReady: boolean }> = ({ fontsReady }) => {
  const { theme } = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaProvider>
        <RootNavigator fontsReady={fontsReady} />
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });

  return (
    <ThemeProvider>
      <CategoriesProvider>
        <AppShell fontsReady={fontsLoaded} />
      </CategoriesProvider>
    </ThemeProvider>
  );
}
