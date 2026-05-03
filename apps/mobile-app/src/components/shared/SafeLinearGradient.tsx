import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

type GradientPoint = {
  x: number;
  y: number;
};

type SafeLinearGradientProps = {
  colors: readonly string[];
  start?: GradientPoint;
  end?: GradientPoint;
  locations?: readonly number[];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
};

export function LinearGradient({
  colors,
  style,
  children,
  pointerEvents,
}: SafeLinearGradientProps) {
  return (
    <View pointerEvents={pointerEvents} style={[style, { backgroundColor: colors[0] || 'transparent' }]}>
      {children}
    </View>
  );
}

export default LinearGradient;
