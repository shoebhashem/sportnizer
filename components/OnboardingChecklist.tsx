import { theme } from "@/constants/theme";
import { useGroupData } from "@/contexts/GroupDataContext";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { useUser } from "@/contexts/UserContext";
import { useHasSeenFeature } from "@/hooks/useOnboardingFeatureTracker";
import Ionicons from "@react-native-vector-icons/ionicons/static";
import { useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function OnboardingChecklist() {
  const router = useRouter();
  const { t } = useTranslation("components");
  const { userProfile } = useUser();
  const { markFeatureSeen } = useOnboarding();
  const { groups, groupMembers, isLoading: groupsLoading } = useGroupData();

  // "dismissed" stays in local storage — it's a UI preference, not a task state
  const dismissed = useHasSeenFeature("onboarding-checklist-dismissed");

  const isClubAdmin = userProfile?.clubAccess?.some(
    (c) => c.role === "club-admin",
  );

  // Wait for group data before deciding — prevents a checklist flash for users
  // who have already completed the tasks (data loads in under a second).
  if (!isClubAdmin || groupsLoading) return null;
  if (dismissed) return null;

  // All clubs this user admins — there may be more than one.
  const adminClubIds = (userProfile?.clubAccess ?? [])
    .filter((c) => c.role === "club-admin" && c.isActive !== false)
    .map((c) => c.clubId);

  // Per-club helper: groups that are active and belong to that club.
  const getClubGroups = (id: string) =>
    [...groups.entries()]
      .filter(([key]) => key.startsWith(`${id}:`))
      .map(([, group]) => group)
      .filter((g) => g.isActive !== false);

  // Check actual members from the allMembers subcollection — more reliable than
  // the denormalized memberCount field which can be stale.
  const clubHasMembers = (id: string) =>
    getClubGroups(id).some((g) => {
      const members = groupMembers.get(`${id}:${g.id}`) ?? [];
      return members.some((m) => m.isActive !== false);
    });

  // Find the first admin club that still has incomplete setup steps.
  // If all clubs are fully set up, hide the checklist entirely.
  const incompleteClubId = adminClubIds.find((id) => {
    const hasGroup = getClubGroups(id).length > 0;
    const hasMembers = clubHasMembers(id);
    return !(hasGroup && hasMembers);
  });

  if (!incompleteClubId) return null;

  // Compute step status specifically for the incomplete club.
  const clubGroups = getClubGroups(incompleteClubId);
  const groupCreated = clubGroups.length > 0;
  const membersInvited = clubHasMembers(incompleteClubId);
  const clubId = incompleteClubId;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="rocket-outline" size={20} color={theme.colors.secondary} />
        <Text style={styles.title}>{t("onboarding.checklist.title")}</Text>
      </View>

      {/* Step 1: Create club — always done */}
      <View style={styles.step}>
        <View style={styles.checkCircleDone}>
          <Ionicons name="checkmark" size={14} color="#fff" />
        </View>
        <Text style={styles.stepTextDone}>
          {t("onboarding.checklist.step1")}
        </Text>
      </View>

      {/* Step 2: Create group */}
      <TouchableOpacity
        style={styles.step}
        onPress={() => {
          if (clubId) {
            router.push(`/club-settings?clubId=${clubId}` as never);
          }
        }}
        disabled={groupCreated}
      >
        {groupCreated ? (
          <View style={styles.checkCircleDone}>
            <Ionicons name="checkmark" size={14} color="#fff" />
          </View>
        ) : (
          <View style={styles.checkCirclePending}>
            <Text style={styles.stepNumber}>2</Text>
          </View>
        )}
        <Text style={groupCreated ? styles.stepTextDone : styles.stepTextPending}>
          {t("onboarding.checklist.step2")}
        </Text>
        {!groupCreated && (
          <Ionicons name="chevron-forward" size={16} color={theme.colors.secondary} />
        )}
      </TouchableOpacity>

      {/* Step 3: Invite members */}
      <TouchableOpacity
        style={styles.step}
        onPress={() => {
          if (clubId) {
            router.push(`/manage-club?clubId=${clubId}&tab=groups` as never);
          }
        }}
        disabled={membersInvited || !groupCreated}
      >
        {membersInvited ? (
          <View style={styles.checkCircleDone}>
            <Ionicons name="checkmark" size={14} color="#fff" />
          </View>
        ) : (
          <View style={[styles.checkCirclePending, !groupCreated && styles.checkCircleDisabled]}>
            <Text style={[styles.stepNumber, !groupCreated && styles.stepNumberDisabled]}>3</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text
            style={
              membersInvited
                ? styles.stepTextDone
                : !groupCreated
                  ? styles.stepTextDisabled
                  : styles.stepTextPending
            }
          >
            {t("onboarding.checklist.step3")}
          </Text>
          {!groupCreated && !membersInvited && (
            <Text style={styles.stepHint}>
              {t("onboarding.checklist.step3Hint")}
            </Text>
          )}
        </View>
        {!membersInvited && groupCreated && (
          <Ionicons name="chevron-forward" size={16} color={theme.colors.secondary} />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.dismissButton}
        onPress={() => markFeatureSeen("onboarding-checklist-dismissed")}
      >
        <Text style={styles.dismissText}>
          {t("onboarding.checklist.dismiss")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.secondary + "40",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.md,
    gap: 8,
  },
  title: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
  },
  checkCircleDone: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
  },
  checkCirclePending: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleDisabled: {
    borderColor: theme.colors.textSecondary,
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.secondary,
  },
  stepNumberDisabled: {
    color: theme.colors.textSecondary,
  },
  stepTextDone: {
    flex: 1,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textDecorationLine: "line-through",
  },
  stepTextPending: {
    flex: 1,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
  },
  stepTextDisabled: {
    flex: 1,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
  },
  stepHint: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  dismissButton: {
    alignSelf: "flex-end",
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  dismissText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
});
