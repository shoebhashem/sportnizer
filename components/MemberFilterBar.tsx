/**
 * MemberFilterBar — Reusable filter component for member lists.
 *
 * Renders two pill-row filters (matching the Events screen styling):
 *   Row 1 – Status: All | Active | Inactive
 *   Row 2 – Role:   All | Player | Player (U) | Coach | Admin | …
 *
 * The available role options are passed in via `availableRoles` so consumers
 * can tailor the list (e.g. manage-group excludes Club Admin & Guardian).
 */

import { theme } from "@/constants/theme";
import React from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

// ── Public types ────────────────────────────────────────────────────
export type StatusFilter = "all" | "active" | "inactive";

export type RoleFilter =
  | "all"
  | "player"
  | "player-underage"
  | "coach"
  | "admin"
  | "club-admin"
  | "guardian";

export interface RoleOption {
  value: RoleFilter;
  label: string;
}

interface MemberFilterBarProps {
  statusFilter: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  roleFilter: RoleFilter;
  onRoleChange: (role: RoleFilter) => void;
  /** Which role pills to display — order is preserved. */
  availableRoles: RoleOption[];
}

// ── Component ───────────────────────────────────────────────────────
export default function MemberFilterBar({
  statusFilter,
  onStatusChange,
  roleFilter,
  onRoleChange,
  availableRoles,
}: MemberFilterBarProps) {
  const { t } = useTranslation(["components"]);

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: t("components:memberFilterBar.all") },
    { value: "active", label: t("components:memberFilterBar.active") },
    { value: "inactive", label: t("components:memberFilterBar.inactive") },
  ];

  return (
    <View style={styles.container}>
      {/* Row 1 – Status filter */}
      <View style={styles.pillRow}>
        {statusOptions.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.pill,
              statusFilter === opt.value && styles.pillActive,
            ]}
            onPress={() => onStatusChange(opt.value)}
          >
            <Text
              style={[
                styles.pillText,
                statusFilter === opt.value && styles.pillTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Row 2 – Role filter */}
      <View style={styles.pillRow}>
        {availableRoles.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.pill, roleFilter === opt.value && styles.pillActive]}
            onPress={() => onRoleChange(opt.value)}
          >
            <Text
              style={[
                styles.pillText,
                roleFilter === opt.value && styles.pillTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Styles — matches events.tsx pill filters ────────────────────────
const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  pillRow: {
    flexDirection: "row",
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: 4,
  },
  pill: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: "center",
    borderRadius: theme.borderRadius.small,
  },
  pillActive: {
    backgroundColor: theme.colors.secondary,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  pillTextActive: {
    color: theme.colors.primary,
  },
});
