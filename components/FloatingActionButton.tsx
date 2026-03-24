import { FeatureHighlight } from "@/components/onboarding";
import { theme } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";

// Single FAB Props (backward compatible)
interface FloatingActionButtonProps {
  onPress: () => void;
  text?: string;
  style?: ViewStyle;
  icon?: keyof typeof Ionicons.glyphMap;
  color?: string;
}

// Multi-FAB Props for stacked buttons
interface MultiFABProps {
  buttons: {
    id: string;
    text: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    onPress: () => void;
  }[];
  style?: ViewStyle;
}

/**
 * Single Floating Action Button (backward compatible)
 */
export default function FloatingActionButton({
  onPress,
  text,
  style,
  icon = "add",
  color = theme.colors.secondary,
}: FloatingActionButtonProps) {
  const { t } = useTranslation(["components", "common"]);
  const resolvedText = text || t("components:floatingActionButton.newEvent");

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.fab, { borderColor: color }, style]}
    >
      <Text style={[styles.fabText, { color }]}>{resolvedText}</Text>
      <Ionicons name={icon} size={20} color={color} />
    </TouchableOpacity>
  );
}

/**
 * Multi-FAB Component - Stacked vertically
 * Each button has its own color and icon
 */
export function MultiFAB({ buttons, style }: MultiFABProps) {
  return (
    <View style={[styles.multiFabContainer, style]}>
      {buttons.map((button, index) => (
        <TouchableOpacity
          key={button.id}
          onPress={button.onPress}
          style={[
            styles.fab,
            styles.stackedFab,
            { borderColor: button.color },
            index > 0 && { marginTop: 56 }, // Spacing between buttons
          ]}
        >
          <Text style={[styles.fabText, { color: button.color }]}>
            {button.text}
          </Text>
          <Ionicons name={button.icon} size={22} color={button.color} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

/**
 * Pre-configured dual FAB for News + Events
 * News (blue) on top, Events (yellow) on bottom
 */
export function NewsEventFAB({
  onNewsPress,
  onEventPress,
  style,
  newsHighlight,
  eventHighlight,
}: {
  onNewsPress: () => void;
  onEventPress: () => void;
  style?: ViewStyle;
  /** Coach mark config for the News FAB */
  newsHighlight?: {
    active: boolean;
    coachMark?: string;
    onDismiss?: () => void;
  };
  /** Coach mark config for the Event FAB */
  eventHighlight?: {
    active: boolean;
    coachMark?: string;
    onDismiss?: () => void;
  };
}) {
  const { t } = useTranslation(["components", "common"]);

  const newsFab = (
    <TouchableOpacity
      onPress={onNewsPress}
      style={[styles.fab, styles.newsFab]}
    >
      <Text style={[styles.fabText, styles.newsText]}>
        {t("components:floatingActionButton.news")}
      </Text>
      <Ionicons
        name="newspaper-outline"
        size={22}
        color={theme.colors.badge.child}
      />
    </TouchableOpacity>
  );

  const eventFab = (
    <TouchableOpacity
      onPress={onEventPress}
      style={[styles.fab, styles.eventFab]}
    >
      <Text style={[styles.fabText, styles.eventText]}>
        {t("components:floatingActionButton.event")}
      </Text>
      <Ionicons
        name="calendar-outline"
        size={22}
        color={theme.colors.secondary}
      />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.dualFabContainer, style]}>
      {/* News FAB (Blue) - Top */}
      {newsHighlight?.active ? (
        <FeatureHighlight
          active
          borderRadius={28}
          color={theme.colors.badge.child}
          coachMark={newsHighlight.coachMark}
          coachMarkPosition="left"
          onDismiss={newsHighlight.onDismiss}
        >
          {newsFab}
        </FeatureHighlight>
      ) : (
        newsFab
      )}

      {/* Event FAB (Yellow) - Bottom */}
      {eventHighlight?.active ? (
        <FeatureHighlight
          active
          borderRadius={28}
          coachMark={eventHighlight.coachMark}
          coachMarkPosition="left"
          onDismiss={eventHighlight.onDismiss}
        >
          {eventFab}
        </FeatureHighlight>
      ) : (
        eventFab
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: 80,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: theme.colors.secondary,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 10,
  },
  fabText: {
    position: "absolute",
    top: -20,
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.secondary,
    textAlign: "center",
    width: 80,
  },
  multiFabContainer: {
    position: "absolute",
    bottom: 80,
    right: 24,
    alignItems: "center",
    zIndex: 10,
  },
  stackedFab: {
    position: "relative",
    bottom: 0,
    right: 0,
  },
  dualFabContainer: {
    position: "absolute",
    bottom: Platform.OS === "android" ? 80 : 80,
    right: 24,
    alignItems: "center",
    zIndex: 10,
  },
  newsFab: {
    position: "relative",
    bottom: 0,
    right: 0,
    marginBottom: 24,
    borderColor: theme.colors.badge.child,
  },
  newsText: {
    color: theme.colors.badge.child,
  },
  eventFab: {
    position: "relative",
    bottom: 0,
    right: 0,
    borderColor: theme.colors.secondary,
  },
  eventText: {
    color: theme.colors.secondary,
  },
});
