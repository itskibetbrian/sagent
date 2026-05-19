import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { ClipboardList, Heart, Moon, Settings, Sun } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import HomeScreen from '../screens/HomeScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { MainTabParamList } from '../types';
import { textFont } from '../constants/typography';
import { useTheme } from '../hooks/useTheme';
import { TAB_TRANSITION_CONFIG } from '../constants';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<string, React.ComponentType<any>> = {
  Home: ClipboardList,
  Favorites: Heart,
  Settings,
};

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

interface TabItemProps {
  label: string;
  isFocused: boolean;
  onPress: () => void;
  icon: React.ComponentType<any>;
  routeName: string;
}

const TabItem: React.FC<TabItemProps> = ({ label, isFocused, onPress, icon: Icon, routeName }) => {
  const { theme, mode } = useTheme();
  const activeProgress = useSharedValue(isFocused ? 1 : 0);

  React.useEffect(() => {
    activeProgress.value = withTiming(isFocused ? 1 : 0, {
      duration: TAB_TRANSITION_CONFIG.duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [activeProgress, isFocused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.96 + activeProgress.value * 0.04 }],
  }));

  return (
    <AnimatedTouchableOpacity
      style={[styles.tabItem, animatedStyle]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View
        style={[
          styles.tabIconWrap,
          isFocused && { backgroundColor: theme.primary },
        ]}
      >
        <Icon
          size={23}
          color={isFocused ? theme.onPrimary : theme.tabInactive}
          strokeWidth={isFocused ? 2.5 : 2}
          fill={isFocused && routeName === 'Favorites' ? theme.onPrimary : 'transparent'}
        />
      </View>
      <Text
        style={[
          styles.tabLabel,
          {
            color: isFocused ? (mode === 'dark' ? theme.text : theme.primary) : theme.tabInactive,
          },
        ]}
      >
        {label}
      </Text>
    </AnimatedTouchableOpacity>
  );
};

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { theme, mode } = useTheme();
  const bottomOffset = Math.max(insets.bottom, 10);

  return (
    <>
      <LinearGradient
        colors={[
          mode === 'dark' ? 'rgba(15, 15, 19, 0)' : 'rgba(255, 255, 255, 0)',
          theme.background,
        ]}
        locations={[0, 0.85]}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: bottomOffset + 130,
        }}
        pointerEvents="none"
      />
      <View
        style={[
          styles.tabBarWrap,
          {
            bottom: bottomOffset,
          },
        ]}
      >
      <View pointerEvents="none" style={styles.tabBarBackdrop}>
        <BlurView
          intensity={mode === 'dark' ? 72 : 82}
          tint={mode === 'dark' ? 'dark' : 'light'}
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFillObject}
        />
        <View
          style={[
            styles.tabBarGlassTint,
            {
              backgroundColor:
                mode === 'dark' ? `${theme.primary}18` : `${theme.primary}0D`,
              borderColor:
                mode === 'dark' ? `${theme.primary}1A` : `${theme.primary}15`,
            },
          ]}
        />
      </View>
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: 'transparent',
            shadowColor: theme.shadow,
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel ?? route.name;
          const isFocused = state.index === index;
          const Icon = TAB_ICONS[route.name] ?? ClipboardList;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TabItem
              key={route.key}
              onPress={onPress}
              label={String(label)}
              isFocused={isFocused}
              icon={Icon}
              routeName={route.name}
            />
          );
        })}
        </View>
      </View>
    </>
  );
}

export const MainTabNavigator: React.FC = () => {
  const { theme, mode, toggleTheme } = useTheme();
  const ThemeIcon = mode === 'light' ? Moon : Sun;

  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      sceneContainerStyle={{ backgroundColor: theme.background, marginBottom: 0, paddingBottom: 0 }}
      screenOptions={{
        headerStyle: { backgroundColor: theme.header },
        headerTintColor: theme.text,
        headerShadowVisible: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          display: 'none',
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarBackground: () => null,
        headerTitleStyle: {
          ...textFont('bold'),
          color: theme.text,
          fontSize: 22,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Sagent',
          tabBarLabel: 'Messages',
          headerRight: () => (
            <TouchableOpacity onPress={() => void toggleTheme()} style={styles.headerBtn} activeOpacity={0.75}>
              <ThemeIcon size={20} color={theme.text} />
            </TouchableOpacity>
          ),
        }}
      />
      <Tab.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{
          title: 'Sagent',
          tabBarLabel: 'Favorites',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  headerBtn: {
    padding: 8,
  },
  tabBarWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    paddingTop: 0,
    backgroundColor: 'transparent',
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 28,
    borderWidth: 0,
  },
  tabBarBackdrop: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    overflow: 'hidden',
  },
  tabBarGlassTint: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderRadius: 28,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 4,
    backgroundColor: 'transparent',
  },
  tabIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabLabel: {
    ...textFont('semibold'),
    fontSize: 10,
    marginTop: 4,
    backgroundColor: 'transparent',
  },
});

export default MainTabNavigator;
