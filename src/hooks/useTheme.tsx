import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { db } from '../services/database';

export type AppThemeMode = 'light' | 'dark';
export type AppThemePreference = AppThemeMode | 'system';

export interface AppThemePalette {
  mode: AppThemeMode;
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  success: string;
  successSoft: string;
  danger: string;
  header: string;
  tabGlass: string;
  tabBackdrop: string;
  tabBorder: string;
  tabInactive: string;
  tabInset: string;
  shadow: string;
  overlay: string;
}

const LIGHT_THEME: AppThemePalette = {
  mode: 'light',
  background: '#EDE9F6',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F3FF',
  surfaceMuted: '#F8F5FF',
  text: '#1E1B2E',
  textSecondary: '#6B7280',
  textMuted: '#7A7A85',
  border: '#DDD6FE',
  primary: '#7C3AED',
  primarySoft: '#EEE7FF',
  onPrimary: '#FFFFFF',
  success: '#10B981',
  successSoft: '#ECFDF5',
  danger: '#EF4444',
  header: '#FFFFFF',
  tabGlass: 'rgba(35, 24, 60, 0.58)',
  tabBackdrop: 'rgba(27, 18, 48, 0.42)',
  tabBorder: 'rgba(255, 255, 255, 0.18)',
  tabInactive: '#322B45',
  tabInset: '#EDE9F6',
  shadow: '#140C24',
  overlay: 'rgba(16, 12, 28, 0.5)',
};

const DARK_THEME: AppThemePalette = {
  mode: 'dark',
  background: '#14131C',
  surface: '#1D1B29',
  surfaceAlt: '#262338',
  surfaceMuted: '#211E31',
  text: '#F8F7FF',
  textSecondary: '#B5B3C7',
  textMuted: '#CFCBE6',
  border: '#37314D',
  primary: '#8B5CF6',
  primarySoft: '#3C2A69',
  onPrimary: '#FFFFFF',
  success: '#34D399',
  successSoft: '#183127',
  danger: '#FB7185',
  header: '#1A1824',
  tabGlass: 'rgba(15, 13, 24, 0.84)',
  tabBackdrop: 'rgba(8, 7, 14, 0.56)',
  tabBorder: 'rgba(255, 255, 255, 0.08)',
  tabInactive: 'rgba(255,255,255,0.85)',
  tabInset: '#14131C',
  shadow: '#05040A',
  overlay: 'rgba(0, 0, 0, 0.5)',
};

interface ThemeContextValue {
  theme: AppThemePalette;
  mode: AppThemeMode;
  preference: AppThemePreference;
  isThemeReady: boolean;
  toggleTheme: () => Promise<void>;
  setThemeMode: (preference: AppThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [preference, setPreference] = useState<AppThemePreference>('system');
  const [isThemeReady, setIsThemeReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        // Ensure the database is initialised before reading preferences.
        // db.init() is idempotent — calling it here is safe even though
        // RootNavigator also calls it; the second call is a no-op.
        await db.init();
        const storedMode = await db.getPreference('theme_mode');
        if (isMounted && (storedMode === 'light' || storedMode === 'dark' || storedMode === 'system')) {
          setPreference(storedMode);
        }
      } catch {
        // Ignore — default 'system' preference will be used.
      } finally {
        if (isMounted) setIsThemeReady(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const setThemeMode = useCallback(async (nextPreference: AppThemePreference) => {
    setPreference(nextPreference);
    try {
      await db.setPreference('theme_mode', nextPreference);
    } catch {
      // Best-effort persistence only.
    }
  }, []);

  const toggleTheme = useCallback(async () => {
    const nextPreference: AppThemePreference =
      preference === 'system' ? 'light' : preference === 'light' ? 'dark' : 'system';
    await setThemeMode(nextPreference);
  }, [preference, setThemeMode]);

  const mode: AppThemeMode = preference === 'system'
    ? (systemColorScheme === 'light' ? 'light' : 'dark')
    : preference;

  const value = useMemo<ThemeContextValue>(() => ({
    theme: mode === 'light' ? LIGHT_THEME : DARK_THEME,
    mode,
    preference,
    isThemeReady,
    toggleTheme,
    setThemeMode,
  }), [mode, preference, isThemeReady, setThemeMode, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
};
