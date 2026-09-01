/**
 * GroupFilterBar — Filter + search bar for the groups list on manage-club.
 *
 * Renders:
 *   Row 1 – Search input (group name)
 *   Row 2 – Status: All | Active | Inactive
 *   Row 3 – Sport:  All Sports | <sport1> | <sport2> … (only when sports exist)
 *
 * Available sports are derived in the parent and passed as `availableSports`.
 * When all groups share the same sport (or none have a sport), the sport row
 * is omitted automatically.
 */

import { theme } from "@/constants/theme";
import Ionicons from "@react-native-vector-icons/ionicons/static";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import type { StatusFilter } from "./MemberFilterBar";

interface GroupFilterBarProps {
  statusFilter: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  sportFilter: string;
  onSportChange: (sport: string) => void;
  /** Unique non-empty sport strings present in the current groups list. */
  availableSports: string[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function GroupFilterBar({
  statusFilter,
  onStatusChange,
  sportFilter,
  onSportChange,
  availableSports,
  searchQuery,
  onSearchChange,
}: GroupFilterBarProps) {
  const { t } = useTranslation(["components"]);

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: t("components:memberFilterBar.all") },
    { value: "active", label: t("components:memberFilterBar.active") },
    { value: "inactive", label: t("components:memberFilterBar.inactive") },
  ];

  return (
    <View style={styles.container}>
      {/* Search input */}
      <View style={styles.searchContainer}>
        <Ionicons
          name="search"
          size={18}
          color={theme.colors.textSecondary}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder={t("components:groupFilterBar.searchPlaceholder")}
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

      {/* Sport filter row — only shown when there are sports to filter by */}
      {availableSports.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sportRow}
        >
          {/* "All Sports" pill */}
          <TouchableOpacity
            style={[
              styles.pill,
              styles.pillSport,
              sportFilter === "all" && styles.pillActive,
            ]}
            onPress={() => onSportChange("all")}
          >
            <Text
              style={[
                styles.pillText,
                sportFilter === "all" && styles.pillTextActive,
              ]}
            >
              {t("components:groupFilterBar.allSports")}
            </Text>
          </TouchableOpacity>

          {availableSports.map((sport) => (
            <TouchableOpacity
              key={sport}
              style={[
                styles.pill,
                styles.pillSport,
                sportFilter === sport && styles.pillActive,
              ]}
              onPress={() => onSportChange(sport)}
            >
              <Text
                style={[
                  styles.pillText,
                  sportFilter === sport && styles.pillTextActive,
                ]}
              >
                {sport}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

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
  sportRow: {
    flexDirection: "row",
    gap: 6,
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
  pillSport: {
    flex: 0,
    paddingHorizontal: 14,
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
