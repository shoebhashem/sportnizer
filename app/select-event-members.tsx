/**
 * SELECT EVENT MEMBERS SCREEN
 * ============================
 *
 * Screen for selecting specific members to target when creating an event.
 * Reuses the same member selection UI pattern as remove-member and manage-subgroup-members.
 *
 * FLOW:
 * 1. Receives event context (clubId, groupId, subgroupId, level) + optional pre-selected IDs
 * 2. Loads members from ClubDataContext (club level) or GroupDataContext (group/subgroup level)
 * 3. Optionally filters by role if roleFilter is active
 * 4. User selects/deselects members via checkboxes
 * 5. On confirm, navigates back to source screen (create-event or create-news) with selectedMemberIds as param
 */

import Button from "@/components/Button";
import { getDefaultProfilePicture } from "@/constants/profilePictures";
import { theme } from "@/constants/theme";
import { useClubData } from "@/contexts/ClubDataContext";
import { useGroupData } from "@/contexts/GroupDataContext";
import { setSelectedMemberIds } from "@/utils/memberSelectionStore";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
    FlatList,
    Image,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface MemberItem {
  userId: string;
  name: string;
  email: string;
  roles: string[];
  photoURL?: string;
  needsGuardian?: boolean;
  isActive?: boolean;
}

