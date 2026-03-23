/**
 * MemberFilterBar — Reusable filter component for member lists.
 *
 * Renders pill-row filters (matching the Events screen styling):
 *   Row 1 – Status: All | Active | Inactive
 *   Role rows – automatically split into two rows when >5 pills
 *     (e.g. Row 2: All | Player | Player (U) | Coach,
 *      Row 3: Admin | Club Admin | Guardian)
 *
 * Optionally renders a search input when `searchQuery` / `onSearchChange`
 * are provided.
 *
 * The available role options are passed in via `availableRoles` so consumers
 * can tailor the list (e.g. manage-group excludes Club Admin & Guardian).
 */

import { theme } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

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
  /** Optional search query — when provided, a search input is rendered. */
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

/** Max pills per row before splitting into multiple rows. */
const MAX_PILLS_PER_ROW = 5;

// ── Component ───────────────────────────────────────────────────────
export default function MemberFilterBar({
  statusFilter,
  onStatusChange,
  roleFilter,
  onRoleChange,
  availableRoles,
  searchQuery,
  onSearchChange,
}: MemberFilterBarProps) {
  const { t } = useTranslation(["components"]);

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: t("components:memberFilterBar.all") },
    { value: "active", label: t("components:memberFilterBar.active") },
    { value: "inactive", label: t("components:memberFilterBar.inactive") },
  ];

  // Split role pills into rows of MAX_PILLS_PER_ROW when there are too many
  const roleRows: RoleOption[][] = [];
  if (availableRoles.length > MAX_PILLS_PER_ROW) {
    // Split roughly in half: first row gets ceil(n/2), second gets the rest
    const splitAt = Math.ceil(availableRoles.length / 2);
    roleRows.push(availableRoles.slice(0, splitAt));
    roleRows.push(availableRoles.slice(splitAt));
  } else {
    roleRows.push(availableRoles);
  }

  return (
    <View style={styles.container}>
      {/* Search input (optional) */}
      {onSearchChange !== undefined && (
        <View style={styles.searchContainer}>
          <Ionicons
            name="search"
            size={18}
            color={theme.colors.textSecondary}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder={t("components:memberFilterBar.searchPlaceholder")}
            placeholderTextColor={theme.colors.textSecondary}
            value={searchQuery}
            onChangeText={onSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {!!searchQuery && (
            <TouchableOpacity
              onPress={() => onSearchChange("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Status filter row */}
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

      {/* Role filter row(s) */}
      {roleRows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.pillRow}>
          {row.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.pill,
                roleFilter === opt.value && styles.pillActive,
              ]}
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
      ))}
    </View>
  );
}

// ── Styles — matches events.tsx pill filters ────────────────────────
const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
    paddingVertical: 0,
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
