import { Platform, TextStyle } from 'react-native';

export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold' | 'black';

export const APP_FONTS: Record<FontWeight, string> = {
  regular: 'Onest_400Regular',
  medium: 'Onest_500Medium',
  semibold: 'Onest_600SemiBold',
  bold: 'Onest_700Bold',
  extrabold: 'Onest_800ExtraBold',
  black: 'Onest_900Black',
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
