import { Platform, TextStyle } from 'react-native';

export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold' | 'black';

export const APP_FONTS: Record<FontWeight, string> = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
  black: 'Inter_900Black',
};

export const textFont = (weight: FontWeight = 'regular', preferSystem: boolean = false): TextStyle => {
  if (preferSystem) {
    return {
      fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
      fontWeight: (weight === 'bold' ? 'bold' : 'normal') as TextStyle['fontWeight'],
    };
  }
  return {
    fontFamily: APP_FONTS[weight] || APP_FONTS.regular,
  };
};
