import { Ionicons } from "@expo/vector-icons";
import {
    router,
    useFocusEffect,
    useLocalSearchParams,
    useNavigation,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { doc, getDoc } from "firebase/firestore";
import { useCallback, useLayoutEffect, useState } from "react";
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
import Button from "../components/Button";
import ConfirmationModal from "../components/ConfirmationModal";
import CountdownTimer from "../components/CountdownTimer";
import Input from "../components/Input";
import { theme } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../services/core/firebase";

// Import services following three-layer architecture
import { clubService } from "../services/club";
import { fetchGroupMembers } from "../services/fetchGroupMembers";
import { groupService } from "../services/group";
import { subgroupService } from "../services/subgroup";
import { GroupData } from "../services/types/group";

// interface UnconfirmedMember {
//   id: string; // Member document ID
//   name: string;
//   birthDate?: string;
//   guardianEmails?: string[]; // For invitation emails
//   invitationToken?: string; // Links to guardianInvitations collection
// }

export default function GroupSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation(["screens", "common"]);
  const { groupId, clubId } = useLocalSearchParams();
  const { user } = useAuth();
  const navigation = useNavigation();
  const [group, setGroup] = useState<GroupData | null>(null);
  // const [members, setMembers] = useState<GroupMemberData[]>([]); // Commented out - not used in UI yet
  const [userRole, setUserRole] = useState<string>("member");
  const [loading, setLoading] = useState(true);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  // const [adminCount, setAdminCount] = useState(0); // Commented out - for future use (Leave Group validation)
  const [showCreateSubgroupModal, setShowCreateSubgroupModal] = useState(false);
  const [subgroupName, setSubgroupName] = useState("");
  const [creatingSubgroup, setCreatingSubgroup] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [selectedSubgroup, setSelectedSubgroup] = useState<any>(null);
  const [showDeleteSubgroupModal, setShowDeleteSubgroupModal] = useState(false);
  const [isDeletingSubgroup, setIsDeletingSubgroup] = useState(false);
  const [clubName, setClubName] = useState<string>("Club");
  const [addMembersExpanded, setAddMembersExpanded] = useState(false);
  const [removeMembersExpanded, setRemoveMembersExpanded] = useState(false);

  // Set dynamic header with group name
  useLayoutEffect(() => {
    navigation.setOptions({
      title: group?.name ? `${group.name} Settings` : "Group Settings",
    });
  }, [group?.name, navigation]);

  const fetchGroupDataFromServices = useCallback(async () => {
    if (
      !groupId ||
      typeof groupId !== "string" ||
      !clubId ||
      typeof clubId !== "string" ||
      !user?.uid
    )
      return;

    try {
      // Fetch group data, members data, and user document
      const groupResult = await groupService.getGroup(clubId, groupId);
      const membersResult = await fetchGroupMembers(clubId, groupId);
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();

      if (groupResult.success && groupResult.data) {
        setGroup(groupResult.data);
      }

      // Process members data
      const membersData = membersResult.success
        ? membersResult.members || []
        : [];
      // setMembers(membersData); // Commented out - not used in UI yet

      // Find current user's role - check club-level first
      let userRole = "member";
      // let adminCount = 0; // Commented out - for future use (Leave Group validation)
      // const unconfirmedMembers: UnconfirmedMember[] = []; // Commented out - not used yet

      // First check club-level role from user document
      if (userData?.clubAccess) {
        const clubAccess = userData.clubAccess.find(
          (c: any) => c.clubId === clubId,
        );
        if (clubAccess?.role === "club-admin") {
          userRole = "club-admin"; // Club admin has all permissions in all groups
        }
      }

      // If not club-admin, check group-level roles and count admins
      if (userRole !== "club-admin") {
        membersData.forEach((member: any) => {
          if (member.userId === user.uid) {
            // Check user's roles
            if (member.roles.includes("admin")) {
              userRole = "admin";
            } else if (member.roles.includes("coach")) {
              userRole = "coach";
            } else {
              userRole = "member";
            }
          }

          // Count admins (commented out - for future use)
          // if (member.roles.includes('admin')) {
          //   adminCount++;
          // }

          // Collect unconfirmed members (if they have this property)
          // Note: We may need to add this to GroupMemberData interface if needed
          // if (member.isConfirmed === false) {
          //   unconfirmedMembers.push({
          //     id: member.userId,
          //     name: member.name,
          //     // ... other fields
          //   });
          // }
        });

        // If user is the group creator but not found in members, consider them as admin
        if (
          groupResult.success &&
          groupResult.data &&
          groupResult.data.createdBy === user.uid &&
          userRole === "member"
        ) {
          userRole = "admin";
        }
      } else {
        // Club admin: still count group admins for validation (commented out - for future use)
        // membersData.forEach((member: any) => {
        //   if (member.roles.includes('admin')) {
        //     adminCount++;
        //   }
        // });
      }

      setUserRole(userRole);
      // setAdminCount(adminCount); // Commented out - for future use

      // Fetch club name for navigation params
      try {
        const clubResult = await clubService.getClub(clubId);
        setClubName(clubResult.data?.name || "Club");
      } catch (error) {
        console.error("Failed to fetch club name:", error);
      }
    } catch (error) {
      console.error("Error fetching group data:", error);
      setErrorMessage(t("screens:groupSettings.failedToLoadGroupData"));
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  }, [groupId, clubId, user?.uid]);

  // Removed useEffect double-fetch. Only useFocusEffect remains.

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchGroupDataFromServices();
    }, [fetchGroupDataFromServices]),
  );

  const handleUndoDeletion = () => {
    setShowUndoModal(true);
  };

  const confirmUndoDeletion = async () => {
    setShowUndoModal(false);
    setIsReactivating(true);

    if (!clubId || !groupId || !user?.uid) return;

    try {
      const result = await groupService.reactivateGroup(
        clubId as string,
        groupId as string,
      );

      if (result.success) {
        setSuccessMessage(
          t("screens:groupSettings.groupReactivated") +
            (result.subgroupsReactivated
              ? " " +
                t("screens:groupSettings.groupReactivatedWithSubgroups", {
                  count: result.subgroupsReactivated,
                })
              : ""),
        );
        setShowSuccessModal(true);

        // Refresh group data to show active status
        await fetchGroupDataFromServices();
      } else {
        setErrorMessage(
          result.error || t("screens:groupSettings.failedToReactivateGroup"),
        );
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error("Error reactivating group:", error);
      setErrorMessage(t("screens:groupSettings.failedToReactivateGroupRetry"));
      setShowErrorModal(true);
    } finally {
      setIsReactivating(false);
    }
  };

  // 🧪 DEV ONLY: Force hard delete for testing
  const handleForceCleanup = async () => {
    if (
      !confirm(
        "⚠️ DEV TESTING: This will PERMANENTLY delete all soft-deleted entities. Continue?",
      )
    ) {
      return;
    }

    try {
      console.log("🧪 Calling devForceCleanup...");
      const { httpsCallable } = await import("firebase/functions");
      const { functions } = await import("../services/core/firebase");

      const devForceCleanupFn = httpsCallable(functions, "devForceCleanup");
      const result = await devForceCleanupFn({ targetType: "all" });

      const data = result.data as any;
      console.log("✅ Force cleanup result:", data);

      setSuccessMessage(
        `Hard delete completed!\n` +
          `Groups deleted: ${data.deletedGroups || 0}\n` +
          `Clubs deleted: ${data.deletedClubs || 0}`,
      );
      setShowSuccessModal(true);

      // Navigate back since group is now permanently deleted
      setTimeout(() => {
        router.back();
      }, 2000);
    } catch (error: any) {
      console.error("❌ Error in force cleanup:", error);
      setErrorMessage(`Force cleanup failed: ${error.message}`);
      setShowErrorModal(true);
    }
  };

  // Helper to build navigation params for member actions
  const getMemberActionParams = () => ({
    groupId: groupId as string,
    clubId: clubId as string,
    groupName: group?.name || "Unknown",
    clubName: clubName,
  });

  const isClubAdmin = userRole === "club-admin";

  const handleAddPlayer = () => {
    router.push({
      pathname: "/add-adult-member",
      params: { ...getMemberActionParams(), role: "player" },
    } as any);
  };

  const handleAddYouthPlayer = () => {
    router.push({
      pathname: "/add-child-member",
      params: getMemberActionParams(),
    } as any);
  };

  const handleAddCoach = () => {
    router.push({
      pathname: "/add-adult-member",
      params: { ...getMemberActionParams(), role: "coach" },
    } as any);
  };

  const handleAddAdmin = () => {
    router.push({
      pathname: "/add-adult-member",
      params: { ...getMemberActionParams(), role: "admin" },
    } as any);
  };

  const handleRemovePlayer = () => {
    router.push({
      pathname: "/remove-member",
      params: { ...getMemberActionParams(), removeType: "player" },
    } as any);
  };

  const handleRemoveYouthPlayer = () => {
    router.push({
      pathname: "/remove-member",
      params: { ...getMemberActionParams(), removeType: "youth" },
    } as any);
  };

  const handleRemoveCoach = () => {
    router.push({
      pathname: "/remove-member",
      params: { ...getMemberActionParams(), removeType: "coach" },
    } as any);
  };

  const handleRemoveAdmin = () => {
    router.push({
      pathname: "/remove-member",
      params: { ...getMemberActionParams(), removeType: "admin" },
    } as any);
  };

  const handleViewStatistics = () => {
    if (group && groupId && clubId) {
      const groupName = encodeURIComponent(group.name);
      router.push(
        `/view-statistics?groupId=${groupId}&clubId=${clubId}&groupName=${groupName}` as any,
      );
    }
  };

  const handleCreateSubgroup = () => {
    setSubgroupName("");
    setShowCreateSubgroupModal(true);
  };

  const handleConfirmCreateSubgroup = async () => {
    console.log("🔥 handleConfirmCreateSubgroup called");
    console.log("📝 subgroupName:", subgroupName);
    console.log("🏠 clubId:", clubId);
    console.log("👥 groupId:", groupId);
    console.log("👤 user?.uid:", user?.uid);

    if (!subgroupName.trim()) {
      console.log("❌ Empty subgroup name, returning early");
      return;
    }

    if (!groupId || !user?.uid || !clubId) {
      console.log("❌ Missing required data");
      setErrorMessage(t("screens:groupSettings.missingGroupInfo"));
      setShowErrorModal(true);
      return;
    }

    setCreatingSubgroup(true);
    console.log("🚀 Starting subgroup creation...");

    try {
      // Use subgroupService instead of direct Firebase Function call
      console.log("📞 Calling subgroupService.createSubgroup");

      const result = await subgroupService.createSubgroup(
        clubId as string,
        groupId as string,
        subgroupName.trim(),
        user.uid,
      );
      console.log("✅ Service result:", result);

      if (result.success) {
        console.log("🎉 Success! Closing modal and showing success message");
        setShowCreateSubgroupModal(false);
        setSubgroupName("");

        // Show success message
        setSuccessMessage(
          t("screens:groupSettings.subgroupCreated", {
            name: subgroupName.trim(),
          }),
        );
        setShowSuccessModal(true);

        // Navigate to manage-group screen with subgroups tab active
        router.push(
          `/manage-group?groupId=${groupId}&clubId=${clubId}&clubName=${encodeURIComponent(clubName as string)}&tab=subgroups` as any,
        );
      } else {
        console.log("❌ Service returned error:", result.error);
        setErrorMessage(
          result.error || t("screens:groupSettings.failedToCreateSubgroup"),
        );
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error("💥 Error creating subgroup:", error);
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred";
      setErrorMessage(
        t("screens:groupSettings.failedToCreateSubgroupWithMsg", {
          message: errorMsg,
        }),
      );
      setShowErrorModal(true);
    } finally {
      console.log("🏁 Finished - setting creatingSubgroup to false");
      setCreatingSubgroup(false);
    }
  };

  const handleSendGuardianConfirmation = () => {
    router.push({
      pathname: "/invite-guardians",
      params: {
        groupId: groupId as string,
        groupName: group?.name || "Group",
      },
    });
  };

  const handleDeleteSubgroup = async () => {
    if (!selectedSubgroup || !clubId || !groupId || !user?.uid) return;

    setShowDeleteSubgroupModal(false);
    setIsDeletingSubgroup(true);

    try {
      const result = await subgroupService.deleteSubgroup(
        clubId as string,
        groupId as string,
        selectedSubgroup.id,
        user.uid,
      );

      if (result.success) {
        setSuccessMessage(
          t("screens:groupSettings.subgroupDeleted", {
            name: selectedSubgroup.name,
          }),
        );
        setShowSuccessModal(true);

        // Refresh group data to update subgroups list
        await fetchGroupDataFromServices();
      } else {
        setErrorMessage(
          result.error || t("screens:groupSettings.failedToDeleteSubgroup"),
        );
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error("Error deleting subgroup:", error);
      setErrorMessage(t("screens:groupSettings.failedToDeleteSubgroup"));
      setShowErrorModal(true);
    } finally {
      setIsDeletingSubgroup(false);
      setSelectedSubgroup(null);
    }
  };

  const isGroupCreator = group?.createdBy === user?.uid;

  // Permission levels:
  // - canManageMembers: Can add/remove players (club-admin, admin)
  // - canManageStaff: Can add/remove coaches/admins (club-admin only)
  // - canManageGroup: Can view stats, create subgroups (club-admin, admin, coach)
  const canManageMembers = isClubAdmin || userRole === "admin";
  const canManageGroup =
    userRole === "club-admin" ||
    userRole === "admin" ||
    userRole === "coach" ||
    isGroupCreator;
  const isScheduledForDeletion = !group?.isActive && group?.deletionScheduledAt;

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>
            {t("screens:groupSettings.loadingGroupSettings")}
          </Text>
        </View>
      </View>
    );
  }

  if (!group) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {t("screens:groupSettings.groupNotFound")}
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
        {/* Group Info */}
        <View style={styles.groupInfoContainer}>
          <Text style={styles.groupName}>{group.name}</Text>
          <Text style={styles.yourRole}>
            {t("screens:groupSettings.yourRole", { role: userRole })}
          </Text>
        </View>

        {/* Deletion Status Banner */}
        {isScheduledForDeletion && (
          <View style={styles.deletionBanner}>
            <View style={styles.deletionHeader}>
              <Ionicons name="warning" size={24} color={theme.colors.error} />
              <Text style={styles.deletionTitle}>
                {t("screens:groupSettings.scheduledForDeletion")}
              </Text>
            </View>
            <Text style={styles.deletionMessage}>
              {t("screens:groupSettings.groupWillBeDeleted")}
            </Text>
            <CountdownTimer
              deletionScheduledAt={group.deletionScheduledAt?.toMillis?.()}
              compact={false}
            />
            {canManageMembers && (
              <View style={styles.undoButtonContainer}>
                <Button
                  label={
                    isReactivating
                      ? t("common:reactivating")
                      : t("screens:groupSettings.undoDeletion")
                  }
                  onPress={handleUndoDeletion}
                  theme="secondary"
                  disabled={isReactivating}
                />
                {/* 🧪 DEV TESTING BUTTON - Remove in production */}
                <View style={{ marginTop: 12 }}>
                  <Button
                    label="🧪 DEV: Force Hard Delete Now"
                    onPress={handleForceCleanup}
                    theme="primary"
                  />
                </View>
              </View>
            )}
          </View>
        )}

        {/* Settings Options */}
        <View style={styles.optionsContainer}>
          {/* Add Members Section - Expandable (club-admin and admin only) */}
          {canManageMembers && (
            <>
              <TouchableOpacity
                style={styles.expandableHeader}
                onPress={() => setAddMembersExpanded(!addMembersExpanded)}
                activeOpacity={0.7}
              >
                <View style={styles.optionIcon}>
                  <Ionicons
                    name="person-add-outline"
                    size={24}
                    color={theme.colors.secondary}
                  />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>
                    {t("screens:groupSettings.addMembers")}
                  </Text>
                  <Text style={styles.optionDescription}>
                    {isClubAdmin
                      ? t("screens:groupSettings.addMembersDesc")
                      : t("screens:groupSettings.addMembersDescAdmin")}
                  </Text>
                </View>
                <Ionicons
                  name={addMembersExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>

              {addMembersExpanded && (
                <View style={styles.expandableContent}>
                  <TouchableOpacity
                    style={styles.subOptionItem}
                    onPress={handleAddPlayer}
                  >
                    <Text style={styles.subOptionTitle}>
                      {t("screens:groupSettings.addPlayer")}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={theme.colors.textSecondary}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.subOptionItem,
                      !isClubAdmin && styles.subOptionItemLast,
                    ]}
                    onPress={handleAddYouthPlayer}
                  >
                    <Text style={styles.subOptionTitle}>
                      {t("screens:groupSettings.addYouthPlayer")}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={theme.colors.textSecondary}
                    />
                  </TouchableOpacity>

                  {isClubAdmin && (
                    <>
                      <TouchableOpacity
                        style={styles.subOptionItem}
                        onPress={handleAddCoach}
                      >
                        <Text style={styles.subOptionTitle}>
                          {t("screens:groupSettings.addCoach")}
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={theme.colors.textSecondary}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.subOptionItem, styles.subOptionItemLast]}
                        onPress={handleAddAdmin}
                      >
                        <Text style={styles.subOptionTitle}>
                          {t("screens:groupSettings.addAdmin")}
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={theme.colors.textSecondary}
                        />
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            </>
          )}

          {/* Remove Members Section - Expandable (club-admin and admin only) */}
          {canManageMembers && (
            <>
              <TouchableOpacity
                style={styles.expandableHeader}
                onPress={() => setRemoveMembersExpanded(!removeMembersExpanded)}
                activeOpacity={0.7}
              >
                <View style={[styles.optionIcon, styles.dangerIconBg]}>
                  <Ionicons
                    name="person-remove-outline"
                    size={24}
                    color={theme.colors.error}
                  />
                </View>
                <View style={styles.optionContent}>
                  <Text style={[styles.optionTitle, styles.dangerText]}>
                    {t("screens:groupSettings.removeMembers")}
                  </Text>
                  <Text style={styles.optionDescription}>
                    {isClubAdmin
                      ? t("screens:groupSettings.removeMembersDesc")
                      : t("screens:groupSettings.removeMembersDescAdmin")}
                  </Text>
                </View>
                <Ionicons
                  name={removeMembersExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={theme.colors.error}
                />
              </TouchableOpacity>

              {removeMembersExpanded && (
                <View style={styles.expandableContent}>
                  <TouchableOpacity
                    style={styles.subOptionItem}
                    onPress={handleRemovePlayer}
                  >
                    <Text style={[styles.subOptionTitle, styles.dangerText]}>
                      {t("screens:groupSettings.removePlayer")}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={theme.colors.error}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.subOptionItem,
                      !isClubAdmin && styles.subOptionItemLast,
                    ]}
                    onPress={handleRemoveYouthPlayer}
                  >
                    <Text style={[styles.subOptionTitle, styles.dangerText]}>
                      {t("screens:groupSettings.removeYouthPlayer")}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={theme.colors.error}
                    />
                  </TouchableOpacity>

                  {isClubAdmin && (
                    <>
                      <TouchableOpacity
                        style={styles.subOptionItem}
                        onPress={handleRemoveCoach}
                      >
                        <Text
                          style={[styles.subOptionTitle, styles.dangerText]}
                        >
                          {t("screens:groupSettings.removeCoach")}
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={theme.colors.error}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.subOptionItem, styles.subOptionItemLast]}
                        onPress={handleRemoveAdmin}
                      >
                        <Text
                          style={[styles.subOptionTitle, styles.dangerText]}
                        >
                          {t("screens:groupSettings.removeAdmin")}
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={theme.colors.error}
                        />
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            </>
          )}

          {/* View Statistics Option - For club-admin, admin, and coach */}
          {canManageGroup && (
            <TouchableOpacity
              style={styles.optionItem}
              onPress={handleViewStatistics}
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
                  {t("screens:groupSettings.viewStatistics")}
                </Text>
                <Text style={styles.optionDescription}>
                  {t("screens:groupSettings.viewStatisticsDesc")}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          )}

          {/* Create Subgroup Option - For club-admin, admin, and coach */}
          {canManageGroup && (
            <TouchableOpacity
              style={styles.optionItem}
              onPress={handleCreateSubgroup}
            >
              <View style={styles.optionIcon}>
                <Ionicons
                  name="layers-outline"
                  size={24}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>
                  {t("screens:groupSettings.createSubgroup")}
                </Text>
                <Text style={styles.optionDescription}>
                  {t("screens:groupSettings.createSubgroupDesc")}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          )}

          {/* Track Payments Option - Club-admin only */}
          {isClubAdmin && (
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() =>
                router.push({
                  pathname: "/track-payments",
                  params: {
                    clubId: clubId as string,
                    groupId: groupId as string,
                    groupName: group?.name || "",
                  },
                } as any)
              }
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
                  {t("screens:groupSettings.trackPayments")}
                </Text>
                <Text style={styles.optionDescription}>
                  {t("screens:groupSettings.trackPaymentsDesc")}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          )}

          {/* Manage Subgroups Section */}
          {canManageGroup && group?.subGroups && group.subGroups.length > 0 && (
            <View style={styles.subgroupsSection}>
              <Text style={styles.sectionHeader}>
                {t("screens:groupSettings.subgroups", {
                  count: group.subGroups.length,
                })}
              </Text>
              {group.subGroups.map((subgroup: any) => (
                <View key={subgroup.id} style={styles.subgroupItem}>
                  <TouchableOpacity
                    style={styles.subgroupTouchable}
                    onPress={() =>
                      router.push(
                        `/subgroup-settings?groupId=${groupId}&clubId=${clubId}&subgroupId=${subgroup.id}&subgroupName=${encodeURIComponent(subgroup.name)}` as any,
                      )
                    }
                  >
                    <View style={styles.subgroupInfo}>
                      <Text style={styles.subgroupName}>{subgroup.name}</Text>
                      <Text style={styles.subgroupMemberCount}>
                        {subgroup.memberCount || 0}{" "}
                        {subgroup.memberCount === 1
                          ? t("common:member")
                          : t("common:members")}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteSubgroupButton}
                    onPress={() => {
                      setSelectedSubgroup(subgroup);
                      setShowDeleteSubgroupModal(true);
                    }}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={20}
                      color={theme.colors.error}
                    />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Send Confirmation Link - Only for children's groups */}
          {canManageGroup &&
            false /* TODO: Add children's group detection logic */ && (
              <TouchableOpacity
                style={styles.optionItem}
                onPress={handleSendGuardianConfirmation}
              >
                <View style={styles.optionIcon}>
                  <Ionicons
                    name="mail-outline"
                    size={24}
                    color={theme.colors.secondary}
                  />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>
                    {t("screens:groupSettings.inviteGuardians")}
                  </Text>
                  <Text style={styles.optionDescription}>
                    {t("screens:groupSettings.inviteGuardiansDesc")}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
            )}
        </View>
      </ScrollView>

      {/* Undo Deletion Confirmation Modal */}
      <ConfirmationModal
        visible={showUndoModal}
        title={t("screens:groupSettings.undoDeletion")}
        message={t("screens:groupSettings.undoDeletionConfirm", {
          name: group?.name || "this group",
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
        onConfirm={() => {
          setShowSuccessModal(false);
          router.replace("/groups");
        }}
        onCancel={() => {
          setShowSuccessModal(false);
          router.replace("/groups");
        }}
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
        confirmButtonTheme="secondary"
      />

      {/* Create Subgroup Modal */}
      <Modal
        visible={showCreateSubgroupModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateSubgroupModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowCreateSubgroupModal(false)}
        >
          <View style={styles.modalContainer}>
            <Pressable onPress={() => {}} style={styles.modal}>
              <Text style={styles.modalTitle}>
                {t("screens:groupSettings.createSubgroupModal.title")}
              </Text>

              <Input
                label={t(
                  "screens:groupSettings.createSubgroupModal.subgroupName",
                )}
                value={subgroupName}
                onChangeText={setSubgroupName}
                placeholder={t(
                  "screens:groupSettings.createSubgroupModal.subgroupNamePlaceholder",
                )}
                autoCapitalize="words"
              />

              <View style={styles.modalButtons}>
                <View style={styles.modalButton}>
                  <Button
                    label={t("common:cancel")}
                    onPress={() => setShowCreateSubgroupModal(false)}
                    theme="secondary"
                  />
                </View>
                <View style={styles.modalButton}>
                  <Button
                    label={
                      creatingSubgroup
                        ? t("common:creating")
                        : t("screens:groupSettings.createSubgroupModal.create")
                    }
                    onPress={handleConfirmCreateSubgroup}
                    theme="primary"
                    disabled={creatingSubgroup || !subgroupName.trim()}
                  />
                </View>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Delete Subgroup Confirmation Modal */}
      <ConfirmationModal
        visible={showDeleteSubgroupModal}
        title={t("screens:groupSettings.deleteSubgroup")}
        message={t("screens:groupSettings.deleteSubgroupConfirm", {
          name: selectedSubgroup?.name,
        })}
        confirmText={
          isDeletingSubgroup ? t("common:deleting") : t("common:delete")
        }
        cancelText={t("common:cancel")}
        onConfirm={handleDeleteSubgroup}
        onCancel={() => {
          setShowDeleteSubgroupModal(false);
          setSelectedSubgroup(null);
        }}
        confirmButtonTheme="danger"
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
  groupInfoContainer: {
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.lg,
    alignItems: "center",
  },
  groupName: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.sm,
  },
  yourRole: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textTransform: "capitalize",
  },
  optionsContainer: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    overflow: "hidden",
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  dangerOption: {
    borderBottomWidth: 0,
    borderBottomColor: `${theme.colors.error}30`,
  },
  optionIcon: {
    width: 40,
    alignItems: "center",
  },
  optionContent: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  optionTitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  expandableHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  expandableContent: {
    backgroundColor: theme.colors.inputBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  subOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    marginLeft: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  subOptionItemLast: {
    borderBottomWidth: 0,
  },
  subOptionTitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
  },
  dangerIconBg: {
    backgroundColor: `${theme.colors.error}20`,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
  },
  dangerText: {
    color: theme.colors.error,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: theme.spacing.xl,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  errorText: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.error,
    textAlign: "center",
    marginBottom: theme.spacing.lg,
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
  modalButtons: {
    flexDirection: "row",
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  modalButton: {
    flex: 1,
  },
  modalDescription: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  },
  coachOptionsList: {
    marginBottom: theme.spacing.lg,
  },
  coachOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  coachOptionText: {
    flex: 1,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginLeft: theme.spacing.md,
  },
  unconfirmedChildrenList: {
    maxHeight: 200,
    marginBottom: theme.spacing.lg,
  },
  childOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  childInfo: {
    flex: 1,
  },
  childName: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
  },
  childBirthDate: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  confirmationStatus: {
    alignItems: "flex-end",
  },
  sentStatus: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.success,
    fontWeight: theme.typography.fontWeight.medium,
  },
  pendingStatus: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.error,
    fontWeight: theme.typography.fontWeight.medium,
  },
  invitationSent: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.success,
    fontWeight: theme.typography.fontWeight.medium,
  },
  invitationPending: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  childOptionSelected: {
    backgroundColor: theme.colors.inputBackground,
    borderColor: theme.colors.secondary,
    borderWidth: 1,
  },
  selectionIndicator: {
    marginRight: 12,
  },
  memberDetails: {
    flex: 1,
  },
  emailSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
  },
  emailSectionTitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
    marginBottom: 15,
  },
  emailInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  emailInput: {
    flex: 1,
    marginRight: 10,
  },
  removeEmailButton: {
    padding: 5,
  },
  addEmailButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  addEmailText: {
    marginLeft: 8,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
  },
  deletionBanner: {
    backgroundColor: theme.colors.error + "15",
    borderWidth: 2,
    borderColor: theme.colors.error,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.lg,
    marginHorizontal: theme.layout.containerPadding,
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
  subgroupsSection: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
  },
  sectionHeader: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  subgroupItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  subgroupTouchable: {
    flex: 1,
  },
  subgroupInfo: {
    flex: 1,
  },
  subgroupName: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
  },
  subgroupMemberCount: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  deleteSubgroupButton: {
    padding: theme.spacing.sm,
  },
});