export default function SelectEventMembersScreen() {
  const {
    clubId,
    groupId,
    subgroupId,
    level,
    clubName,
    groupName,
    subgroupName,
    sourceScreen,
    roleFilter: roleFilterParam,
    preSelectedIds: preSelectedIdsParam,
  } = useLocalSearchParams();
  const { t } = useTranslation(["screens", "common"]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { getGroupMembers, getSubgroupMembers } = useGroupData();
  const { getClubMembers } = useClubData();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  // Set the header title dynamically based on the scope
  const scopeName =
    level === "subgroup"
      ? subgroupName
      : level === "group"
        ? groupName
        : clubName;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: scopeName
        ? `${t("screens:createEvent.selectMembers")} · ${scopeName}`
        : t("screens:createEvent.selectMembers"),
    });
  }, [navigation, scopeName, t]);

  // Parse pre-selected IDs from params
  useEffect(() => {
    if (preSelectedIdsParam) {
      const ids =
        typeof preSelectedIdsParam === "string"
          ? preSelectedIdsParam.split(",").filter(Boolean)
          : Array.isArray(preSelectedIdsParam)
            ? preSelectedIdsParam.filter(Boolean)
            : [];
      if (ids.length > 0) {
        setSelectedIds(new Set(ids));
      }
    }
  }, [preSelectedIdsParam]);

  // Parse role filter from params
  const roleFilter = useMemo(() => {
    if (!roleFilterParam) return [];
    if (typeof roleFilterParam === "string") {
      return roleFilterParam.split(",").filter(Boolean);
    }
    return Array.isArray(roleFilterParam)
      ? roleFilterParam.filter(Boolean)
      : [];
  }, [roleFilterParam]);

  // Derive members directly from real-time context (same pattern as manage-club)
  const contextMembers = useMemo((): MemberItem[] => {
    if (
      level === "subgroup" &&
      typeof clubId === "string" &&
      typeof groupId === "string" &&
      typeof subgroupId === "string"
    ) {
      return getSubgroupMembers(clubId, groupId, subgroupId);
    }
    if (
      level === "group" &&
      typeof clubId === "string" &&
      typeof groupId === "string"
    ) {
      return getGroupMembers(clubId, groupId);
    }
    if (level === "club" && typeof clubId === "string") {
      return getClubMembers(clubId);
    }
    return [];
  }, [
    level,
    clubId,
    groupId,
    subgroupId,
    getSubgroupMembers,
    getGroupMembers,
    getClubMembers,
  ]);

  // Derived filtered member list (same pattern as manage-club filteredMembers)
  const filteredMembers = useMemo(() => {
    let result = [...contextMembers] as MemberItem[];

    // Filter out inactive members
    result = result.filter((m) => m.isActive !== false);

    // Apply role filter if provided
    if (roleFilter.length > 0) {
      result = result.filter((m) =>
        m.roles?.some((role) => roleFilter.includes(role)),
      );
    }

    // Search filter (name or email)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (m) =>
          m.name?.toLowerCase().includes(q) ||
          m.email?.toLowerCase().includes(q),
      );
    }

    return result;
  }, [contextMembers, roleFilter, searchQuery]);

  const toggleMember = useCallback((userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredMembers.length) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all visible members
      setSelectedIds(new Set(filteredMembers.map((m) => m.userId)));
    }
  }, [filteredMembers, selectedIds.size]);

  const handleConfirm = () => {
    // Store selected IDs and go back to the previous screen
    setSelectedMemberIds(Array.from(selectedIds));
    router.back();
  };

  const handleClear = () => {
    setSelectedIds(new Set());
  };

  const renderMemberItem = ({ item }: { item: MemberItem }) => {
    const isSelected = selectedIds.has(item.userId);

    return (
      <TouchableOpacity
        style={[styles.memberItem, isSelected && styles.memberItemSelected]}
        onPress={() => toggleMember(item.userId)}
      >
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && (
            <Ionicons name="checkmark" size={16} color={theme.colors.primary} />
          )}
        </View>
        <Image
          style={styles.memberAvatar}
          source={{
            uri: item.photoURL || getDefaultProfilePicture(item.needsGuardian),
          }}
        />
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.name}</Text>
          <Text style={styles.memberRole}>
            {[...new Set(item.roles)]?.join(", ") || "member"}
            {item.needsGuardian && " (Child/Youth)"}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (filteredMembers.length === 0 && !searchQuery) {
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <View style={styles.emptyState}>
          <Ionicons
            name="people-outline"
            size={64}
            color={theme.colors.textSecondary}
          />
          <Text style={styles.emptyStateText}>
            {t("screens:createEvent.noMembersAvailable")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons
          name="search"
          size={20}
          color={theme.colors.textSecondary}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder={t("screens:createEvent.searchMembersPlaceholder")}
          placeholderTextColor={theme.colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons
              name="close-circle"
              size={20}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Select All / Count Info */}
      <View style={styles.selectionBar}>
        <TouchableOpacity onPress={handleSelectAll} style={styles.selectAllBtn}>
          <Ionicons
            name={
              selectedIds.size === filteredMembers.length &&
              filteredMembers.length > 0
                ? "checkbox"
                : "square-outline"
            }
            size={22}
            color={theme.colors.secondary}
            style={{ marginRight: 8 }}
          />
          <Text style={styles.selectAllText}>
            {t("screens:createEvent.selectAll")}
          </Text>
        </TouchableOpacity>
        <Text style={styles.countText}>
          {selectedIds.size > 0
            ? t("screens:createEvent.membersSelected", {
                count: selectedIds.size,
              })
            : t("screens:createEvent.totalMembers", {
                count: filteredMembers.length,
              })}
        </Text>
      </View>

      {/* Member List */}
      <View style={styles.content}>
        {filteredMembers.length > 0 ? (
          <FlatList
            data={filteredMembers}
            renderItem={renderMemberItem}
            keyExtractor={(item) => item.userId}
            style={styles.membersList}
            contentContainerStyle={[
              styles.membersListContent,
              selectedIds.size > 0 && styles.membersListContentWithActions,
            ]}
          />
        ) : (
          <View style={styles.emptyState}>
            <Ionicons
              name="people-outline"
              size={64}
              color={theme.colors.textSecondary}
            />
            <Text style={styles.emptyStateText}>
              {searchQuery
                ? t("screens:createEvent.noMembersMatchSearch")
                : t("screens:createEvent.noMembersAvailable")}
            </Text>
          </View>
        )}
      </View>

      {/* Bottom Action Bar */}
      {selectedIds.size > 0 && (
        <View
          style={[
            styles.actionContainer,
            { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) },
          ]}
        >
          <View style={styles.actionButton}>
            <Button
              label={t("screens:createEvent.clearSelection")}
              onPress={handleClear}
              theme="secondary"
            />
          </View>
          <View style={styles.actionButton}>
            <Button
              label={t("screens:createEvent.confirmSelection", {
                count: selectedIds.size,
              })}
              onPress={handleConfirm}
              theme="primary"
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    marginHorizontal: theme.layout.containerPadding,
    marginVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  selectionBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.layout.containerPadding,
    paddingBottom: theme.spacing.sm,
  },
  selectAllBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectAllText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
  },
  countText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.layout.containerPadding,
  },
  membersList: {
    flex: 1,
  },
  membersListContent: {
    paddingBottom: theme.spacing.xl,
  },
  membersListContentWithActions: {
    paddingBottom: 100,
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  memberItemSelected: {
    borderColor: theme.colors.secondary,
    backgroundColor: `${theme.colors.secondary}10`,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.textSecondary,
    marginRight: theme.spacing.md,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  memberAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.secondary,
    marginRight: theme.spacing.md,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  memberRole: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: theme.spacing.xxl,
  },
  emptyStateText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
    textAlign: "center",
  },
  actionContainer: {
    flexDirection: "row",
    gap: theme.spacing.md,
    paddingHorizontal: theme.layout.containerPadding,
    paddingTop: theme.spacing.lg,
    backgroundColor: theme.colors.primary,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  actionButton: {
    flex: 1,
  },
});
