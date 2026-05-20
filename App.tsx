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
import { useFonts } from 'expo-font';
import {
  Onest_400Regular,
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
  Onest_800ExtraBold,
  Onest_900Black,
} from '@expo-google-fonts/onest';

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
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Onest_700Bold,
    Onest_800ExtraBold,
    Onest_900Black,
  });

  return (
    <ThemeProvider>
      <AppShell fontsReady={fontsLoaded} />
    </ThemeProvider>
  );
}
