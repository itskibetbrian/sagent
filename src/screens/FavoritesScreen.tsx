import React, { useState, useCallback, useLayoutEffect, useMemo } from 'react';
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Heart } from 'lucide-react-native';

import { SnippetCard } from '../components/cards/SnippetCard';
import { db } from '../services/database';
import { useSnippets } from '../hooks/useSnippets';
import { Snippet, RootStackParamList } from '../types';
import { textFont } from '../constants/typography';
import { useTheme } from '../hooks/useTheme';
import { GridListItem, isGridPlaceholderItem, padGridItems } from '../utils/padGridItems';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const NUM_COLUMNS = 2;

export const FavoritesScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const { theme } = useTheme();
  const [favorites, setFavorites] = useState<Snippet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedOnce = React.useRef(false);
  const { copiedId, copySnippet, shareSnippet, toggleFavorite: toggleFav, deleteSnippet } = useSnippets();
  const gridFavorites = useMemo(() => padGridItems(favorites, NUM_COLUMNS), [favorites]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: 'Sagent',
    });
  }, [navigation]);

  const loadFavorites = useCallback(async () => {
    // Only show the full-screen spinner on the very first load.
    // Subsequent focus refreshes update silently to avoid the layout jump.
    if (!hasLoadedOnce.current) {
      setIsLoading(true);
    }
    try {
      const data = await db.getFavoriteSnippets();
      setFavorites(data);
    } finally {
      setIsLoading(false);
      hasLoadedOnce.current = true;
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    loadFavorites().then(() => {
      if (cancelled) return;
    });
    return () => { cancelled = true; };
  }, [loadFavorites]));

  const handleToggleFav = useCallback(async (id: string) => {
    await toggleFav(id);
    setFavorites(prev => prev.filter(s => s.id !== id));
  }, [toggleFav]);

  const renderItem = useCallback(
    ({ item }: { item: GridListItem<Snippet> }) =>
      isGridPlaceholderItem(item) ? (
        <View style={styles.cardPlaceholder} />
      ) : (
        <SnippetCard
          snippet={item}
          isCopied={copiedId === item.id}
          onCopy={copySnippet}
          onShare={shareSnippet}
          onFavorite={handleToggleFav}
          onEdit={snippet => navigation.navigate('AddSnippet', { snippetId: snippet.id })}
          onDelete={async id => {
            await deleteSnippet(id);
            setFavorites(prev => prev.filter(s => s.id !== id));
          }}
        />
      ),
    [copiedId, copySnippet, deleteSnippet, handleToggleFav, navigation, shareSnippet]
  );

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={gridFavorites}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={NUM_COLUMNS > 1 ? styles.row : undefined}
        contentContainerStyle={styles.list}
        ListHeaderComponent={favorites.length > 0 ? (
          <Text style={[styles.count, { color: theme.textSecondary }]}>
            {favorites.length} favorite{favorites.length !== 1 ? 's' : ''}
          </Text>
        ) : null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Heart size={44} color={theme.primary} strokeWidth={2} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No favorites yet</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              Pin your most-sent messages here for one-tap sharing.
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingTop: 2, paddingBottom: 112 },
  row: { alignItems: 'stretch', justifyContent: 'space-between', paddingHorizontal: 12, gap: 8 },
  cardPlaceholder: { flex: 1, marginBottom: 8, height: 138 },
  count: {
    ...textFont('regular'),
    fontSize: 13,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { ...textFont('bold'), fontSize: 22 },
  emptySubtitle: { ...textFont('regular'), fontSize: 15, textAlign: 'center', lineHeight: 23 },
});

export default FavoritesScreen;
