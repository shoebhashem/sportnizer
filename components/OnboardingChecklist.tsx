import { theme } from "@/constants/theme";
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

  const groupCreated = useHasSeenFeature("onboarding-group-created");
  const membersInvited = useHasSeenFeature("onboarding-members-invited");
  const dismissed = useHasSeenFeature("onboarding-checklist-dismissed");

  const isClubAdmin = userProfile?.clubAccess?.some(
    (c) => c.role === "club-admin",
  );

  if (!isClubAdmin || dismissed || (groupCreated && membersInvited)) {
    return null;
  }

  const adminClub = userProfile?.clubAccess?.find(
    (c) => c.role === "club-admin",
  );
  const clubId = adminClub?.clubId;

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
