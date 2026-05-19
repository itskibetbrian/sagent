import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

const brandIcon = require('../../../assets/icon.png');

interface BrandIconProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
}

export const BrandIcon: React.FC<BrandIconProps> = ({ size = 44, style }) => (
  <Image
    source={brandIcon}
    style={[{ width: size, height: size, borderRadius: size * 0.22 }, style]}
    resizeMode="contain"
  />
);

export default BrandIcon;
