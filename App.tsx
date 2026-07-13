// App.tsx — root entry point

import 'react-native-gesture-handler';
import React from 'react';
import { Text, TextInput, View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { RootNavigator } from './src/navigation/RootNavigator';
import { textFont } from './src/constants/typography';
import { ThemeProvider, useTheme } from './src/hooks/useTheme';
import { AuthProvider } from './src/providers/AuthProvider';
import { useFonts } from 'expo-font';
import {
  Onest_400Regular,
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
  Onest_800ExtraBold,
  Onest_900Black,
} from '@expo-google-fonts/onest';

// ── Global font defaults ─────────────────────────────────────────────────────

const TextWithDefaults = Text as typeof Text & { defaultProps?: { style?: unknown } };
const TextInputWithDefaults = TextInput as typeof TextInput & { defaultProps?: { style?: unknown } };

TextWithDefaults.defaultProps = TextWithDefaults.defaultProps ?? {};
TextWithDefaults.defaultProps.style = [TextWithDefaults.defaultProps.style, textFont()];

TextInputWithDefaults.defaultProps = TextInputWithDefaults.defaultProps ?? {};
TextInputWithDefaults.defaultProps.style = [TextInputWithDefaults.defaultProps.style, textFont()];

// ── Error boundary ────────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.title}>Something went wrong</Text>
          <Text style={errorStyles.message}>{this.state.message}</Text>
          <Text
            style={errorStyles.retry}
            onPress={() => this.setState({ hasError: false, message: '' })}
          >
            Tap to retry
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#14131C',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F8F7FF',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#B5B3C7',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  retry: {
    fontSize: 15,
    color: '#8B5CF6',
    fontWeight: '600',
  },
});

// ── App shell ─────────────────────────────────────────────────────────────────

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

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Onest_700Bold,
    Onest_800ExtraBold,
    Onest_900Black,
  });

  // If fonts fail to load (no network, corrupted cache) treat them as ready
  // so the app doesn't stall forever — system fallback fonts will be used.
  const fontsReady = fontsLoaded || fontError !== null;

  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AppShell fontsReady={fontsReady} />
        </AuthProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
