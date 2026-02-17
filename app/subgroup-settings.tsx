import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import Input from "@/components/Input";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { fetchGroupMembers } from "@/services/fetchGroupMembers";
import { groupService } from "@/services/group";
import { SubGroup, subgroupService } from "@/services/subgroup";
import { GroupData } from "@/services/types/group";
import { Ionicons } from "@expo/vector-icons";
import {
    router,
    useFocusEffect,
    useLocalSearchParams,
    useNavigation,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { doc, getDoc } from "firebase/firestore";
import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useState,
} from "react";
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { db } from "../services/core/firebase";

export default function SubgroupSettingsScreen() {
  const { groupId, clubId, subgroupId, subgroupName } = useLocalSearchParams();
  const { user } = useAuth();
  const navigation = useNavigation();
  const [group, setGroup] = useState<GroupData | null>(null);
  const [subgroup, setSubgroup] = useState<SubGroup | null>(null);
  const [userRole, setUserRole] = useState<string>("member");
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const displayName =
    typeof subgroupName === "string"
      ? subgroupName
      : subgroup?.name || "Subgroup";

  // Set dynamic header with subgroup name
  useLayoutEffect(() => {
    navigation.setOptions({
      title: `${displayName} Settings`,
    });
  }, [displayName, navigation]);

  const fetchData = useCallback(async () => {
    if (
      !groupId ||
      typeof groupId !== "string" ||
      !clubId ||
      typeof clubId !== "string" ||
      !subgroupId ||
      typeof subgroupId !== "string" ||
      !user?.uid
    )
      return;

    try {
      // Fetch group, subgroup, members data, and user document
      const [groupResult, subgroupData, membersResult, userSnapshot] =
        await Promise.all([
          groupService.getGroup(clubId, groupId),
          subgroupService.getSubgroup(clubId, groupId, subgroupId),
          fetchGroupMembers(clubId, groupId),
          getDoc(doc(db, "users", user.uid)),
        ]);

      if (groupResult.success && groupResult.data) {
        setGroup(groupResult.data);
      }

      if (subgroupData) {
        setSubgroup(subgroupData);
        setNewName(subgroupData.name);
      }

      const userData = userSnapshot.data();

      // Find current user's role - check club-level first
      let userRole = "member";

      // First check club-level role from user document
      if (userData?.clubAccess) {
        const clubAccess = userData.clubAccess.find(
          (c: any) => c.clubId === clubId,
        );
        if (clubAccess?.role === "club-admin") {
          userRole = "club-admin"; // Club admin has all permissions in all groups
        }
      }

      // If not club-admin, check group-level roles
      if (userRole !== "club-admin") {
        const membersData = membersResult.success
          ? membersResult.members || []
          : [];

        membersData.forEach((member: any) => {
          if (member.userId === user.uid) {
            if (member.roles.includes("admin")) {
              userRole = "admin";
            } else if (member.roles.includes("coach")) {
              userRole = "coach";
            }
          }
        });

        // If user is the group creator, consider them as admin
        if (
          groupResult.success &&
          groupResult.data &&
          groupResult.data.createdBy === user.uid &&
          userRole === "member"
        ) {
          userRole = "admin";
        }
      }

      setUserRole(userRole);
    } catch (error) {
      console.error("Error fetching data:", error);
      setErrorMessage("Failed to load subgroup data");
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  }, [groupId, clubId, subgroupId, user?.uid]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const handleManageMembers = () => {
    const displayName =
      typeof subgroupName === "string"
        ? subgroupName
        : subgroup?.name || "Subgroup";
    router.push(
      `/manage-subgroup-members?groupId=${groupId}&clubId=${clubId}&subgroupId=${subgroupId}&subgroupName=${encodeURIComponent(displayName)}` as any,
    );
  };

  const handleRenameSubgroup = () => {
    if (subgroup) {
      setNewName(subgroup.name);
      setShowRenameModal(true);
    }
  };

  const confirmRename = async () => {
    if (!newName.trim() || newName.trim() === subgroup?.name) {
      setShowRenameModal(false);
      return;
    }

    if (!user?.uid || !clubId || !groupId || !subgroupId) return;

    setRenaming(true);

    try {
      const result = await subgroupService.updateSubgroup(
        clubId as string,
        groupId as string,
        subgroupId as string,
        user.uid,
        { name: newName.trim() },
      );

      if (result.success) {
        setShowRenameModal(false);
        setSuccessMessage("Subgroup renamed successfully!");
        setShowSuccessModal(true);
        await fetchData(); // Refresh data
      } else {
        setErrorMessage(result.error || "Failed to rename subgroup");
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error("Error renaming subgroup:", error);
      setErrorMessage("Failed to rename subgroup. Please try again.");
      setShowErrorModal(true);
    } finally {
      setRenaming(false);
    }
  };

  const handleDeleteSubgroup = () => {
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    setShowDeleteModal(false);

    if (!user?.uid || !clubId || !groupId || !subgroupId) return;

    try {
      const result = await subgroupService.deleteSubgroup(
        clubId as string,
        groupId as string,
        subgroupId as string,
        user.uid,
      );

      if (result.success) {
        setSuccessMessage(
          `Subgroup deleted successfully! ${result.deletedMemberCount || 0} members removed.`,
        );
        setShowSuccessModal(true);

        // Navigate back to manage-group with subgroups tab
        setTimeout(() => {
          router.push(
            `/manage-group?groupId=${groupId}&clubId=${clubId}&clubName=${encodeURIComponent(group?.clubName || "")}&tab=subgroups` as any,
          );
        }, 1500);
      } else {
        setErrorMessage(result.error || "Failed to delete subgroup");
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error("Error deleting subgroup:", error);
      setErrorMessage("Failed to delete subgroup. Please try again.");
      setShowErrorModal(true);
    }
  };

  const canManage =
    userRole === "club-admin" ||
    userRole === "admin" ||
    userRole === "coach" ||
    group?.createdBy === user?.uid;

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading subgroup settings...</Text>
        </View>
      </View>
    );
  }

  if (!group || !subgroup) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Subgroup not found</Text>
          <Button
            label="Go Back"
            onPress={() => router.back()}
            theme="secondary"
          />
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
        {/* Subgroup Info */}
        <View style={styles.groupInfoContainer}>
          <Text style={styles.subgroupName}>{subgroup.name}</Text>
          <Text style={styles.groupName}>in {group.name}</Text>
          <Text style={styles.yourRole}>{subgroup.memberCount} members</Text>
        </View>

        {/* Settings Options */}
        <View style={styles.optionsContainer}>
          {/* Manage Members Option - Only for Admin/Coach/Group Creator */}
          {canManage && (
            <TouchableOpacity
              style={styles.optionItem}
              onPress={handleManageMembers}
            >
              <View style={styles.optionIcon}>
                <Ionicons
                  name="people-outline"
                  size={24}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Manage Members</Text>
                <Text style={styles.optionDescription}>
                  Add or remove members from this subgroup
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          )}

          {/* Rename Subgroup - Only for Admin/Coach */}
          {canManage && (
            <TouchableOpacity
              style={styles.optionItem}
              onPress={handleRenameSubgroup}
            >
              <View style={styles.optionIcon}>
                <Ionicons
                  name="pencil-outline"
                  size={24}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Rename Subgroup</Text>
                <Text style={styles.optionDescription}>
                  Change the name of this subgroup
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          )}

          {/* Delete Subgroup option removed - now managed from group settings */}
        </View>
      </ScrollView>

      {/* Rename Modal */}
      <Modal
        visible={showRenameModal}
        transparent
        animationType="fade"
        onRequestClose={() => !renaming && setShowRenameModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rename Subgroup</Text>
            <Input
              label="New Name"
              value={newName}
              onChangeText={setNewName}
              placeholder="Enter new subgroup name"
            />
            <View style={styles.modalButtons}>
              <View style={{ flex: 1, marginRight: theme.spacing.sm }}>
                <Button
                  label="Cancel"
                  onPress={() => setShowRenameModal(false)}
                  theme="secondary"
                  disabled={renaming}
                />
              </View>
              <View style={{ flex: 1, marginLeft: theme.spacing.sm }}>
                <Button
                  label={renaming ? "Renaming..." : "Rename"}
                  onPress={confirmRename}
                  theme="primary"
                  disabled={renaming || !newName.trim()}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        visible={showDeleteModal}
        title="Delete Subgroup"
        message={`Are you sure you want to delete "${subgroup.name}"? All members will be removed from this subgroup. This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteModal(false)}
        confirmButtonTheme="primary"
      />

      {/* Success Modal */}
      <ConfirmationModal
        visible={showSuccessModal}
        title="Success"
        message={successMessage}
        confirmText="OK"
        onConfirm={() => setShowSuccessModal(false)}
        onCancel={() => setShowSuccessModal(false)}
        confirmButtonTheme="secondary"
      />

      {/* Error Modal */}
      <ConfirmationModal
        visible={showErrorModal}
        title="Error"
        message={errorMessage}
        confirmText="OK"
        onConfirm={() => setShowErrorModal(false)}
        onCancel={() => setShowErrorModal(false)}
        confirmButtonTheme="primary"
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.medium,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing.lg,
    paddingHorizontal: theme.layout.containerPadding,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.typography.fontSize.large,
    textAlign: "center",
  },
  groupInfoContainer: {
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.xl,
    alignItems: "center",
  },
  subgroupName: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: "bold",
    color: theme.colors.secondary,
    marginBottom: theme.spacing.xs,
  },
  groupName: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  yourRole: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    textTransform: "capitalize",
  },
  optionsContainer: {
    gap: theme.spacing.md,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  dangerOption: {
    borderColor: theme.colors.error,
    backgroundColor: `${theme.colors.error}10`,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${theme.colors.secondary}20`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: theme.spacing.md,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 2,
  },
  dangerText: {
    color: theme.colors.error,
  },
  optionDescription: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.lg,
  },
  modalContent: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.xl,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: "bold",
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    textAlign: "center",
  },
  modalButtons: {
    flexDirection: "row",
    marginTop: theme.spacing.lg,
  },
});
