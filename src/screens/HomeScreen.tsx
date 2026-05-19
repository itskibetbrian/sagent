import React, { useCallback, useLayoutEffect, useMemo } from 'react';
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Plus, Sparkles } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { SnippetCard } from '../components/cards/SnippetCard';
import { SnippetCardSkeleton } from '../components/cards/SnippetCardSkeleton';
import { CategoryChipBar } from '../components/common/CategoryChipBar';
import { SearchBar } from '../components/common/SearchBar';
import { useSnippets } from '../hooks/useSnippets';
import { useCategories } from '../hooks/useCategories';
import { useRatingPrompt } from '../hooks/useRatingPrompt';
import { MESSAGE_TEMPLATES } from '../constants';
import { textFont } from '../constants/typography';
import { RootStackParamList, Snippet } from '../types';
import { useTheme } from '../hooks/useTheme';
import { isGridPlaceholderItem, padGridItems, GridListItem } from '../utils/padGridItems';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const NUM_COLUMNS = 2;
const FREE_SEND_WARNING_THRESHOLD = 40;

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { theme, mode } = useTheme();
  const {
    snippets,
    isLoading,
    copiedId,
    copySnippet,
    shareSnippet,
    createSnippet,
    toggleFavorite,
    deleteSnippet,
    filterByCategory,
    activeCategory,
    searchQuery,
    setSearchQuery,
    premiumPromptVisible,
    premiumPromptReason,
    isPremium,
    monthlyShareCount,
    freeShareLimit,
    refreshShareUsage,
    dismissPremiumPrompt,
    refresh,
    showRecent,
    isRecentActive,
  } = useSnippets();
  const { categories } = useCategories();
  const { triggerPrompt } = useRatingPrompt();
  const gridSnippets = useMemo(() => padGridItems(snippets, NUM_COLUMNS), [snippets]);
  const activeCategoryDetails = useMemo(
    () => categories.find(category => category.id === activeCategory),
    [activeCategory, categories]
  );
  const existingCategoryIds = useMemo(() => new Set(categories.map(category => category.id)), [categories]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: 'Sagent',
    });
  }, [navigation]);

  React.useEffect(() => {
    triggerPrompt();
  }, [triggerPrompt]);

  useFocusEffect(
    useCallback(() => {
      void refreshShareUsage();
    }, [refreshShareUsage])
  );

  const handleEdit = useCallback((snippet: Snippet) => {
    navigation.navigate('AddSnippet', { snippetId: snippet.id });
  }, [navigation]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteSnippet(id);
  }, [deleteSnippet]);

  const handleCreateTemplate = useCallback(async (template: typeof MESSAGE_TEMPLATES[number]) => {
    const categoryId = existingCategoryIds.has(template.categoryId)
      ? template.categoryId
      : activeCategory && existingCategoryIds.has(activeCategory)
        ? activeCategory
        : existingCategoryIds.has('other')
          ? 'other'
          : null;

    await createSnippet({
      title: template.title,
      content: template.content,
      categoryId,
    });
  }, [activeCategory, createSnippet, existingCategoryIds]);

  const renderItem = useCallback(
    ({ item, index }: { item: GridListItem<Snippet>; index: number }) =>
      isGridPlaceholderItem(item) ? (
        <View style={styles.cardPlaceholder} />
      ) : (
        <Animated.View entering={FadeInDown.delay(Math.min(index * 50, 500)).springify()} style={{ flex: 1 }}>
          <SnippetCard
            snippet={item}
            isCopied={copiedId === item.id}
            onCopy={copySnippet}
            onShare={shareSnippet}
            onFavorite={toggleFavorite}
            onEdit={handleEdit}
            onDelete={handleDelete}
            searchQuery={searchQuery}
          />
        </Animated.View>
      ),
    [copiedId, copySnippet, handleDelete, handleEdit, searchQuery, shareSnippet, toggleFavorite]
  );

  const EmptyState = () => {
    const hasSearch = Boolean(searchQuery.trim());
    const categoryName = activeCategoryDetails?.name;
    const templates = MESSAGE_TEMPLATES
      .filter(template => !activeCategory || template.categoryId === activeCategory)
      .slice(0, activeCategory ? 3 : 4);
    const fallbackTemplates = templates.length > 0 ? templates : MESSAGE_TEMPLATES.slice(0, 3);
    const title = hasSearch
      ? 'No results found'
      : isRecentActive
        ? 'No recent sends yet'
        : categoryName
          ? `No ${categoryName} messages yet`
          : 'No messages yet';
    const subtitle = hasSearch
      ? 'Search checks titles, message text, and category names.'
      : isRecentActive
        ? 'Copy or share a message and it will appear here.'
        : categoryName
          ? `Start with a ${categoryName.toLowerCase()} template or add your own.`
          : 'Start from a template or tap + to write your own.';

    return (
      <View style={styles.empty}>
        <Sparkles size={42} color={theme.primary} style={styles.emptyIcon} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>

        {hasSearch ? (
          <TouchableOpacity
            style={[styles.emptyButton, { backgroundColor: theme.primary }]}
            onPress={() => setSearchQuery('')}
            activeOpacity={0.85}
          >
            <Text style={[styles.emptyButtonText, { color: theme.onPrimary }]}>Clear search</Text>
          </TouchableOpacity>
        ) : (
          !isRecentActive && (
            <View style={styles.templateList}>
              {fallbackTemplates.map(template => (
                <TouchableOpacity
                  key={template.id}
                  style={[styles.templateButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => void handleCreateTemplate(template)}
                  activeOpacity={0.85}
                >
                  <Sparkles size={15} color={theme.primary} />
                  <Text style={[styles.templateText, { color: theme.text }]} numberOfLines={1}>
                    {template.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )
        )}
      </View>
    );
  };

  const FreeSendIndicator = () => {
    if (isPremium) {
      return null;
    }

    const usageColor = monthlyShareCount >= FREE_SEND_WARNING_THRESHOLD ? theme.danger : theme.textMuted;

    return (
      <View style={styles.sendUsageRow}>
        <Text style={[styles.sendUsageText, { color: usageColor }]}>
          {monthlyShareCount} of {freeShareLimit} free sends used
        </Text>
        <Text style={[styles.sendUsageText, { color: usageColor }]}> · </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('Paywall', { source: 'home-usage' })}
          activeOpacity={0.75}
        >
          <Text style={[styles.sendUsageLink, { color: theme.primary }]}>Upgrade</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>

      <FlatList
        data={gridSnippets}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={NUM_COLUMNS > 1 ? styles.row : undefined}
        style={styles.listView}
        contentContainerStyle={styles.list}
        onRefresh={refresh}
        refreshing={isLoading && snippets.length > 0}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search messages..." />
            <CategoryChipBar
              categories={categories}
              activeId={activeCategory}
              isRecentActive={isRecentActive}
              onSelect={filterByCategory}
              onRecent={showRecent}
              onManage={() => navigation.navigate('ManageCategories')}
            />
            <FreeSendIndicator />
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.skeletonGrid}>
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} style={styles.skeletonItem}>
                  <SnippetCardSkeleton />
                </View>
              ))}
            </View>
          ) : (
            <EmptyState />
          )
        }
      />

      <TouchableOpacity
        style={[
          styles.fabWrap,
          {
            bottom: insets.bottom + 100,
            shadowColor: theme.primary,
          },
        ]}
        onPress={() => navigation.navigate('AddSnippet', {})}
        activeOpacity={0.85}
      >
        <BlurView
          intensity={80}
          tint={mode === 'dark' ? 'dark' : 'light'}
          style={[
            styles.fab,
            {
              backgroundColor: mode === 'dark' ? `${theme.primary}80` : `${theme.primary}A0`,
              borderColor: `${theme.primary}80`,
              borderWidth: 1,
            },
          ]}
        >
          <Plus size={26} color={theme.onPrimary} strokeWidth={2.5} />
        </BlurView>
      </TouchableOpacity>

      <Modal
        visible={premiumPromptVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} />
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              You've used all 50 free sends
            </Text>
            <Text style={[styles.modalBody, { color: theme.textSecondary }]}>
              Upgrade to Pro Closer after 50 free sends for unlimited sends and no watermark.
            </Text>
            <TouchableOpacity
              style={[styles.modalPrimaryButton, { backgroundColor: theme.primary }]}
              onPress={async () => {
                await dismissPremiumPrompt();
                navigation.navigate('Paywall', { source: 'limit-modal' });
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.modalPrimaryText, { color: theme.onPrimary }]}>Upgrade to Pro Closer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSecondaryButton, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
              onPress={() => void dismissPremiumPrompt()}
              activeOpacity={0.85}
            >
              <Text style={[styles.modalSecondaryText, { color: theme.text }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  listView: {
    flex: 1,
    alignSelf: 'stretch',
  },
  list: {
    paddingTop: 2,
    paddingBottom: 152,
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  listHeader: {
    alignSelf: 'stretch',
    justifyContent: 'flex-start',
  },
  row: {
    alignItems: 'stretch',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    gap: 8,
  },
  cardPlaceholder: {
    flex: 1,
    marginBottom: 8,
  },
  count: {
    ...textFont('regular'),
    fontSize: 13,
    paddingHorizontal: 16,
    paddingBottom: 2,
  },
  sendUsageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 8,
  },
  sendUsageText: {
    ...textFont('regular'),
    fontSize: 12,
  },
  sendUsageLink: {
    ...textFont('semibold'),
    fontSize: 12,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    ...textFont('bold'),
    fontSize: 22,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...textFont('regular'),
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 23,
  },
  emptyButton: {
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 18,
  },
  emptyButtonText: {
    ...textFont('bold'),
    fontSize: 14,
  },
  templateList: {
    alignSelf: 'stretch',
    paddingHorizontal: 10,
    marginTop: 20,
    gap: 8,
  },
  templateButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  templateText: {
    ...textFont('semibold'),
    fontSize: 14,
    flex: 1,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 8,
    marginTop: 16,
  },
  skeletonItem: {
    width: '48%',
    height: 138,
  },
  fabWrap: {
    position: 'absolute',
    right: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
  },
  modalTitle: {
    ...textFont('bold'),
    fontSize: 22,
    marginBottom: 10,
  },
  modalBody: {
    ...textFont('regular'),
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 18,
  },
  modalPrimaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  modalPrimaryText: {
    ...textFont('bold'),
    fontSize: 16,
  },
  modalSecondaryButton: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalSecondaryText: {
    ...textFont('semibold'),
    fontSize: 15,
  },
});

export default HomeScreen;
