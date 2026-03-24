// /components/onboarding/Tooltip.tsx — Contextual tooltip / coach mark component
//
// A floating tooltip that attaches near the wrapped child element.
// Auto-dismissed when tapped, with a "Got it" button.
// Uses Reanimated for smooth fade-in/out.

import { theme } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Dimensions,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import Animated, {
    FadeOut,
    SlideInDown,
    SlideInUp,
} from "react-native-reanimated";

import type { TooltipPlacement } from "@/services/onboarding/types";

interface TooltipProps {
  /** Whether the tooltip is visible */
  visible: boolean;
  /** Title text (already translated or i18n key) */
  title: string;
  /** Body text */
  body: string;
  /** Placement relative to an anchor — affects the arrow direction */
  placement?: TooltipPlacement;
  /** Called when user dismisses the tooltip */
  onDismiss: () => void;
  /** Optional icon name (Ionicons) */
  icon?: string;
}

export function Tooltip({
  visible,
  title,
  body,
  placement = "bottom",
  onDismiss,
  icon,
}: TooltipProps) {
  const { t } = useTranslation("common");
  const [show, setShow] = useState(visible);

  useEffect(() => {
    if (visible) setShow(true);
  }, [visible]);

  if (!show) return null;

  const enterAnim = placement === "top" ? SlideInUp : SlideInDown;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Animated.View
          entering={enterAnim.duration(300)}
          exiting={FadeOut.duration(200)}
          style={[
            styles.container,
            placement === "top" ? styles.containerTop : styles.containerBottom,
          ]}
        >
          {/* Arrow */}
          <View
            style={[
              styles.arrow,
              placement === "top" ? styles.arrowBottom : styles.arrowTop,
            ]}
          />

          {/* Content */}
          <View style={styles.content}>
            {icon && (
              <Ionicons
                name={icon as any}
                size={24}
                color={theme.colors.secondary}
                style={styles.icon}
              />
            )}
            <View style={styles.textContainer}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.body}>{body}</Text>
            </View>
          </View>

          {/* Dismiss button */}
          <Pressable style={styles.button} onPress={onDismiss}>
            <Text style={styles.buttonText}>{t("ok")}</Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.lg,
  },
  container: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    maxWidth: Math.min(SCREEN_WIDTH - 48, 380),
    width: "100%",
    borderWidth: 1,
    borderColor: theme.colors.secondary,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
      web: {
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
      },
    }),
  },
  containerTop: {
    marginBottom: "auto",
    marginTop: 120,
  },
  containerBottom: {
    marginTop: "auto",
    marginBottom: 120,
  },
  arrow: {
    position: "absolute",
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    alignSelf: "center",
  },
  arrowTop: {
    top: -10,
    borderBottomWidth: 10,
    borderBottomColor: theme.colors.secondary,
  },
  arrowBottom: {
    bottom: -10,
    borderTopWidth: 10,
    borderTopColor: theme.colors.secondary,
  },
  content: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  icon: {
    marginRight: theme.spacing.sm,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: theme.colors.secondary,
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.xs,
  },
  body: {
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.small + 1,
    lineHeight: 20,
  },
  button: {
    alignSelf: "flex-end",
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs + 2,
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.small,
  },
  buttonText: {
    color: theme.colors.primary,
    fontSize: theme.typography.fontSize.small + 1,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});
