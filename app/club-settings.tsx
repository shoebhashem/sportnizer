import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import CountdownTimer from "@/components/CountdownTimer";
import Input from "@/components/Input";
import { theme } from "@/constants/theme";
import { useClubData } from "@/contexts/ClubDataContext";
import { useUser } from "@/contexts/UserContext";
import { useTrackFeatureOnMount } from "@/hooks/useOnboardingFeatureTracker";
import { clubService } from "@/services/club";
import { memberService } from "@/services/member";
import { createNewGroupInExistingClub } from "@/services/orchestration/createNewGroupInExistingClub";
import { paymentService } from "@/services/paymentService";
import { isClubAdmin as checkClubAdmin } from "@/utils/permissionHelpers";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ClubSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation(["screens", "common"]);
  useTrackFeatureOnMount("club-settings-viewed");
  const { clubId } = useLocalSearchParams();
  const { firebaseUser, userProfile } = useUser();
  const { getClub, getClubMembers, isLoading: isClubLoading } = useClubData();
  const navigation = useNavigation();

  // Club data from context (real-time listener — no manual fetch needed)
  const club =
    (typeof clubId === "string" ? getClub(clubId) : undefined) ?? null;
  const loading = isClubLoading && !club;
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isReactivating, setIsReactivating] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [sportType, setSportType] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Remove Club Admin state
  const [showRemoveAdminModal, setShowRemoveAdminModal] = useState(false);
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
  const [isRemovingAdmin, setIsRemovingAdmin] = useState(false);

  // Stripe payment state
  const [stripeAccountStatus, setStripeAccountStatus] = useState<string | null>(
    null,
  );
  const isStripeEnabled = stripeAccountStatus === "active";

  // Manage Groups expandable section
  const [manageGroupsExpanded, setManageGroupsExpanded] = useState(false);

  // Set dynamic header with club name
  useLayoutEffect(() => {
    navigation.setOptions({
      title: club?.name
        ? t("screens:subgroupSettings.displayNameSettings", { name: club.name })
        : t("screens:clubSettings.loadingClubSettings"),
    });
  }, [club?.name, navigation]);

  // Check Stripe account status when club data becomes available
  useEffect(() => {
    if (!club?.stripe?.accountId || typeof clubId !== "string") return;
    paymentService
      .checkStripeStatus(clubId)
      .then((result) => {
        if (result.success && result.status?.chargesEnabled) {
          setStripeAccountStatus("active");
        } else if (result.success && result.status?.requiresAction) {
          setStripeAccountStatus("pending");
        }
      })
      .catch((err) => console.log("Could not fetch Stripe status:", err));
  }, [club?.stripe?.accountId, clubId]);

  const handleDeleteClub = () => {
    setShowDeleteModal(true);
  };

  const confirmDeleteClub = () => {
    setShowDeleteModal(false);
    // Show info modal about email process
    setSuccessMessage(
      t("screens:clubSettings.deleteClubEmailInstructions", {
        name: club?.name,
      }),
    );
    setShowSuccessModal(true);
  };

  const handleUndoDeletion = () => {
    setShowUndoModal(true);
  };

  const confirmUndoDeletion = async () => {
    setShowUndoModal(false);
    setIsReactivating(true);

    if (!clubId || !firebaseUser?.uid) return;

    try {
      const result = await clubService.reactivateClub(clubId as string);

      if (result.success) {
        setSuccessMessage(
          t("screens:clubSettings.clubReactivated") +
            (result.groupsReactivated
              ? " " +
                t("screens:clubSettings.clubReactivatedWithGroups", {
                  count: result.groupsReactivated,
                })
              : ""),
        );
        setShowSuccessModal(true);

        // Club data auto-refreshes via context listener
      } else {
        setErrorMessage(
          result.error || t("screens:clubSettings.failedToReactivateClub"),
        );
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error("Error reactivating club:", error);
      setErrorMessage(t("screens:clubSettings.failedToReactivateClubRetry"));
      setShowErrorModal(true);
    } finally {
      setIsReactivating(false);
    }
  };

  const handleAddGroup = () => {
    setGroupName("");
    setSportType("");
    setShowAddGroupModal(true);
  };

  const handleConfirmAddGroup = async () => {
    console.log("handleConfirmAddGroup called");
    console.log("groupName:", groupName);
    console.log("sportType:", sportType);

    if (!groupName.trim()) {
      console.log("Group name is empty, returning early");
      return;
    }

    if (!clubId || !firebaseUser?.uid || !firebaseUser?.email) {
      console.log("Missing user info:", {
        clubId,
        uid: firebaseUser?.uid,
        email: firebaseUser?.email,
      });
      setErrorMessage("Missing required user information");
      setShowErrorModal(true);
      return;
    }

    console.log("Starting group creation...");
    setCreatingGroup(true);

    try {
      console.log("Calling createNewGroupInExistingClub...");
      const result = await createNewGroupInExistingClub({
        clubId: clubId as string,
        groupData: {
          name: groupName.trim(),
          description: "",
          sport: sportType.trim() || undefined,
        },
        userId: firebaseUser.uid,
        userDisplayName:
          userProfile?.displayName ||
          firebaseUser.displayName ||
          "Unknown User",
        userEmail: userProfile?.email || firebaseUser.email || "",
        userPhotoURL:
          userProfile?.photoURL || firebaseUser.photoURL || undefined,
      });

      console.log("createNewGroupInExistingClub result:", result);

      if (result.success && result.groupId) {
        console.log("Group created successfully, closing modal");
        setShowAddGroupModal(false);
        setGroupName("");
        setSportType("");
        setSuccessMessage(
          t("screens:clubSettings.groupCreated", { name: groupName.trim() }),
        );
        setShowSuccessModal(true);

        // Navigate to the new group's manage screen
        router.push(
          `/manage-group?groupId=${result.groupId}&clubId=${clubId}&clubName=${encodeURIComponent(club?.name || "")}` as any,
        );
      } else {
        console.log("Group creation failed:", result.error);
        setErrorMessage(
          result.error || t("screens:clubSettings.failedToCreateGroup"),
        );
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error("Error creating group:", error);
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      setErrorMessage(`Failed to create group: ${errorMsg}`);
      setShowErrorModal(true);
    } finally {
      console.log("Resetting creatingGroup state");
      setCreatingGroup(false);
    }
  };

  const isScheduledForDeletion = !club?.isActive && club?.deletionScheduledAt;
  const isClubAdmin = checkClubAdmin(userProfile, clubId as string);

  // Build list of other club-admins (exclude self) from allMembers data
  const otherClubAdmins = useMemo(() => {
    if (!firebaseUser?.uid || typeof clubId !== "string") return [];
    const members = getClubMembers(clubId);
    return members
      .filter(
        (m) =>
          m.userId !== firebaseUser.uid &&
          m.isActive !== false &&
          m.roles?.includes("club-admin"),
      )
      .map((m) => ({
        uid: m.userId,
        name: m.name || m.userId,
        email: m.email || "",
      }));
  }, [firebaseUser?.uid, clubId, getClubMembers]);

  const handleRemoveClubAdmin = async () => {
    if (!selectedAdminId || typeof clubId !== "string") return;
    setIsRemovingAdmin(true);
    try {
      const result = await memberService.removeClubAdmin(
        clubId,
        selectedAdminId,
      );
      if (result.success) {
        setShowRemoveAdminModal(false);
        setSelectedAdminId(null);
        setSuccessMessage(t("screens:clubSettings.removeClubAdminSuccess"));
        setShowSuccessModal(true);
      } else {
        setErrorMessage(
          result.error || t("screens:clubSettings.removeClubAdminFailed"),
        );
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error("Error removing club admin:", error);
      setErrorMessage(t("screens:clubSettings.removeClubAdminFailed"));
      setShowErrorModal(true);
    } finally {
      setIsRemovingAdmin(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>
            {t("screens:clubSettings.loadingClubSettings")}
          </Text>
        </View>
      </View>
    );
  }

  if (!club) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {t("screens:clubSettings.clubNotFound")}
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
        {/* Club Info */}
        <View style={styles.clubInfoContainer}>
          <Text style={styles.clubName}>{club.name}</Text>
          {club.description && (
            <Text style={styles.clubDescription}>{club.description}</Text>
          )}
        </View>

        {/* Deletion Status Banner */}
        {isScheduledForDeletion && (
          <View style={styles.deletionBanner}>
            <View style={styles.deletionHeader}>
              <Ionicons name="warning" size={24} color={theme.colors.error} />
              <Text style={styles.deletionTitle}>
                {t("screens:clubSettings.scheduledForDeletion")}
              </Text>
            </View>
            <Text style={styles.deletionMessage}>
              {t("screens:clubSettings.clubWillBeDeleted")}
            </Text>
            <CountdownTimer
              deletionScheduledAt={club.deletionScheduledAt?.toMillis?.()}
              compact={false}
            />
            {isClubAdmin && (
              <View style={styles.undoButtonContainer}>
                <Button
                  label={
                    isReactivating
                      ? t("common:reactivating")
                      : t("screens:clubSettings.undoDeletion")
                  }
                  onPress={handleUndoDeletion}
                  theme="secondary"
                  disabled={isReactivating}
                />
              </View>
            )}
          </View>
        )}

        {/* Settings Options */}
        <View style={styles.optionsContainer}>
          {/* Manage Groups — expandable section (Add Group + Delete Group) */}
          {isClubAdmin && (
            <View
              style={[
                styles.optionItem,
                manageGroupsExpanded && styles.optionItemExpanded,
              ]}
            >
              {/* Header row — tap to expand/collapse */}
              <TouchableOpacity
                style={styles.expandableHeader}
                onPress={() => setManageGroupsExpanded((v) => !v)}
                activeOpacity={0.7}
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
                    {t("screens:clubSettings.manageGroups")}
                  </Text>
                  <Text style={styles.optionDescription}>
                    {t("screens:clubSettings.manageGroupsDesc")}
                  </Text>
                </View>
                <Ionicons
                  name={manageGroupsExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>

              {/* Expanded sub-options */}
              {manageGroupsExpanded && (
                <View style={styles.subOptionsContainer}>
                  {/* Add Group */}
                  <TouchableOpacity
                    style={styles.subOptionItem}
                    onPress={handleAddGroup}
                  >
                    <Ionicons
                      name="add-circle-outline"
                      size={20}
                      color={theme.colors.secondary}
                    />
                    <View style={styles.subOptionContent}>
                      <Text style={styles.subOptionTitle}>
                        {t("screens:clubSettings.addGroup")}
                      </Text>
                      <Text style={styles.subOptionDescription}>
                        {t("screens:clubSettings.addGroupDesc")}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={theme.colors.textSecondary}
                    />
                  </TouchableOpacity>

                  {/* Delete Group */}
                  {!isScheduledForDeletion && (
                    <TouchableOpacity
                      style={styles.subOptionItem}
                      onPress={() =>
                        router.push(
                          `/manage-club?clubId=${clubId}&tab=groups&deleteMode=true` as any,
                        )
                      }
                    >
                      <Ionicons
                        name="trash-bin-outline"
                        size={20}
                        color={theme.colors.secondary}
                      />
                      <View style={styles.subOptionContent}>
                        <Text style={styles.subOptionTitle}>
                          {t("screens:clubSettings.deleteGroup")}
                        </Text>
                        <Text style={styles.subOptionDescription}>
                          {t("screens:clubSettings.deleteGroupDesc")}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={theme.colors.textSecondary}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Add Club Admin Option - Only for Club Admin */}
          {isClubAdmin && (
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => {
                router.push({
                  pathname: "/add-adult-member",
                  params: {
                    clubId: clubId as string,
                    clubName: club?.name || "",
                    role: "club-admin",
                  },
                } as any);
              }}
            >
              <View style={styles.optionIcon}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={24}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>
                  {t("screens:clubSettings.addClubAdmin")}
                </Text>
                <Text style={styles.optionDescription}>
                  {t("screens:clubSettings.addClubAdminDesc")}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          )}

          {/* Remove Club Admin Option - Only for Club Admin with other admins */}
          {isClubAdmin && otherClubAdmins.length > 0 && (
            <TouchableOpacity
              style={[styles.optionItem, styles.dangerOption]}
              onPress={() => {
                setSelectedAdminId(null);
                setShowRemoveAdminModal(true);
              }}
            >
              <View style={styles.optionIcon}>
                <Ionicons
                  name="person-remove-outline"
                  size={24}
                  color={theme.colors.error}
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={[styles.optionTitle, styles.dangerText]}>
                  {t("screens:clubSettings.removeClubAdmin")}
                </Text>
                <Text style={styles.optionDescription}>
                  {t("screens:clubSettings.removeClubAdminDesc")}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.error}
              />
            </TouchableOpacity>
          )}

          {/* Subscription Option - PARKED (app is free)
             Kept for potential future reactivation.
             To re-enable: uncomment this block and update limits.ts + subscriptionConfig.ts */}
          {/* {isClubAdmin && (
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => {
                router.push({
                  pathname: "/subscription-settings",
                  params: {
                    clubId: clubId as string,
                  },
                } as any);
              }}
            >
              <View style={styles.optionIcon}>
                <Ionicons
                  name="diamond-outline"
                  size={24}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>
                  {t("screens:clubSettings.subscription")}
                </Text>
                <Text style={styles.optionDescription}>
                  {t("screens:clubSettings.subscriptionDesc")}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          )} */}

          {/* Payment Settings Option - Only for Club Admin */}
          {isClubAdmin && (
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => {
                router.push({
                  pathname: "/stripe-onboarding",
                  params: {
                    clubId: clubId as string,
                    clubName: club?.name || "",
                  },
                } as any);
              }}
            >
              <View style={styles.optionIcon}>
                <Ionicons
                  name="card-outline"
                  size={24}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>
                  {t("screens:clubSettings.paymentSettings")}
                </Text>
                <Text style={styles.optionDescription}>
                  {isStripeEnabled
                    ? t("screens:clubSettings.paymentSettingsDescActive")
                    : t("screens:clubSettings.paymentSettingsDescInactive")}
                </Text>
              </View>
              {isStripeEnabled ? (
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>
                    {t("common:active")}
                  </Text>
                </View>
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={theme.colors.textSecondary}
                />
              )}
            </TouchableOpacity>
          )}

          {/* Manage Fees - Only for Club Admin with active Stripe */}
          {isClubAdmin && isStripeEnabled && (
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => {
                router.push({
                  pathname: "/manage-fees",
                  params: {
                    clubId: clubId as string,
                    clubName: club?.name || "",
                  },
                } as any);
              }}
            >
              <View style={styles.optionIcon}>
                <Ionicons
                  name="receipt-outline"
                  size={24}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>
                  {t("screens:clubSettings.manageFees")}
                </Text>
                <Text style={styles.optionDescription}>
                  {t("screens:clubSettings.manageFeesDesc")}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          )}

          {/* Accounting - Only for Club Admin */}
          {isClubAdmin && (
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => {
                router.push({
                  pathname: "/accounting",
                  params: { clubId: clubId as string },
                } as any);
              }}
            >
              <View style={styles.optionIcon}>
                <Ionicons
                  name="bar-chart-outline"
                  size={24}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>
                  {t("screens:clubSettings.accounting")}
                </Text>
                <Text style={styles.optionDescription}>
                  {t("screens:clubSettings.accountingDesc")}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          )}

          {/* LOK-stöd - Only for Club Admin in Swedish clubs */}
          {isClubAdmin && club?.country === "SE" && (
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() =>
                router.push({
                  pathname: "/lok-reports",
                  params: { clubId: clubId as string },
                } as any)
              }
            >
              <View style={styles.optionIcon}>
                <Ionicons
                  name="ribbon-outline"
                  size={24}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>LOK-stöd</Text>
                <Text style={styles.optionDescription}>
                  Hantera RF-rapporter och deltagarstöd
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          )}

          {/* Delete Club Option - Only for Club Admin and not already scheduled */}
          {isClubAdmin && !isScheduledForDeletion && (
            <TouchableOpacity
              style={[styles.optionItem, styles.dangerOption]}
              onPress={handleDeleteClub}
            >
              <View style={styles.optionIcon}>
                <Ionicons
                  name="trash-outline"
                  size={24}
                  color={theme.colors.error}
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={[styles.optionTitle, styles.dangerText]}>
                  {t("screens:clubSettings.deleteClub")}
                </Text>
                <Text style={styles.optionDescription}>
                  {t("screens:clubSettings.deleteClubDesc")}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.error}
              />
            </TouchableOpacity>
          )}

          {/* Example placeholder options (uncomment/modify as needed) */}
          {/* 
          <TouchableOpacity 
            style={styles.optionItem}
            onPress={() => {}}
          >
            <View style={styles.optionIcon}>
              <Ionicons 
                name="settings-outline" 
                size={24} 
                color={theme.colors.secondary} 
              />
            </View>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>Edit Club Details</Text>
              <Text style={styles.optionDescription}>Update club name and description</Text>
            </View>
            <Ionicons 
              name="chevron-forward" 
              size={20} 
              color={theme.colors.textSecondary} 
            />
          </TouchableOpacity>
          */}
        </View>
      </ScrollView>

      {/* Delete Club Info Modal */}
      <ConfirmationModal
        visible={showDeleteModal}
        title={t("screens:clubSettings.deleteClub")}
        message={t("screens:clubSettings.deleteClubConfirm", {
          clubName: club?.name,
        })}
        confirmText={t("screens:clubSettings.showInstructions")}
        cancelText={t("common:cancel")}
        onConfirm={confirmDeleteClub}
        onCancel={() => setShowDeleteModal(false)}
        confirmButtonTheme="primary"
      />

      {/* Undo Deletion Confirmation Modal */}
      <ConfirmationModal
        visible={showUndoModal}
        title={t("screens:clubSettings.undoDeletion")}
        message={t("screens:clubSettings.undoDeletionConfirm", {
          name: club?.name,
        })}
        confirmText={
          isReactivating
            ? t("common:reactivating")
            : t("screens:groupSettings.reactivate")
        }
        cancelText={t("common:cancel")}
        onConfirm={confirmUndoDeletion}
        onCancel={() => setShowUndoModal(false)}
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
        confirmButtonTheme="primary"
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

      {/* Remove Club Admin Picker Modal */}
      <Modal
        visible={showRemoveAdminModal}
        transparent
        animationType="fade"
        onRequestClose={() =>
          !isRemovingAdmin && setShowRemoveAdminModal(false)
        }
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !isRemovingAdmin && setShowRemoveAdminModal(false)}
        >
          <View style={styles.modalContainer}>
            <Pressable onPress={() => {}} style={styles.modal}>
              <Text style={styles.modalTitle}>
                {t("screens:clubSettings.removeClubAdmin")}
              </Text>
              <Text style={styles.modalDescription}>
                {t("screens:clubSettings.removeClubAdminPickerDesc")}
              </Text>

              {otherClubAdmins.map((admin) => (
                <TouchableOpacity
                  key={admin.uid}
                  style={[
                    styles.adminPickerItem,
                    selectedAdminId === admin.uid &&
                      styles.adminPickerItemSelected,
                  ]}
                  onPress={() => setSelectedAdminId(admin.uid)}
                  disabled={isRemovingAdmin}
                >
                  <Ionicons
                    name={
                      selectedAdminId === admin.uid
                        ? "radio-button-on"
                        : "radio-button-off"
                    }
                    size={22}
                    color={
                      selectedAdminId === admin.uid
                        ? theme.colors.error
                        : theme.colors.textSecondary
                    }
                    style={{ marginRight: theme.spacing.sm }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.adminPickerName}>{admin.name}</Text>
                    {admin.email ? (
                      <Text style={styles.adminPickerEmail}>{admin.email}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))}

              <View style={styles.modalButtons}>
                <View style={styles.modalButton}>
                  <Button
                    label={t("common:cancel")}
                    onPress={() => setShowRemoveAdminModal(false)}
                    theme="secondary"
                    disabled={isRemovingAdmin}
                  />
                </View>
                <View style={styles.modalButton}>
                  <Button
                    label={
                      isRemovingAdmin
                        ? t("screens:clubSettings.removingAdmin")
                        : t("common:remove")
                    }
                    onPress={handleRemoveClubAdmin}
                    theme="primary"
                    disabled={isRemovingAdmin || !selectedAdminId}
                  />
                </View>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Add Group Modal */}
      <Modal
        visible={showAddGroupModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddGroupModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !creatingGroup && setShowAddGroupModal(false)}
        >
          <View style={styles.modalContainer}>
            <Pressable onPress={() => {}} style={styles.modal}>
              <Text style={styles.modalTitle}>
                {t("screens:clubSettings.addGroupModal.title")}
              </Text>
              <Text style={styles.modalDescription}>
                {t("screens:clubSettings.addGroupModal.subtitle", {
                  clubName: club?.name,
                })}
              </Text>

              <Input
                label={t("screens:clubSettings.addGroupModal.groupName")}
                value={groupName}
                onChangeText={setGroupName}
                placeholder={t(
                  "screens:clubSettings.addGroupModal.groupNamePlaceholder",
                )}
                autoCapitalize="words"
              />

              <Input
                label={t("screens:clubSettings.addGroupModal.sportType")}
                value={sportType}
                onChangeText={setSportType}
                placeholder={t(
                  "screens:clubSettings.addGroupModal.sportTypePlaceholder",
                )}
                autoCapitalize="words"
              />

              <View style={styles.modalButtons}>
                <View style={styles.modalButton}>
                  <Button
                    label={t("common:cancel")}
                    onPress={() => setShowAddGroupModal(false)}
                    theme="secondary"
                    disabled={creatingGroup}
                  />
                </View>
                <View style={styles.modalButton}>
                  <Button
                    label={
                      creatingGroup ? t("common:creating") : t("common:create")
                    }
                    onPress={handleConfirmAddGroup}
                    theme="primary"
                    disabled={creatingGroup || !groupName.trim()}
                  />
                </View>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
  clubInfoContainer: {
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  clubName: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.secondary,
    marginBottom: theme.spacing.sm,
  },
  clubDescription: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    lineHeight: 22,
  },
  optionsContainer: {
    gap: theme.spacing.sm,
  },
  placeholderText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
    fontStyle: "italic",
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
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
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: theme.spacing.md,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  optionDescription: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  statusBadge: {
    backgroundColor: theme.colors.success,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.layout.containerPadding,
  },
  errorText: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.error,
    marginBottom: theme.spacing.xl,
  },
  dangerOption: {
    borderColor: theme.colors.error + "40",
    borderWidth: 1,
  },
  dangerText: {
    color: theme.colors.error,
  },
  optionItemExpanded: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  expandableHeader: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  subOptionsContainer: {
    marginTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  subOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.small,
    backgroundColor: theme.colors.primary,
    gap: theme.spacing.sm,
  },
  subOptionContent: {
    flex: 1,
  },
  subOptionTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  subOptionDescription: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  adminPickerItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    marginBottom: theme.spacing.sm,
  },
  adminPickerItemSelected: {
    borderColor: theme.colors.error,
    backgroundColor: theme.colors.error + "10",
  },
  adminPickerName: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium as any,
    color: theme.colors.text,
  },
  adminPickerEmail: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  deletionBanner: {
    backgroundColor: theme.colors.error + "15",
    borderWidth: 2,
    borderColor: theme.colors.error,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  deletionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  deletionTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.error,
  },
  deletionMessage: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  undoButtonContainer: {
    marginTop: theme.spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    width: "90%",
    maxWidth: 400,
    padding: theme.spacing.md,
  },
  modal: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.large,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  },
  modalDescription: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  },
  modalButtons: {
    flexDirection: "row",
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  modalButton: {
    flex: 1,
  },
});
