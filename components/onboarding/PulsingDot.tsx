// /components/onboarding/PulsingDot.tsx — Small pulsing indicator dot
//
// Renders a glowing/pulsing dot (default yellow) overlaid on a parent.
// Typically used on club cards to signal tappable areas for admins.

import { theme } from "@/constants/theme";
import React, { useEffect } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";

interface PulsingDotProps {
  /** Whether the dot is visible and pulsing */
  active: boolean;
  /** Dot colour (defaults to secondary/yellow) */
  color?: string;
  /** Diameter in px (default 10) */
  size?: number;
  /** Extra styles to position the dot within its parent */
  style?: ViewStyle;
}

export function PulsingDot({
  active,
  color = theme.colors.secondary,
  size = 10,
  style,
}: PulsingDotProps) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (active) {
      opacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
      scale.value = withRepeat(
        withSequence(
          withTiming(1.4, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(opacity);
      cancelAnimation(scale);
      opacity.value = 0;
      scale.value = 1;
    }
  }, [active, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!active) return null;

  return (
    <View
      style={[
        styles.container,
        {
          width: size * 2,
          height: size * 2,
        },
        style,
      ]}
      pointerEvents="none"
    >
      {/* Glow ring */}
      <Animated.View
        style={[
          styles.glow,
          animatedStyle,
          {
            width: size * 2,
            height: size * 2,
            borderRadius: size,
            backgroundColor: color,
          },
        ]}
      />
      {/* Solid centre */}
      <View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  glow: {
    position: "absolute",
    opacity: 0.3,
  },
  dot: {
    shadowColor: "#f5a623",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
});
