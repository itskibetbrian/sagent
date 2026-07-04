import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Share } from 'react-native';
import { db } from '../services/database';
import { Snippet, SnippetInsert, SnippetUpdate } from '../types';
import { useRatingPrompt } from './useRatingPrompt';

const FREE_SHARE_LIMIT = 50;
const SHARE_COUNT_KEY = 'monthly_share_count';

type PremiumPromptReason = 'share-limit';

interface MonthlyShareCount {
  count: number;
  month: number;
  year: number;
}

interface UseSnippetsReturn {
  snippets: Snippet[];
  isLoading: boolean;
  error: string | null;
  copiedId: string | null;
  copySnippet: (snippet: Snippet) => Promise<void>;
  shareSnippet: (snippet: Snippet) => Promise<void>;
  createSnippet: (data: SnippetInsert) => Promise<Snippet>;
  updateSnippet: (data: SnippetUpdate) => Promise<void>;
  deleteSnippet: (id: string) => Promise<void>;
  deleteAllSnippets: () => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  premiumPromptVisible: boolean;
  premiumPromptReason: PremiumPromptReason;
  isPremium: boolean;
  monthlyShareCount: number;
  freeShareLimit: number;
  refreshShareUsage: () => Promise<void>;
  dismissPremiumPrompt: () => Promise<void>;
  refresh: () => Promise<void>;
  filterByCategory: (categoryId: string | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeCategory: string | null;
}

const SnippetsContext = createContext<UseSnippetsReturn | null>(null);

export const SnippetsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [allSnippets, setAllSnippets] = useState<Snippet[]>([]);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [premiumPromptVisible, setPremiumPromptVisible] = useState(false);
  const [premiumPromptReason, setPremiumPromptReason] = useState<PremiumPromptReason>('share-limit');
  const [isPremium, setIsPremium] = useState(false);
  const [monthlyShareCount, setMonthlyShareCount] = useState(0);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { incrementUsage } = useRatingPrompt();

  useEffect(() => {
    let filtered = allSnippets;

    if (activeCategory) {
      filtered = filtered.filter(s => s.categoryId === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        s =>
          s.title.toLowerCase().includes(q) ||
          s.content.toLowerCase().includes(q) ||
          s.categoryName?.toLowerCase().includes(q)
      );
    }

    setSnippets(filtered);
  }, [activeCategory, allSnippets, searchQuery]);

  useEffect(() => () => {
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
  }, []);

  const runHaptic = useCallback(async (
    action: () => Promise<void>
  ) => {
    const enabled = await db.getPreference('haptic', 'true');
    if (enabled === 'false') return;
    await action();
  }, []);

  const isPremiumEnabled = useCallback(async () => {
    return (await db.getPreference('premium_enabled', 'false')) === 'true';
  }, []);

  const getMonthlyShareCount = useCallback(async (): Promise<MonthlyShareCount> => {
    const now = new Date();
    const current = {
      count: 0,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    };

    // AsyncStorage is not installed in this app and the task forbids new libraries,
    // so Sagent stores the same monthly counter shape in the existing preference store.
    const raw = await db.getPreference(SHARE_COUNT_KEY);
    if (!raw) {
      return current;
    }

    try {
      const parsed = JSON.parse(raw) as MonthlyShareCount;
      if (parsed.month !== current.month || parsed.year !== current.year) {
        return current;
      }
      return {
        count: Number(parsed.count) || 0,
        month: current.month,
        year: current.year,
      };
    } catch {
      return current;
    }
  }, []);

  const saveMonthlyShareCount = useCallback(async (value: MonthlyShareCount) => {
    await db.setPreference(SHARE_COUNT_KEY, JSON.stringify(value));
  }, []);

  const refreshShareUsage = useCallback(async () => {
    const [premium, usage] = await Promise.all([
      isPremiumEnabled(),
      getMonthlyShareCount(),
    ]);
    setIsPremium(premium);
    setMonthlyShareCount(Math.min(usage.count, FREE_SHARE_LIMIT));
  }, [getMonthlyShareCount, isPremiumEnabled]);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [data] = await Promise.all([
        db.getAllSnippets(),
        refreshShareUsage(),
      ]);
      setAllSnippets(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  }, [refreshShareUsage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const copySnippet = useCallback(async (snippet: Snippet) => {
    try {
      await Clipboard.setStringAsync(snippet.content);
      await runHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      await db.incrementUseCount(snippet.id);

      setCopiedId(snippet.id);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 1500);

      const now = Date.now();
      setAllSnippets(prev =>
        prev.map(s =>
          s.id === snippet.id ? { ...s, useCount: s.useCount + 1, lastUsedAt: now, updatedAt: now } : s
        )
      );

      // Increment global usage for rating prompt
      await incrementUsage();
    } catch (e: any) {
      setError(e.message ?? 'Failed to copy to clipboard');
    }
  }, [incrementUsage, runHaptic]);

