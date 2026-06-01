// src/components/cards/SnippetCard.tsx
//
// The core interactive card. Tap = share. Long-press = context menu.
// Uses Reanimated for smooth press/copy feedback animations.

import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Platform,
  GestureResponderEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  interpolateColor,
  runOnJS,
} from 'react-native-reanimated';
import { Check, Copy, Heart } from 'lucide-react-native';
import { Snippet } from '../../types';
import { ANIMATION_DURATION } from '../../constants';
import { textFont } from '../../constants/typography';
import { useTheme } from '../../hooks/useTheme';

const CARD_GAP = 8;
const PREVIEW_CHARACTER_LIMIT = 96;

const getWordBoundaryPreview = (content: string) => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= PREVIEW_CHARACTER_LIMIT) {
    return normalized;
  }

  const clipped = normalized.slice(0, PREVIEW_CHARACTER_LIMIT);
  const lastSpace = clipped.lastIndexOf(' ');

  // Native two-line text measurement depends on device width/font rendering;
  // pre-clipping at a word boundary prevents obvious mid-word preview endings.
  return `${(lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trim()}...`;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const HighlightedText: React.FC<{
  text: string;
  query?: string;
  style: any;
  highlightColor: string;
  numberOfLines?: number;
}> = ({ text, query, style, highlightColor, numberOfLines }) => {
  const trimmedQuery = query?.trim();
  if (!trimmedQuery) {
    return (
      <Text style={style} numberOfLines={numberOfLines} ellipsizeMode="tail">
        {text}
      </Text>
    );
  }

  const parts = text.split(new RegExp(`(${escapeRegExp(trimmedQuery)})`, 'ig'));

  return (
    <Text style={style} numberOfLines={numberOfLines} ellipsizeMode="tail">
      {parts.map((part, index) =>
        part.toLowerCase() === trimmedQuery.toLowerCase() ? (
          <Text key={`${part}-${index}`} style={{ backgroundColor: highlightColor }}>
            {part}
          </Text>
        ) : (
          <Text key={`${part}-${index}`}>{part}</Text>
        )
      )}
    </Text>
  );
};

interface SnippetCardProps {
  snippet: Snippet;
  isCopied: boolean;
  onCopy: (snippet: Snippet) => void;
  onShare: (snippet: Snippet) => void;
  onFavorite: (id: string) => void;
  onEdit: (snippet: Snippet) => void;
  onDelete: (id: string) => void;
  searchQuery?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const SnippetCard: React.FC<SnippetCardProps> = ({
  snippet,
  isCopied,
  onCopy,
  onShare,
  onFavorite,
  onEdit,
  onDelete,
  searchQuery,
}) => {
  const { theme, mode } = useTheme();
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);
  const copyProgress = useSharedValue(0);
  const heartScale = useSharedValue(1);
  const previewContent = getWordBoundaryPreview(snippet.content);

  // ── Animation styles ────────────────────────────────────────────────────

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const cardBgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      copyProgress.value,
      [0, 1],
      [theme.surface, theme.successSoft]
    ),
  }));

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  // ── Handlers ────────────────────────────────────────────────────────────

  const handlePressIn = useCallback(() => {
    scale.value = withTiming(0.97, { duration: 100 });
  }, []);

  const handlePressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: 100 });
  }, []);

  const handleCopy = useCallback((event?: GestureResponderEvent) => {
    event?.stopPropagation?.();
    // Trigger copy feedback animation
    copyProgress.value = withSequence(
      withTiming(1, { duration: ANIMATION_DURATION.fast }),
      withTiming(0, { duration: ANIMATION_DURATION.slow })
    );
    glowOpacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withTiming(0, { duration: 600 })
    );
    runOnJS(onCopy)(snippet);
  }, [snippet, onCopy]);

  const handleFavorite = useCallback((event?: GestureResponderEvent) => {
    event?.stopPropagation?.();
    heartScale.value = withSequence(
      withTiming(1.25, { duration: 120 }),
      withTiming(1, { duration: 120 })
    );
    onFavorite(snippet.id);
  }, [snippet.id, onFavorite]);

  const handleShare = useCallback(() => {
    onShare(snippet);
  }, [onShare, snippet]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Animated.View style={[styles.wrapper, cardAnimStyle]}>
      {/* Glow ring that pulses on copy */}
      <Animated.View style={[styles.glow, glowStyle, { borderColor: theme.success, shadowColor: theme.success }]} />

      <AnimatedPressable
        style={[
          styles.card,
          mode === 'light' && styles.lightCard,
          { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
          cardBgStyle,
        ]}
        onPress={handleShare}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onLongPress={() => onEdit(snippet)}
        delayLongPress={400}
      >
        <View style={styles.contentWrap}>
          {/* Category badge */}
          {snippet.categoryName && (
            <View
              style={[
                styles.categoryBadge,
                { backgroundColor: theme.surfaceAlt },
              ]}
            >
              <View
                style={[
                  styles.categoryDot,
                  { backgroundColor: snippet.categoryColor ?? theme.primary },
                ]}
              />
              <HighlightedText
                text={snippet.categoryName}
                query={searchQuery}
                style={[
                  styles.categoryText,
                  { color: theme.primary },
                ]}
                highlightColor={theme.primarySoft}
                numberOfLines={1}
              />
            </View>
          )}

          {/* Title */}
          <HighlightedText
            text={snippet.title}
            query={searchQuery}
            style={[styles.title, { color: theme.text }]}
            highlightColor={theme.primarySoft}
            numberOfLines={1}
          />

          {/* Content preview */}
          <HighlightedText
            text={previewContent}
            query={searchQuery}
            style={[styles.content, { color: theme.textSecondary }]}
            highlightColor={theme.primarySoft}
            numberOfLines={3}
          />
        </View>

        {/* Footer row */}
        <View style={styles.footer}>
          {isCopied ? (
            <View
              style={[
                styles.copyBadge,
                { backgroundColor: theme.successSoft },
              ]}
            >
              <>
                <Check size={11} color={theme.success} strokeWidth={2.5} />
                <Text style={[styles.copyLabel, { color: theme.success }]}>
                  Copied!
                </Text>
              </>
            </View>
          ) : (
            <View style={styles.copyBadgeSpacer} />
          )}

          <View style={styles.actions}>
            {/* Copy button */}
            <TouchableOpacity
              onPress={handleCopy}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              <Copy
                size={16}
                color={theme.textMuted}
                strokeWidth={2}
              />
            </TouchableOpacity>

            {/* Favorite button */}
              <Animated.View style={heartStyle}>
              <TouchableOpacity
                onPress={handleFavorite}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Heart
                  size={16}
                  color={snippet.isFavorite ? theme.danger : theme.textMuted}
                  fill={snippet.isFavorite ? theme.danger : 'transparent'}
                  strokeWidth={2}
                />
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    marginBottom: CARD_GAP,
    position: 'relative',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 0.8,
    elevation: 0,
    pointerEvents: 'none',
  },
  card: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    height: 138,
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.22,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  lightCard: {
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  contentWrap: {
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 0,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
    gap: 4,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  categoryText: {
    ...textFont('medium'),
    fontSize: 10,
    letterSpacing: 0.3,
  },
  title: {
    ...textFont('semibold'),
    fontSize: 14,
    lineHeight: 16,
    marginBottom: 2,
  },
  content: {
    ...textFont('regular'),
    fontSize: 12,
    lineHeight: 15,
    flexShrink: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  copyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  copyBadgeSpacer: {
    minWidth: 1,
  },
  copyLabel: {
    ...textFont('regular'),
    fontSize: 10,
  },
});

export default SnippetCard;
