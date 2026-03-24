// /components/onboarding/FeatureHighlight.tsx — Highlight wrapper with coach mark
//
// Wraps any child component. When `active`, renders a pulsing border
// and optionally shows a coach mark label. Tapping the coach mark
// or the element fires `onDismiss` to mark the feature as seen.

import { theme } from "@/constants/theme";
import React, { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
    cancelAnimation,
    Easing,
    FadeIn,
    FadeOut,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from "react-native-reanimated";

type CoachMarkPosition = "above" | "below" | "left" | "right";

interface FeatureHighlightProps {
  /** Whether the highlight is active */
  active: boolean;
  /** Children to wrap */
  children: React.ReactNode;
  /** Border color (defaults to secondary/yellow) */
  color?: string;
  /** Border radius to match the child shape */
  borderRadius?: number;
  /** Optional coach-mark text shown near the element */
  coachMark?: string;
  /** Where to position the coach mark relative to the child */
  coachMarkPosition?: CoachMarkPosition;
  /** Called when the user taps the coach mark to dismiss it */
  onDismiss?: () => void;
}

export function FeatureHighlight({
  active,
  children,
  color = theme.colors.secondary,
  borderRadius = theme.borderRadius.medium,
  coachMark,
  coachMarkPosition = "below",
  onDismiss,
}: FeatureHighlightProps) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (active) {
      opacity.value = withRepeat(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(opacity);
      opacity.value = 0;
    }
  }, [active, opacity]);

  const animatedBorder = useAnimatedStyle(() => ({
    borderColor: color,
    borderWidth: 2,
    borderRadius,
    opacity: opacity.value,
  }));

  if (!active) {
    return <>{children}</>;
  }

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[StyleSheet.absoluteFill, animatedBorder, styles.highlight]}
        pointerEvents="none"
      />
      {children}
      {coachMark && (
        <CoachMarkLabel
          text={coachMark}
          color={color}
          onDismiss={onDismiss}
          position={coachMarkPosition}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Coach Mark Label
// ---------------------------------------------------------------------------

function CoachMarkLabel({
  text,
  color,
  onDismiss,
  position,
}: {
  text: string;
  color: string;
  onDismiss?: () => void;
  position: CoachMarkPosition;
}) {
  // Compute absolute offset styles based on position.
  // "left" anchors to the icon's right edge so it stays on-screen
  // even for icons placed at the far right of the header.
  const positionStyle = (() => {
    switch (position) {
      case "above":
        return { bottom: "110%" as const, right: 0 };
      case "below":
        return { top: "110%" as const, right: 0 };
      case "left":
        return {
          right: "110%" as const,
          top: "50%" as const,
          transform: [{ translateY: -16 }],
        };
      case "right":
        return {
          left: "110%" as const,
          top: "50%" as const,
          transform: [{ translateY: -16 }],
        };
    }
  })();

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      exiting={FadeOut.duration(200)}
      style={[styles.coachMarkAnchor, positionStyle]}
    >
      <TouchableOpacity
        onPress={onDismiss}
        activeOpacity={0.7}
        style={[styles.coachMark, { borderColor: color }]}
      >
        <Text style={[styles.coachMarkText, { color }]}>{text}</Text>
        <Text style={styles.coachMarkDismiss}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    overflow: "visible",
    zIndex: 50,
  },
  highlight: {
    zIndex: 10,
  },
  coachMarkAnchor: {
    position: "absolute",
    zIndex: 100,
    elevation: 50,
  },
  coachMark: {
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 140,
    maxWidth: 220,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  coachMarkText: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },
  coachMarkDismiss: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: "700",
  },
});
