// src/screens/AddSnippetScreen.tsx

import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Save, Trash2 } from 'lucide-react-native';

import { useSnippets } from '../hooks/useSnippets';
import { useCategories } from '../hooks/useCategories';
import { DEFAULT_CATEGORIES } from '../constants';
import { RootStackParamList } from '../types';
import { db } from '../services/database';
import { useTheme } from '../hooks/useTheme';
import { textFont } from '../constants/typography';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, 'AddSnippet'>;

export const AddSnippetScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { theme } = useTheme();
  const { snippetId } = route.params ?? {};
  const isEditing = Boolean(snippetId);

  const { createSnippet, updateSnippet, deleteSnippet } = useSnippets();
  const { categories } = useCategories();

  const categoryItems = categories.length > 0
    ? categories
    : [
        DEFAULT_CATEGORIES.find(cat => cat.id === 'other') ?? {
          id: 'other',
          name: 'Other',
          color: '#8B5CF6',
          icon: 'tag',
          createdAt: Date.now(),
        },
      ];

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(categoryItems[0]?.id ?? 'other');
  const [isSaving, setIsSaving] = useState(false);
  const [titleError, setTitleError] = useState('');
  const [contentError, setContentError] = useState('');

  const normalizedContent = content.replace(/[\s-]/g, '');
  const hasCardNumber = /\b\d{13,19}\b/.test(normalizedContent);
  const hasSensitiveCredentialHint = /(password|passcode|otp|2fa|secret|api key|token)/i.test(content);

  // Load existing message for editing.
  useEffect(() => {
    if (snippetId) {
      db.getSnippetById(snippetId).then(s => {
        if (s) {
          setTitle(s.title);
          setContent(s.content);
          setSelectedCategory(s.categoryId ?? categoryItems[0]?.id ?? 'other');
        }
      });
    }
  }, [snippetId, categoryItems]);

  useEffect(() => {
    if (!categoryItems.length) return;
    if (!categoryItems.some(cat => cat.id === selectedCategory)) {
      setSelectedCategory(categoryItems[0].id);
    }
  }, [categoryItems, selectedCategory]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isEditing ? 'Edit Message' : 'New Message',
      headerRight: isEditing
        ? () => (
            <TouchableOpacity onPress={handleDelete} style={{ padding: 8 }}>
              <Trash2 size={20} color={theme.danger} />
            </TouchableOpacity>
          )
        : undefined,
    });
  }, [isEditing, navigation, theme.danger]);

  const handleSave = async () => {
    const isTitleMissing = !title.trim();
    const isContentMissing = !content.trim();

    setTitleError('');
    setContentError('');

    if (isTitleMissing && isContentMissing) {
      setTitleError('Please add a title and message before saving');
      setContentError('Please add a title and message before saving');
      return;
    }

    if (isTitleMissing) {
      setTitleError('Please add a title before saving');
      return;
    }

    if (isContentMissing) {
      setContentError('Please add a message before saving');
      return;
    }

    if (hasCardNumber) {
      Alert.alert('Sensitive data blocked', 'Do not store full credit card numbers in Sagent.');
      return;
    }
    setIsSaving(true);
    try {
      if (isEditing && snippetId) {
        await updateSnippet({ id: snippetId, title: title.trim(), content: content.trim(), categoryId: selectedCategory });
      } else {
        await createSnippet({ title: title.trim(), content: content.trim(), categoryId: selectedCategory });
      }
      navigation.goBack();
    } catch (error: any) {
      Alert.alert(
        'Unable to save message',
        error?.message ?? 'Please try saving this message again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Message', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (snippetId) {
            await deleteSnippet(snippetId);
            navigation.goBack();
          }
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: theme.textSecondary }]}>Title</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text }]}
          value={title}
          onChangeText={value => {
            setTitle(value);
            if (titleError) setTitleError('');
          }}
          placeholder="e.g. Price List"
          placeholderTextColor={theme.textMuted}
          maxLength={60}
        />
        {titleError ? <Text style={[styles.errorText, { color: theme.danger }]}>{titleError}</Text> : null}
        <Text style={[styles.helperText, { color: theme.textMuted }]}>
          This is how your message appears in your library
        </Text>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Content</Text>
        <TextInput
          style={[styles.input, styles.textarea, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text }]}
          value={content}
          onChangeText={value => {
            setContent(value);
            if (contentError) setContentError('');
          }}
          placeholder="Paste or type the text you want to send..."
          placeholderTextColor={theme.textMuted}
          multiline
          textAlignVertical="top"
        />
        {contentError ? <Text style={[styles.errorText, { color: theme.danger }]}>{contentError}</Text> : null}
        <Text style={[styles.counterText, { color: theme.textMuted }]}>
          {content.length} characters
        </Text>
        {(hasCardNumber || hasSensitiveCredentialHint) && (
          <View style={[styles.noticeCard, { backgroundColor: theme.surface, borderColor: hasCardNumber ? theme.danger : theme.border }]}>
            <Text style={[styles.noticeTitle, { color: hasCardNumber ? theme.danger : theme.text }]}>
              {hasCardNumber ? 'Sensitive card data detected' : 'Sensitive credential reminder'}
            </Text>
            <Text style={[styles.noticeText, { color: theme.textSecondary }]}>
              {hasCardNumber
                ? 'Sagent should not be used to store full card numbers.'
                : 'Avoid storing passwords, authentication codes, or similar secrets in this app.'}
            </Text>
          </View>
        )}

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
          {categoryItems.map(cat => (
            <Pressable
              key={cat.id}
              style={({ pressed }) => [
                styles.catChip,
                selectedCategory === cat.id
                  ? { backgroundColor: theme.primary, borderColor: theme.primary }
                  : {
                      borderColor: pressed ? cat.color : theme.border,
                      backgroundColor: pressed ? theme.surface : theme.surfaceAlt,
                    },
                pressed && selectedCategory !== cat.id && styles.catChipPressed,
              ]}
              onPress={() => setSelectedCategory(cat.id)}
            >
              {selectedCategory === cat.id && <View style={[styles.activeDot, { backgroundColor: theme.onPrimary }]} />}
              <Text style={[styles.catChipText, { color: selectedCategory === cat.id ? theme.onPrimary : cat.color }]}>
                {cat.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.primary }]} onPress={handleSave} disabled={isSaving}>
          <Save size={18} color={theme.onPrimary} />
          <Text style={[styles.saveBtnText, { color: theme.onPrimary }]}>{isSaving ? 'Saving...' : isEditing ? 'Update Message' : 'Save Message'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 8 },
  label: { fontSize: 13, ...textFont('bold'), textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 12, marginBottom: 6 },
  input: { borderRadius: 14, borderWidth: 1, padding: 14, fontSize: 15 },
  textarea: { minHeight: 120, paddingTop: 14 },
  helperText: { fontSize: 12, ...textFont('regular'), lineHeight: 17, marginTop: 2 },
  errorText: { fontSize: 12, ...textFont('medium'), lineHeight: 17, marginTop: 2 },
  counterText: { fontSize: 12, ...textFont('regular'), textAlign: 'right', lineHeight: 17, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginTop: 14, marginBottom: 4 },
  noticeCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 4, marginBottom: 8 },
  noticeTitle: { fontSize: 14, ...textFont('bold'), marginBottom: 4 },
  noticeText: { fontSize: 13, lineHeight: 19 },
  categoryRow: { flexDirection: 'row', marginBottom: 8 },
  catChip: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, gap: 5 },
  catChipPressed: { opacity: 0.92 },
  activeDot: { width: 6, height: 6, borderRadius: 3, opacity: 0.8 },
  catChipText: { fontSize: 12, letterSpacing: 0.2, ...textFont('medium') },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 16, padding: 16, marginTop: 24, gap: 10 },
  saveBtnText: { fontSize: 16, ...textFont('bold') },
});

export default AddSnippetScreen;
