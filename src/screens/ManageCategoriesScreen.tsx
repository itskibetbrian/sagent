// src/screens/ManageCategoriesScreen.tsx
//
// Full category management: view, add, edit, delete.
// Color picker and icon selector are inline — no extra deps needed.

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import {
  Pencil,
  Trash2,
  Plus,
  Check,
  X,
  Tag,
  Briefcase,
  CreditCard,
  Heart,
  MapPin,
  Star,
  Home,
  Phone,
  Mail,
  Globe,
  ShoppingBag,
  Zap,
  Book,
  Music,
  Coffee,
} from 'lucide-react-native';
import { useCategories } from '../hooks/useCategories';
import { useSnippets } from '../hooks/useSnippets';
import { Category } from '../types';
import { CATEGORY_COLORS, ANIMATION_DURATION } from '../constants';
import { useTheme } from '../hooks/useTheme';
import { textFont } from '../constants/typography';

// ── Icon catalogue ─────────────────────────────────────────────────────────

const ICONS: Record<string, React.ComponentType<any>> = {
  tag: Tag, briefcase: Briefcase, 'credit-card': CreditCard,
  heart: Heart, 'map-pin': MapPin, star: Star, home: Home,
  phone: Phone, mail: Mail, globe: Globe, 'shopping-bag': ShoppingBag,
  zap: Zap, book: Book, music: Music, coffee: Coffee,
};
const ICON_KEYS = Object.keys(ICONS);

// ── Sub-components ─────────────────────────────────────────────────────────

interface CategoryRowProps {
  category: Category;
  onEdit: (cat: Category) => void;
  onDelete: (cat: Category) => void;
}

