import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  Linking,
  Share,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import {
  Crown,
  ExternalLink,
  ChevronRight,
  Info,
  Zap,
  FileText,
  Share2,
  Bug,
  Trash2,
} from 'lucide-react-native';
import { db } from '../services/database';
import { textFont } from '../constants/typography';
import { RootStackParamList } from '../types';
import { useTheme } from '../hooks/useTheme';
import { useSnippets } from '../hooks/useSnippets';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface RowProps {
  icon: React.ComponentType<any>;
  iconColor?: string;
  label: string;
  sublabel?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
}

const Row: React.FC<RowProps> = ({ icon: Icon, iconColor, label, sublabel, onPress, right, danger }) => {
  const { theme } = useTheme();
  const finalIconColor = iconColor || theme.primary;

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: theme.border }]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.rowIcon, { backgroundColor: `${finalIconColor}18` }]}>
        <Icon size={18} color={danger ? theme.danger : finalIconColor} strokeWidth={2} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: danger ? theme.danger : theme.text }]}>{label}</Text>
        {sublabel && <Text style={[styles.rowSublabel, { color: theme.textSecondary }]}>{sublabel}</Text>}
      </View>
      {right ?? (onPress && <ChevronRight size={16} color={theme.textMuted} />)}
    </TouchableOpacity>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const { theme } = useTheme();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{title}</Text>
      <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>{children}</View>
    </View>
  );
};

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const { theme } = useTheme();
  const { isPremium, refresh, refreshShareUsage } = useSnippets();
  const [hapticEnabled, setHapticEnabled] = useState(true);

  const loadPreferences = useCallback(() => {
    db.getPreference('haptic', 'true').then(v => setHapticEnabled(v === 'true'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPreferences();
    }, [loadPreferences])
  );

  const handleShareApp = async () => {
    await Share.share({
      message: 'Try Sagent for saving and sending the messages you reuse every day: https://play.google.com/store/apps/details?id=com.sagent.app',
    });
  };

  const handleToggleHaptic = async (value: boolean) => {
    if (value) {
      await Haptics.selectionAsync();
    }
    setHapticEnabled(value);
    await db.setPreference('haptic', value ? 'true' : 'false');
  };

  const handleShowHowToUse = () => {
    Alert.alert(
      'How to use Sagent',
      [
        'Tap a message card to share it.',
        'Tap the copy icon to copy quietly.',
        'Long-press a card to edit it.',
        'Use categories to filter messages.',
        'Use Recent to find messages you copied or shared lately.',
        'Tap template suggestions when a category is empty.',
      ].join('\n\n')
    );
  };

  const handleClearAllData = () => {
    Alert.alert(
      'Clear all data?',
      'This will permanently delete all your messages, categories, favorites, and reset the app to its original state. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear everything',
          style: 'destructive',
          onPress: async () => {
            await db.clearAllData();
            await refresh();
            await refreshShareUsage();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Onboarding' }],
            });
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      {!isPremium && (
        <TouchableOpacity
          style={[styles.premiumHero, { backgroundColor: theme.primary, shadowColor: theme.primary }]}
          onPress={() => navigation.navigate('Paywall', { source: 'settings' })}
          activeOpacity={0.88}
        >
          <View style={styles.premiumHeader}>
            <Crown size={26} color={theme.onPrimary} />
            <Text style={[styles.premiumTitle, { color: theme.onPrimary }]}>Upgrade to Pro Closer</Text>
          </View>
          <Text style={[styles.premiumSub, { color: `${theme.onPrimary}DD` }]}>
            Stop typing, start closing. Get the full power of Sagent.
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.shareCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
        onPress={() => void handleShareApp()}
        activeOpacity={0.88}
      >
        <View style={[styles.shareIconWrap, { backgroundColor: theme.primarySoft }]}>
          <Share2 size={20} color={theme.primary} />
        </View>
        <View style={styles.shareTextWrap}>
          <Text style={[styles.shareTitle, { color: theme.text }]}>Share Sagent</Text>
          <Text style={[styles.shareSub, { color: theme.textSecondary }]}>Invite your friends or colleagues to try Sagent.</Text>
        </View>
        <ChevronRight size={18} color={theme.textMuted} />
      </TouchableOpacity>

      <Section title="Usage">
        <Row
          icon={Info}
          iconColor={theme.primary}
          label="How to use Sagent"
          sublabel="Quick tips for sharing, copying, editing, and organizing"
          onPress={handleShowHowToUse}
        />
      </Section>

      <Section title="Preferences">
        <Row
          icon={Zap}
          iconColor={theme.success}
          label="Haptic feedback"
          sublabel="Vibrate on send"
          right={
            <Switch
              value={hapticEnabled}
              onValueChange={handleToggleHaptic}
              trackColor={{ true: theme.primary, false: theme.border }}
              thumbColor={theme.onPrimary}
            />
          }
        />
      </Section>

      <Section title="Data">
        <Row
          icon={Trash2}
          iconColor={theme.danger}
          label="Clear all data"
          danger
          onPress={handleClearAllData}
        />
      </Section>

      <Section title="Support">
        <Row
          icon={Bug}
          iconColor={theme.primary}
          label="Report a Bug or Idea"
          sublabel="Send feedback by email"
          onPress={() => Linking.openURL('mailto:support@sagent.app?subject=Sagent%20Bug%20or%20Idea')}
        />
      </Section>

      <Section title="Legal">
        <Row
          icon={FileText}
          iconColor={theme.textSecondary}
          label="Terms & Conditions"
          onPress={() => Linking.openURL('https://nogeybix.com/legal/terms')}
        />
        <Row
          icon={ExternalLink}
          iconColor={theme.textSecondary}
          label="Privacy Policy"
          onPress={() => Linking.openURL('https://nogeybix.com/legal/privacy')}
        />
      </Section>

      <Text style={[styles.version, { color: theme.textSecondary }]}>Sagent v1.0.0</Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 60 },
  premiumHero: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 14,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 8,
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  premiumTitle: {
    ...textFont('bold'),
    fontSize: 24,
  },
  premiumSub: {
    ...textFont('regular'),
    fontSize: 15,
    lineHeight: 22,
  },
  shareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    marginBottom: 24,
  },
  shareIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareTextWrap: {
    flex: 1,
  },
  shareTitle: {
    ...textFont('semibold'),
    fontSize: 16,
  },
  shareSub: {
    ...textFont('regular'),
    fontSize: 13,
    marginTop: 2,
    lineHeight: 19,
  },
  section: { marginBottom: 24 },
  sectionTitle: { ...textFont('bold'), fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, paddingLeft: 4 },
  sectionCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14, borderBottomWidth: 1 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowLabel: { ...textFont('semibold'), fontSize: 16 },
  rowSublabel: { ...textFont('regular'), fontSize: 13, marginTop: 2, lineHeight: 19 },
  version: { ...textFont('regular'), textAlign: 'center', fontSize: 13, marginTop: 8 },
});

export default SettingsScreen;
