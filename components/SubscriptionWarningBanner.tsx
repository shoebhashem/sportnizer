import { theme } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface SubscriptionWarningBannerProps {
  clubId: string;
  currentMembers: number;
  maxMembers: number;
  tier: string;
  isAtLimit?: boolean;
}

/**
 * Banner shown when a club is approaching (80%+) or at their member limit
 * Displays a warning and provides a quick link to upgrade
 */
export default function SubscriptionWarningBanner({
  clubId,
  currentMembers,
  maxMembers,
  tier,
  isAtLimit = false,
}: SubscriptionWarningBannerProps) {
  // Don't show for unlimited plans
  if (maxMembers === -1) return null;

  const usagePercent = (currentMembers / maxMembers) * 100;

  // Only show at 80%+ usage
  if (usagePercent < 80) return null;

  const handleUpgradePress = () => {
    router.push({
      pathname: "/subscription-settings",
      params: { clubId },
    } as any);
  };

  const remainingMembers = maxMembers - currentMembers;
  const isNearLimit = usagePercent >= 80 && usagePercent < 100;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        isAtLimit ? styles.errorContainer : styles.warningContainer,
      ]}
      onPress={handleUpgradePress}
      activeOpacity={0.8}
    >
      <View style={styles.iconContainer}>
        <Ionicons
          name={isAtLimit ? "alert-circle" : "warning"}
          size={24}
          color={isAtLimit ? theme.colors.error : theme.colors.warning}
        />
      </View>
      <View style={styles.content}>
        <Text
          style={[
            styles.title,
            isAtLimit ? styles.errorText : styles.warningText,
          ]}
        >
          {isAtLimit ? "Member Limit Reached" : "Approaching Member Limit"}
        </Text>
        <Text style={styles.description}>
          {isAtLimit
            ? `You've reached the ${maxMembers} member limit on the ${tier} plan.`
            : `Only ${remainingMembers} member slot${remainingMembers !== 1 ? "s" : ""} remaining on the ${tier} plan.`}
        </Text>
      </View>
      <View style={styles.upgradeContainer}>
        <Text style={styles.upgradeText}>Upgrade</Text>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.colors.secondary}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
  },
  warningContainer: {
    backgroundColor: theme.colors.warning + "15",
    borderColor: theme.colors.warning + "40",
  },
  errorContainer: {
    backgroundColor: theme.colors.error + "15",
    borderColor: theme.colors.error + "40",
  },
  iconContainer: {
    marginRight: theme.spacing.sm,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: 2,
  },
  warningText: {
    color: theme.colors.warning,
  },
  errorText: {
    color: theme.colors.error,
  },
  description: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.text,
    lineHeight: 18,
  },
  upgradeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: theme.spacing.sm,
    gap: 2,
  },
  upgradeText: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.secondary,
  },
});