const CategoryRow: React.FC<CategoryRowProps> = ({ category, onEdit, onDelete }) => {
  const { theme } = useTheme();
  const Icon = ICONS[category.icon] ?? Tag;
  return (
    <Animated.View
      entering={FadeIn.duration(ANIMATION_DURATION.normal)}
      exiting={FadeOut.duration(ANIMATION_DURATION.fast)}
      layout={Layout.springify()}
      style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <View style={[styles.iconCircle, { backgroundColor: category.color + '25' }]}>
        <Icon size={18} color={category.color} strokeWidth={2} />
      </View>
      <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>{category.name}</Text>
      <View style={[styles.colorSwatch, { backgroundColor: category.color }]} />
      <TouchableOpacity
        style={styles.rowBtn}
        onPress={() => onEdit(category)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Pencil size={16} color={theme.textSecondary} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.rowBtn}
        onPress={() => onDelete(category)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Trash2 size={16} color={theme.danger} />
      </TouchableOpacity>
    </Animated.View>
  );
};

// ── Editor modal ───────────────────────────────────────────────────────────

interface EditorModalProps {
  visible: boolean;
  initial: Partial<Category> | null;
  onSave: (name: string, color: string, icon: string) => void;
  onClose: () => void;
}

const EditorModal: React.FC<EditorModalProps> = ({ visible, initial, onSave, onClose }) => {
  const { theme } = useTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLORS[0]);
  const [icon, setIcon] = useState(initial?.icon ?? 'tag');

  // Sync when the modal opens for a different category
  React.useEffect(() => {
    setName(initial?.name ?? '');
    setColor(initial?.color ?? CATEGORY_COLORS[0]);
    setIcon(initial?.icon ?? 'tag');
  }, [initial, visible]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim(), color, icon);
  };

  const SelectedIcon = ICONS[icon] ?? Tag;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[modal.overlay, { backgroundColor: theme.overlay }]}>
        <View style={[modal.sheet, { backgroundColor: theme.surface }]}>
          {/* Header */}
          <View style={modal.header}>
            <Text style={[modal.title, { color: theme.text }]}>{initial?.id ? 'Edit Category' : 'New Category'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Preview */}
            <View style={[modal.preview, { backgroundColor: color + '20', borderColor: color + '50' }]}>
              <View style={[modal.previewIcon, { backgroundColor: color + '30' }]}>
                <SelectedIcon size={24} color={color} />
              </View>
              <Text style={[modal.previewName, { color }]}>{name || 'Category name'}</Text>
            </View>

            {/* Name input */}
            <Text style={[modal.label, { color: theme.textSecondary }]}>Name</Text>
            <TextInput
              style={[modal.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text }]}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Finance"
              placeholderTextColor={theme.textMuted}
              maxLength={24}
              autoFocus
            />

            {/* Color picker */}
            <Text style={[modal.label, { color: theme.textSecondary }]}>Colour</Text>
            <View style={modal.colorGrid}>
              {CATEGORY_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[
                    modal.colorDot,
                    { backgroundColor: c },
                    color === c && [modal.colorDotActive, { borderColor: theme.onPrimary }],
                  ]}
                  onPress={() => setColor(c)}
                >
                  {color === c && <Check size={14} color={theme.onPrimary} strokeWidth={3} />}
                </TouchableOpacity>
              ))}
            </View>

            {/* Icon picker */}
            <Text style={[modal.label, { color: theme.textSecondary }]}>Icon</Text>
            <View style={modal.iconGrid}>
              {ICON_KEYS.map(key => {
                const Icon = ICONS[key];
                const isActive = icon === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      modal.iconBtn,
                      { borderColor: theme.border, backgroundColor: theme.surfaceAlt },
                      isActive && { backgroundColor: color, borderColor: color },
                    ]}
                    onPress={() => setIcon(key)}
                  >
                    <Icon size={20} color={isActive ? theme.onPrimary : theme.textSecondary} strokeWidth={2} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Save button */}
          <TouchableOpacity
            style={[modal.saveBtn, { backgroundColor: theme.primary }, !name.trim() && modal.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!name.trim()}
          >
            <Check size={18} color={theme.onPrimary} strokeWidth={2.5} />
            <Text style={[modal.saveBtnText, { color: theme.onPrimary }]}>Save Category</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ── Main screen ────────────────────────────────────────────────────────────

export const ManageCategoriesScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { categories, createCategory, updateCategory, deleteCategory } = useCategories();
  const { refresh: refreshSnippets } = useSnippets();
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingCat, setEditingCat] = useState<Partial<Category> | null>(null);

  const openNew = () => {
    setEditingCat(null);
    setEditorVisible(true);
  };

  const openEdit = (cat: Category) => {
    setEditingCat(cat);
    setEditorVisible(true);
  };

  const handleDelete = (cat: Category) => {
    Alert.alert(
      `Delete "${cat.name}"?`,
      'Messages in this category will move to the "Other" category.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            await deleteCategory(cat.id);
            await refreshSnippets();
          } 
        },
      ]
    );
  };

  const handleSave = async (name: string, color: string, icon: string) => {
    if (editingCat?.id) {
      await updateCategory(editingCat.id, name, color, icon);
    } else {
      await createCategory(name, color, icon);
    }
    await refreshSnippets();
    setEditorVisible(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={categories}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <CategoryRow category={item} onEdit={openEdit} onDelete={handleDelete} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Tag size={46} color={theme.primary} strokeWidth={2} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No categories yet</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>Tap + to create your first one</Text>
          </View>
        }
        ListHeaderComponent={
          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>
            {categories.length} categor{categories.length === 1 ? 'y' : 'ies'}
          </Text>
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={[
          styles.fab,
          {
            backgroundColor: theme.primary,
            shadowColor: theme.primary,
            bottom: insets.bottom + 100,
          }
        ]}
        onPress={openNew}
        activeOpacity={0.85}
      >
        <Plus size={26} color={theme.onPrimary} strokeWidth={2.5} />
      </TouchableOpacity>

      <EditorModal
        visible={editorVisible}
        initial={editingCat}
        onSave={handleSave}
        onClose={() => setEditorVisible(false)}
      />
    </View>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, paddingBottom: 100 },
  sectionHeader: { fontSize: 12, ...textFont('bold'), textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 12 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowName: { flex: 1, fontSize: 15, ...textFont('semibold') },
  colorSwatch: { width: 12, height: 12, borderRadius: 6 },
  rowBtn: { padding: 4 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 20, ...textFont('bold') },
  emptySubtitle: { fontSize: 14 },
  fab: { position: 'absolute', right: 24, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 18, ...textFont('extrabold') },
  preview: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1.5, padding: 16, marginBottom: 20, gap: 14 },
  previewIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  previewName: { fontSize: 17, ...textFont('bold') },
  label: { fontSize: 12, ...textFont('bold'), textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 15, marginBottom: 16 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  colorDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  colorDotActive: { borderWidth: 3 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  iconBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 16, padding: 16, gap: 10, marginTop: 4 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 16, ...textFont('bold') },
});

export default ManageCategoriesScreen;
