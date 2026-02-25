import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import { theme } from "@/constants/theme";
import { fetchGroupMembers } from "@/services/fetchGroupMembers";
import { subgroupService } from "@/services/subgroup";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    ScrollView,
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

  const fetchMembersAndSubgroup = useCallback(async () => {
    if (
      !groupId ||
      !clubId ||
      !subgroupId ||
      typeof groupId !== "string" ||
      typeof clubId !== "string" ||
      typeof subgroupId !== "string"
    )
      return;

    setLoading(true);
    console.log("Fetching members with params:", {
      groupId,
      clubId,
      subgroupId,
    });
    try {
      // Fetch all group members and current subgroup members
      const [groupMembersResult, subgroupMembersResult] = await Promise.all([
        fetchGroupMembers(clubId, groupId),
        subgroupService.getSubgroupMembers(clubId, groupId, subgroupId),
      ]);

      const allGroupMembers = groupMembersResult.success
        ? groupMembersResult.members || []
        : [];
      const subgroupMembers = subgroupMembersResult.success
        ? subgroupMembersResult.members || []
        : [];

      if (allGroupMembers.length === 0) {
        console.log("No members found in group");
        setMembers([]);
        setLoading(false);
        return;
      }

      // Create a Set of subgroup member IDs for quick lookup
      const subgroupMemberIds = new Set(
        subgroupMembers.map((m: any) => m.userId),
      );

      const processedMembers: Member[] = allGroupMembers.map(
        (memberData: any) => {
          // Handle both old role field and new roles array
          let memberRole = "member";
          let memberRoles: string[] = [];

          if (memberData.roles && Array.isArray(memberData.roles)) {
            // New schema: roles array
            memberRoles = memberData.roles;
            memberRole = memberRoles[0] || "member"; // Use first role as primary for display
          } else {
            // Old schema: role string
            memberRole = memberData.role || "member";
            memberRoles = [memberRole];
          }

          // Get member name
          const memberName =
            memberData.name ||
            memberData.email?.split("@")[0] ||
            "Unknown User";

          // Check if member is currently in this subgroup
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
        },
      );

      setMembers(processedMembers);
    } catch (error) {
      console.error("Error fetching members:", error);
      showError("Error", "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [groupId, clubId, subgroupId]);

  useEffect(() => {
    fetchMembersAndSubgroup();
  }, [fetchMembersAndSubgroup]);

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
          showError("Error", `Failed to add ${member.name} to subgroup`);
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
              "Error",
              `Failed to remove ${member.name}: ${result.error}`,
            );
          }
        } catch (error) {
          console.error("Error removing member from subgroup:", error);
          showError("Error", `Failed to remove ${member.name} from subgroup`);
        }
      }

      // Navigate back on success
      router.back();
    } catch (error) {
      console.error("Error saving subgroup members:", error);
      showError("Error", "Failed to save subgroup members");
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
          <Text style={styles.loadingText}>Loading members...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Subtitle showing subgroup name */}
        <Text style={styles.subtitle}>
          Select members for{" "}
          {typeof subgroupName === "string" ? subgroupName : "Subgroup"}
        </Text>

        <View style={styles.content}>
          <Text style={styles.instructionText}>
            Tap to select/deselect members for this subgroup:
          </Text>

          {members.length > 0 ? (
            <FlatList
              data={members}
              renderItem={renderMemberItem}
              keyExtractor={(item) => item.userId}
              scrollEnabled={false}
              style={styles.membersList}
            />
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No members found in this group
              </Text>
            </View>
          )}

          <View style={styles.buttonContainer}>
            <Button
              label="Save Changes"
              onPress={handleSave}
              theme="primary"
              loading={saving}
              disabled={saving}
            />

            <Button
              label="Cancel"
              onPress={handleCancel}
              theme="secondary"
              disabled={saving}
            />
          </View>
        </View>
      </ScrollView>

      <ConfirmationModal
        visible={errorModal.visible}
        title={errorModal.title}
        message={errorModal.message}
        confirmText="OK"
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
