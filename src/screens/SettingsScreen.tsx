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
  Modal,
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
  Clipboard,
  Edit2,
  X,
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
  const [showHowTo, setShowHowTo] = useState(false);

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
    setShowHowTo(true);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {!isPremium && (
          <TouchableOpacity
            style={[styles.premiumHero, { backgroundColor: theme.primary, shadowColor: theme.primary }]}
            onPress={() => navigation.navigate('Paywall', { source: 'settings' })}
            activeOpacity={0.88}
          >
            <View style={styles.premiumHeader}>
              <Crown size={26} color={theme.onPrimary} />
              <Text style={[styles.premiumTitle, { color: theme.onPrimary }]}>Upgrade to Pro</Text>
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

        <Section title="Legal">
          <Row
            icon={FileText}
            iconColor={theme.textSecondary}
            label="Terms & Conditions"
            onPress={() => Linking.openURL('https://gosagent.com/terms')}
          />
          <Row
            icon={ExternalLink}
            iconColor={theme.textSecondary}
            label="Privacy Policy"
            onPress={() => Linking.openURL('https://gosagent.com/privacy')}
          />
        </Section>

        <Text style={[styles.version, { color: theme.textSecondary }]}>Sagent v1.0.0</Text>
      </ScrollView>

      <Modal visible={showHowTo} transparent animationType="slide" onRequestClose={() => setShowHowTo(false)}>
        <View style={styles.modalRoot}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowHowTo(false)} />
          <View style={[styles.howToSheet, { backgroundColor: theme.surface }]}>
            <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
            <TouchableOpacity style={styles.sheetClose} onPress={() => setShowHowTo(false)} activeOpacity={0.7}>
              <X size={20} color={theme.textMuted} />
            </TouchableOpacity>

            <Text style={[styles.howToTitle, { color: theme.text }]}>How Sagent works</Text>
            <Text style={[styles.howToSubtitle, { color: theme.textSecondary }]}>
              Everything you need to know in 30 seconds.
            </Text>

            <View style={styles.howToList}>
              {[
                {
                  icon: Share2,
                  title: 'Send a message',
                  description: 'Tap any message card to open the share sheet — send to WhatsApp, Gmail, SMS, or any app instantly.',
                },
                {
                  icon: Clipboard,
                  title: 'Copy quietly',
                  description: 'Tap the clipboard icon on a card to copy without opening the share sheet. No interruption to your flow.',
                },
                {
                  icon: Edit2,
                  title: 'Edit a message',
                  description: 'Long-press any message card to edit the title, content, or category.',
                },
                {
                  icon: Zap,
                  title: 'Go Pro',
                  description: 'Upgrade to remove the Sagent watermark and unlock unlimited sends and folders.',
                },
              ].map((item, index, items) => {
                const Icon = item.icon;
                return (
                  <View
                    key={item.title}
                    style={[
                      styles.howToItem,
                      { borderBottomColor: theme.border },
                      index === items.length - 1 && styles.howToItemLast,
                    ]}
                  >
                    <View style={[styles.howToIcon, { backgroundColor: theme.primarySoft }]}>
                      <Icon size={20} color={theme.primary} strokeWidth={2} />
                    </View>
                    <View style={styles.howToText}>
                      <Text style={[styles.howToItemTitle, { color: theme.text }]}>{item.title}</Text>
                      <Text style={[styles.howToItemDescription, { color: theme.textSecondary }]}>
                        {item.description}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
  },
  howToSheet: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetClose: { position: 'absolute', top: 18, right: 18, padding: 8 },
  howToTitle: { ...textFont('bold'), fontSize: 22, marginBottom: 6 },
  howToSubtitle: { ...textFont('regular'), fontSize: 14, marginBottom: 24 },
  howToList: { gap: 20 },
  howToItem: {
    flexDirection: 'row',
    gap: 14,
    paddingBottom: 20,
    borderBottomWidth: 0.5,
  },
  howToItemLast: {
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  howToIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howToText: { flex: 1 },
  howToItemTitle: { ...textFont('semibold'), fontSize: 15, marginBottom: 4 },
  howToItemDescription: { ...textFont('regular'), fontSize: 13, lineHeight: 19 },
  version: { ...textFont('regular'), textAlign: 'center', fontSize: 13, marginTop: 8 },
});

export default SettingsScreen;
