// src/components/common/CategoryChipBar.tsx

import React from 'react';
import {
  ScrollView,
  Pressable,
  Text,
  StyleSheet,
  View,
  TouchableOpacity,
} from 'react-native';
import { Settings } from 'lucide-react-native';
import { Category } from '../../types';
import { useTheme } from '../../hooks/useTheme';
import { textFont } from '../../constants/typography';

interface CategoryChipBarProps {
  categories: Category[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onManage?: () => void;
}

export const CategoryChipBar: React.FC<CategoryChipBarProps> = ({
  categories,
  activeId,
  onSelect,
  onManage,
}) => {
  const { theme } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {/* "All" chip */}
      <Chip
        label="All"
        color={theme.primary}
        isActive={activeId === null}
        onPress={() => onSelect(null)}
        theme={theme}
      />
      {categories.map(cat => (
        <Chip
          key={cat.id}
          label={cat.name}
          color={cat.color}
          isActive={activeId === cat.id}
          onPress={() => onSelect(cat.id)}
          theme={theme}
        />
      ))}

      {onManage && (
        <TouchableOpacity
          onPress={onManage}
          style={[styles.manageBtn, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
        >
          <Settings size={14} color={theme.textSecondary} />
          <Text style={[styles.manageText, { color: theme.textSecondary }]}>
            {categories.length === 0 ? 'Add categories' : 'Manage'}
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
};

interface ChipProps {
  label: string;
  color: string;
  isActive: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>['theme'];
  icon?: React.ComponentType<any>;
}

const Chip: React.FC<ChipProps> = ({ label, color, isActive, onPress, theme, icon: Icon }) => (
  <Pressable
    style={({ pressed }) => [
      styles.chip,
      isActive
        ? { backgroundColor: theme.primary, borderColor: theme.primary }
        : {
          backgroundColor: pressed ? theme.surface : theme.surfaceAlt,
          borderColor: pressed ? color : theme.border,
        },
      pressed && !isActive && styles.chipPressed,
    ]}
    onPress={onPress}
    android_ripple={null}
  >
    {Icon ? (
      <Icon size={13} color={isActive ? theme.onPrimary : color} strokeWidth={2.2} />
    ) : (
      isActive && <View style={[styles.activeDot, { backgroundColor: theme.onPrimary }]} />
    )}
    <Text
      style={[
        styles.chipText,
        { color: isActive ? theme.onPrimary : color },
      ]}
    >
      {label}
    </Text>
  </Pressable>
);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    gap: 5,
  },
  chipPressed: {
    opacity: 0.92,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.8,
  },
  chipText: {
    ...textFont('medium'),
    fontSize: 12,
    letterSpacing: 0.2,
  },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 6,
    marginLeft: 4,
  },
  manageText: {
    ...textFont('medium'),
    fontSize: 12,
  },
});

export default CategoryChipBar;
