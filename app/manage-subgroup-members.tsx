import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import { theme } from "@/constants/theme";
import { useGroupData } from "@/contexts/GroupDataContext";
import { subgroupService } from "@/services/subgroup";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

interface Member {
  userId: string;
  role?: string; // Legacy field for backward compatibility
  roles?: string[]; // New field for multiple roles
  name: string;
  email: string;
  selected: boolean;
  originallySelected: boolean; // Track original state to determine what changed
}

export default function ManageSubgroupMembersScreen() {
  const { groupId, clubId, subgroupId, subgroupName } = useLocalSearchParams();
  const { t } = useTranslation(["screens", "common"]);
  const { getGroupMembers, getSubgroupMembers: getSubgroupMembersFromCtx } =
    useGroupData();

  // Derive data from real-time context
  const contextGroupMembers = getGroupMembers(
    clubId as string,
    groupId as string,
  );
  const contextSubgroupMembers = getSubgroupMembersFromCtx(
    clubId as string,
    groupId as string,
    subgroupId as string,
  );

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({
    visible: false,
    title: "",
    message: "",
  });

  const showError = (title: string, message: string) => {
    setErrorModal({ visible: true, title, message });
  };

  // Build initial member list from context data
  const initialMembers = useMemo(() => {
    if (!contextGroupMembers.length) return [];

    const subgroupMemberIds = new Set(
      contextSubgroupMembers.map((m) => m.userId),
    );

    return contextGroupMembers.map((memberData) => {
      const memberRoles = memberData.roles || [];
      const memberRole = memberRoles[0] || "member";
      const memberName =
        memberData.name || memberData.email?.split("@")[0] || "Unknown User";
      const isInSubgroup = subgroupMemberIds.has(memberData.userId);

      return {
        userId: memberData.userId,
        role: memberRole,
        roles: memberRoles,
        name: memberName,
        email: memberData.email || "",
        selected: isInSubgroup,
        originallySelected: isInSubgroup,
      };
    });
  }, [contextGroupMembers, contextSubgroupMembers]);

  // Initialize members from context (only when context changes and user hasn't started editing)
  useEffect(() => {
    setMembers(initialMembers);
    setLoading(false);
  }, [initialMembers]);

  const toggleMemberSelection = (userId: string) => {
    setMembers((prev) =>
      prev.map((member) =>
        member.userId === userId
          ? { ...member, selected: !member.selected }
          : member,
      ),
    );
  };

  const handleSave = async () => {
    if (
      !groupId ||
      !clubId ||
      !subgroupId ||
      typeof groupId !== "string" ||
      typeof clubId !== "string" ||
      typeof subgroupId !== "string"
    )
      return;

    setSaving(true);
    try {
      // Find members whose selection changed
      const membersToAdd = members.filter(
        (m) => m.selected && !m.originallySelected,
      );
      const membersToRemove = members.filter(
        (m) => !m.selected && m.originallySelected,
      );

      console.log(
        `Changes: ${membersToAdd.length} to add, ${membersToRemove.length} to remove`,
      );

      // Process additions using the new atomic function
      for (const member of membersToAdd) {
        try {
          console.log("Adding member to subgroup:", {
            clubId,
            groupId,
            subGroupId: subgroupId,
            userId: member.userId,
            memberName: member.name,
          });

          const result = await subgroupService.addMemberToSubgroup(
            clubId,
            groupId,
            subgroupId,
            member.userId,
          );

          if (!result.success) {
            console.error("Failed to add member:", result.error);
            showError("Error", `Failed to add ${member.name}: ${result.error}`);
          }
        } catch (error) {
          console.error("Error adding member to subgroup:", error);
          showError(
            t("common:error"),
            `Failed to add ${member.name} to subgroup`,
          );
        }
      }

      // Process removals using the new atomic function
      for (const member of membersToRemove) {
        try {
          console.log("Removing member from subgroup:", {
            clubId,
            groupId,
            subGroupId: subgroupId,
            userId: member.userId,
            memberName: member.name,
          });

          const result = await subgroupService.removeMemberFromSubgroup(
            clubId,
            groupId,
            subgroupId,
            member.userId,
          );

          if (!result.success) {
            console.error("Failed to remove member:", result.error);
            showError(
              t("common:error"),
              `Failed to remove ${member.name}: ${result.error}`,
            );
          }
        } catch (error) {
          console.error("Error removing member from subgroup:", error);
          showError(
            t("common:error"),
            `Failed to remove ${member.name} from subgroup`,
          );
        }
      }

      // Navigate back on success
      router.back();
    } catch (error) {
      console.error("Error saving subgroup members:", error);
      showError(
        t("common:error"),
        t("screens:manageSubgroupMembers.failedToSaveMembers"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  const renderMemberItem = ({ item }: { item: Member }) => (
    <TouchableOpacity
      style={styles.memberItem}
      onPress={() => toggleMemberSelection(item.userId)}
    >
      <View style={styles.memberInfo}>
        <Text style={styles.memberText}>{item.name}</Text>
        <Text style={styles.memberRole}>{item.role}</Text>
      </View>
      <View style={styles.checkbox}>
        {item.selected && (
          <Ionicons name="checkmark" size={20} color={theme.colors.secondary} />
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>{t("common:loading")}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <FlatList
        data={members}
        renderItem={renderMemberItem}
        keyExtractor={(item) => item.userId}
        ListHeaderComponent={
          <>
            <Text style={styles.subtitle}>
              {t("screens:manageSubgroupMembers.selectMembersFor", {
                name:
                  typeof subgroupName === "string" ? subgroupName : "Subgroup",
              })}
            </Text>

            <View style={styles.content}>
              <Text style={styles.instructionText}>
                {t("screens:manageSubgroupMembers.tapToSelectDeselect")}
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {t("screens:manageSubgroupMembers.noMembersInGroup")}
            </Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.buttonContainer}>
            <Button
              label={t("screens:manageSubgroupMembers.saveChanges")}
              onPress={handleSave}
              theme="primary"
              loading={saving}
              disabled={saving}
            />

            <Button
              label={t("common:cancel")}
              onPress={handleCancel}
              theme="secondary"
              disabled={saving}
            />
          </View>
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.membersList}
      />

      <ConfirmationModal
        visible={errorModal.visible}
        title={errorModal.title}
        message={errorModal.message}
        confirmText={t("common:ok")}
        onConfirm={() =>
          setErrorModal({ visible: false, title: "", message: "" })
        }
        onCancel={() =>
          setErrorModal({ visible: false, title: "", message: "" })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.layout.containerPadding,
    paddingBottom: theme.spacing.xl,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    lineHeight: 22,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: theme.spacing.xl,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  instructionText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    textAlign: "center",
  },
  membersList: {
    flex: 1,
    marginBottom: theme.spacing.lg,
  },
  memberItem: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.small,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  memberInfo: {
    flex: 1,
  },
  memberText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  memberRole: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
    textTransform: "capitalize",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.textSecondary,
    backgroundColor: theme.colors.inputBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    padding: theme.spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  buttonContainer: {
    gap: theme.spacing.md,
  },
});
