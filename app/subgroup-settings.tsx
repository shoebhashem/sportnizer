import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import Input from "@/components/Input";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useGroupData } from "@/contexts/GroupDataContext";
import { useUser } from "@/contexts/UserContext";
import { SubGroup, subgroupService } from "@/services/subgroup";
import {
    isClubAdmin as checkIsClubAdmin,
    getGroupRoles,
} from "@/utils/permissionHelpers";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function SubgroupSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation(["screens", "common"]);
  const { groupId, clubId, subgroupId, subgroupName } = useLocalSearchParams();
  const { user } = useAuth();
  const { userProfile } = useUser();
  const { getGroup: getGroupFromCtx, getSubgroups: getSubgroupsFromCtx } =
    useGroupData();
  const navigation = useNavigation();

  // Derive data from real-time contexts
  const group = getGroupFromCtx(clubId as string, groupId as string);
  const contextSubgroups = getSubgroupsFromCtx(
    clubId as string,
    groupId as string,
  );
  const subgroup = useMemo(
    () =>
      (contextSubgroups.find((sg) => sg.id === (subgroupId as string)) as
        | SubGroup
        | undefined) ?? null,
    [contextSubgroups, subgroupId],
  );
  const loading = !group;

  // Derive user role from permissionHelpers (sync)
  const userRole = useMemo(() => {
    if (!userProfile) return "member";
    const cId = clubId as string;
    const gId = groupId as string;
    if (checkIsClubAdmin(userProfile, cId)) return "club-admin";
    const roles = getGroupRoles(userProfile, cId, gId);
    if (roles.includes("admin")) return "admin";
    if (roles.includes("coach")) return "coach";
    return "member";
  }, [userProfile, clubId, groupId]);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newName, setNewName] = useState(subgroup?.name || "");
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
        setSuccessMessage(t("screens:subgroupSettings.subgroupRenamed"));
        setShowSuccessModal(true);
        // Context will auto-refresh via onSnapshot
      } else {
        setErrorMessage(
          result.error || t("screens:subgroupSettings.failedToRenameSubgroup"),
        );
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error("Error renaming subgroup:", error);
      setErrorMessage(t("screens:subgroupSettings.failedToRenameSubgroup"));
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
          t("screens:subgroupSettings.subgroupDeleted", {
            count: result.deletedMemberCount || 0,
          }),
        );
        setShowSuccessModal(true);

        // Navigate back to manage-group with subgroups tab
        setTimeout(() => {
          router.push(
            `/manage-group?groupId=${groupId}&clubId=${clubId}&clubName=${encodeURIComponent(group?.clubName || "")}&tab=subgroups` as any,
          );
        }, 1500);
      } else {
        setErrorMessage(
          result.error || t("screens:subgroupSettings.failedToDeleteSubgroup"),
        );
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error("Error deleting subgroup:", error);
      setErrorMessage(
        t("screens:subgroupSettings.failedToDeleteSubgroupRetry"),
      );
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
          <Text style={styles.loadingText}>
            {t("screens:subgroupSettings.loadingSubgroupSettings")}
          </Text>
        </View>
      </View>
    );
  }

  if (!group || !subgroup) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {t("screens:subgroupSettings.subgroupNotFound")}
          </Text>
          <Button
            label={t("common:goBack")}
            onPress={() => router.back()}
            theme="secondary"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Subgroup Info */}
        <View style={styles.groupInfoContainer}>
          <Text style={styles.subgroupName}>{subgroup.name}</Text>
          <Text style={styles.groupName}>
            {t("screens:subgroupSettings.inGroup", { groupName: group.name })}
          </Text>
          <Text style={styles.yourRole}>
            {t("screens:subgroupSettings.memberCount", {
              count: subgroup.memberCount,
            })}
          </Text>
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
                <Text style={styles.optionTitle}>
                  {t("screens:subgroupSettings.manageMembers")}
                </Text>
                <Text style={styles.optionDescription}>
                  {t("screens:subgroupSettings.manageMembersDesc")}
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
                <Text style={styles.optionTitle}>
                  {t("screens:subgroupSettings.renameSubgroup")}
                </Text>
                <Text style={styles.optionDescription}>
                  {t("screens:subgroupSettings.renameSubgroupDesc")}
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
            <Text style={styles.modalTitle}>
              {t("screens:subgroupSettings.renameModal.title")}
            </Text>
            <Input
              label={t("screens:subgroupSettings.renameModal.newName")}
              value={newName}
              onChangeText={setNewName}
              placeholder={t(
                "screens:subgroupSettings.renameModal.placeholder",
              )}
            />
            <View style={styles.modalButtons}>
              <View style={{ flex: 1, marginRight: theme.spacing.sm }}>
                <Button
                  label={t("common:cancel")}
                  onPress={() => setShowRenameModal(false)}
                  theme="secondary"
                  disabled={renaming}
                />
              </View>
              <View style={{ flex: 1, marginLeft: theme.spacing.sm }}>
                <Button
                  label={
                    renaming
                      ? t("common:renaming")
                      : t("screens:subgroupSettings.renameModal.rename")
                  }
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
        title={t("screens:subgroupSettings.deleteSubgroup")}
        message={t("screens:subgroupSettings.deleteSubgroupConfirm", {
          name: subgroup.name,
        })}
        confirmText={t("common:delete")}
        cancelText={t("common:cancel")}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteModal(false)}
        confirmButtonTheme="primary"
      />

      {/* Success Modal */}
      <ConfirmationModal
        visible={showSuccessModal}
        title={t("common:success")}
        message={successMessage}
        confirmText={t("common:ok")}
        onConfirm={() => setShowSuccessModal(false)}
        onCancel={() => setShowSuccessModal(false)}
        confirmButtonTheme="secondary"
      />

      {/* Error Modal */}
      <ConfirmationModal
        visible={showErrorModal}
        title={t("common:error")}
        message={errorMessage}
        confirmText={t("common:ok")}
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