  const shareSnippet = useCallback(async (snippet: Snippet) => {
    try {
      const premium = await isPremiumEnabled();
      const fullContent = snippet.content;
      let shareText = fullContent;

      if (!premium) {
        const usage = await getMonthlyShareCount();
        if (usage.count >= FREE_SHARE_LIMIT) {
          setPremiumPromptReason('share-limit');
          setPremiumPromptVisible(true);
          return;
        }

        // Ambiguity: sharing must use the full stored content with no truncation,
        // while the paywall still sells "No watermark"; only the watermark is appended.
        shareText = `${fullContent}\n\nSent via Sagent`;
        const nextUsage = { ...usage, count: usage.count + 1 };
        await saveMonthlyShareCount(nextUsage);
        setMonthlyShareCount(Math.min(nextUsage.count, FREE_SHARE_LIMIT));
      }

      await Share.share({
        message: shareText,
        title: snippet.title,
      });
      await runHaptic(() => Haptics.selectionAsync());
      await db.incrementUseCount(snippet.id);
      const now = Date.now();
      setAllSnippets(prev =>
        prev.map(s =>
          s.id === snippet.id ? { ...s, useCount: s.useCount + 1, lastUsedAt: now, updatedAt: now } : s
        )
      );
      await incrementUsage();
    } catch (e: any) {
      setError(e.message ?? 'Failed to share message');
    }
  }, [getMonthlyShareCount, incrementUsage, isPremiumEnabled, runHaptic, saveMonthlyShareCount]);

  const createSnippet = useCallback(async (data: SnippetInsert): Promise<Snippet> => {
    const created = await db.createSnippet(data);
    setAllSnippets(prev => [created, ...prev]);
    setError(null);
    return created;
  }, []);

  const updateSnippet = useCallback(async (data: SnippetUpdate) => {
    const updated = await db.updateSnippet(data);
    setAllSnippets(prev => prev.map(s => (s.id === updated.id ? updated : s)));
  }, []);

  const deleteSnippet = useCallback(async (id: string) => {
    await db.deleteSnippet(id);
    setAllSnippets(prev => prev.filter(s => s.id !== id));
  }, []);

  const deleteAllSnippets = useCallback(async () => {
    await db.deleteAllSnippets();
    setAllSnippets([]);
    setCopiedId(null);
  }, []);

  const toggleFavorite = useCallback(async (id: string) => {
    const newVal = await db.toggleFavorite(id);
    await runHaptic(() => Haptics.selectionAsync());
    setAllSnippets(prev =>
      prev.map(s => (s.id === id ? { ...s, isFavorite: newVal } : s))
    );
  }, [runHaptic]);

  const filterByCategory = useCallback((categoryId: string | null) => {
    setActiveCategory(categoryId);
  }, []);

  const dismissPremiumPrompt = useCallback(async () => {
    setPremiumPromptVisible(false);
  }, []);

  const value = useMemo<UseSnippetsReturn>(() => ({
    snippets,
    isLoading,
    error,
    copiedId,
    copySnippet,
    shareSnippet,
    createSnippet,
    updateSnippet,
    deleteSnippet,
    deleteAllSnippets,
    toggleFavorite,
    premiumPromptVisible,
    premiumPromptReason,
    isPremium,
    monthlyShareCount,
    freeShareLimit: FREE_SHARE_LIMIT,
    refreshShareUsage,
    dismissPremiumPrompt,
    refresh,
    filterByCategory,
    searchQuery,
    setSearchQuery,
    activeCategory,
  }), [
    activeCategory,
    copiedId,
    copySnippet,
    createSnippet,
    deleteSnippet,
    deleteAllSnippets,
    dismissPremiumPrompt,
    filterByCategory,
    searchQuery,
    setSearchQuery,
    error,
    isPremium,
    isLoading,
    monthlyShareCount,
    premiumPromptVisible,
    premiumPromptReason,
    refresh,
    refreshShareUsage,
    searchQuery,
    snippets,
    shareSnippet,
    toggleFavorite,
    updateSnippet,
  ]);

  return <SnippetsContext.Provider value={value}>{children}</SnippetsContext.Provider>;
};

export function useSnippets(): UseSnippetsReturn {
  const context = useContext(SnippetsContext);
  if (!context) {
    throw new Error('useSnippets must be used within a SnippetsProvider');
  }
  return context;
}
