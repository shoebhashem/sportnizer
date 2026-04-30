// HierarchyBreadcrumb.tsx
// Displays a hierarchical navigation path (Club › Group › Subgroup).
// Each segment can be tappable (if the user has permission) or view-only.
//
// Color rules:
//   isCurrent = true  → yellow (secondary)   — the screen the user is on
//   onPress defined   → blue (accent)         — navigable ancestor
//   neither           → grey (textSecondary)  — visible but not navigable

import { theme } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

export interface BreadcrumbSegment {
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  /** True when this segment represents the current screen level. */
  isCurrent?: boolean;
  /** When defined (and isCurrent is false), the segment is tappable. */
  onPress?: () => void;
}

interface Props {
  segments: BreadcrumbSegment[];
}

export default function HierarchyBreadcrumb({ segments }: Props) {
  if (segments.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          const tappable = !!segment.onPress && !segment.isCurrent;

          const color = segment.isCurrent
            ? theme.colors.secondary
            : tappable
              ? theme.colors.accent
              : theme.colors.textSecondary;

          const inner = (
            <View style={styles.segment}>
              <Ionicons name={segment.iconName} size={13} color={color} />
              <Text
                style={[
                  styles.label,
                  { color },
                  segment.isCurrent && styles.currentLabel,
                  tappable && styles.tappableLabel,
                ]}
                numberOfLines={1}
              >
                {segment.label}
              </Text>
            </View>
          );

          return (
            <React.Fragment key={index}>
              {tappable ? (
                <TouchableOpacity onPress={segment.onPress} activeOpacity={0.7}>
                  {inner}
                </TouchableOpacity>
              ) : (
                inner
              )}
              {!isLast && <Text style={styles.separator}>›</Text>}
            </React.Fragment>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.inputBorder,
  },
  scrollContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
  },
  segment: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  label: {
    fontSize: 13,
  },
  currentLabel: {
    fontWeight: "600",
  },
  tappableLabel: {
    textDecorationLine: "underline",
  },
  separator: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginHorizontal: 2,
  },
});
