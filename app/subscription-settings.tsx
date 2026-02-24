import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import { theme } from "@/constants/theme";
import { useUser } from "@/contexts/UserContext";
import { clubService } from "@/services/club";
import {
    SUBSCRIPTION_TIERS,
    subscriptionService,
    SubscriptionStatusResult,
    SupportedCurrency,
} from "@/services/subscriptionService";
import { ClubData } from "@/services/types/club";
import { Ionicons } from "@expo/vector-icons";
import {
    router,
    useFocusEffect,
    useLocalSearchParams,
    useNavigation,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useState,
} from "react";
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type TierKey = "free" | "basic" | "pro" | "enterprise";

export default function SubscriptionSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { clubId } = useLocalSearchParams();
  const { firebaseUser, userProfile } = useUser();
  const navigation = useNavigation();

  const [club, setClub] = useState<ClubData | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<SubscriptionStatusResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingAction, setProcessingAction] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedTier, setSelectedTier] = useState<"basic" | "pro" | null>(
    null,
  );
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Get currency based on club country (default to EUR)
  const currency: SupportedCurrency = subscriptionService.getCurrencyForCountry(
    club?.location || "",
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: club?.name ? `${club.name} Subscription` : "Subscription",
    });
  }, [club?.name, navigation]);

  const fetchData = useCallback(async () => {
    if (!clubId || typeof clubId !== "string") return;

    try {
      const [clubResult, statusResult] = await Promise.all([
        clubService.getClub(clubId),
        subscriptionService.getSubscriptionStatus(clubId),
      ]);

      if (clubResult.success && clubResult.data) {
        setClub(clubResult.data as ClubData);
      }

      if (statusResult.success && statusResult.data) {
        setSubscriptionStatus(statusResult.data);
      }
    } catch (error) {
      console.error("Error fetching subscription data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clubId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const handleUpgrade = (tier: "basic" | "pro") => {
    setSelectedTier(tier);
    setShowUpgradeModal(true);
  };

  const confirmUpgrade = async () => {
    if (!selectedTier || !clubId) return;

    setShowUpgradeModal(false);
    setProcessingAction(true);

    try {
      // Check if the club already has an active paid subscription
      const currentTier = subscriptionStatus?.tier;
      const hasActivePaidSubscription =
        currentTier === "basic" || currentTier === "pro";

      let result;

      if (hasActivePaidSubscription) {
        // Use upgrade flow to switch tiers (with proration)
        result = await subscriptionService.upgradeSubscription(
          clubId as string,
          selectedTier,
        );

        if (result.success) {
          // Refresh data to show updated tier
          await fetchData();
        }
      } else {
        // Use checkout flow for new subscriptions
        result = await subscriptionService.startCheckout(
          clubId as string,
          selectedTier,
          club?.location,
        );
      }

      if (!result.success) {
        setErrorMessage(result.error || "Failed to process subscription");
        setShowErrorModal(true);
      }
    } catch (error: any) {
      setErrorMessage(error.message || "An error occurred");
      setShowErrorModal(true);
    } finally {
      setProcessingAction(false);
    }
  };

  const handleManageBilling = async () => {
    if (!clubId) return;

    setProcessingAction(true);

    try {
      const result = await subscriptionService.openCustomerPortal(
        clubId as string,
      );

      if (!result.success) {
        setErrorMessage(result.error || "Failed to open billing portal");
        setShowErrorModal(true);
      }
    } catch (error: any) {
      setErrorMessage(error.message || "An error occurred");
      setShowErrorModal(true);
    } finally {
      setProcessingAction(false);
    }
  };

  const handleContactSales = () => {
    // For enterprise, redirect to email
    router.push({
      pathname: "/",
    });
    // TODO: Implement email link or form
  };

  const getUsagePercentage = () => {
    if (!subscriptionStatus) return 0;
    if (subscriptionStatus.maxMembers === -1) return 0; // Unlimited
    return Math.min(
      (subscriptionStatus.currentMembers / subscriptionStatus.maxMembers) * 100,
      100,
    );
  };

  const getUsageColor = () => {
    const percentage = getUsagePercentage();
    if (percentage >= 100) return theme.colors.error;
    if (percentage >= 80) return theme.colors.warning;
    return theme.colors.success;
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "N/A";
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading subscription...</Text>
        </View>
      </View>
    );
  }

  const currentTier = subscriptionStatus?.tier || "free";
  const isFreeTier = currentTier === "free";
  const isPaidTier = currentTier === "basic" || currentTier === "pro";
  const isEnterprise = currentTier === "enterprise";

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.secondary}
          />
        }
      >
        {/* Current Plan Card */}
        <View style={styles.currentPlanCard}>
          <View style={styles.planHeader}>
            <View style={styles.planBadge}>
              <Text style={styles.planBadgeText}>
                {subscriptionStatus?.tierName || "Free"}
              </Text>
            </View>
            {subscriptionStatus?.status === "past_due" && (
              <View style={styles.warningBadge}>
                <Ionicons
                  name="warning"
                  size={14}
                  color={theme.colors.warning}
                />
                <Text style={styles.warningBadgeText}>Payment Due</Text>
              </View>
            )}
          </View>

          <Text style={styles.planDescription}>
            {SUBSCRIPTION_TIERS[currentTier as TierKey]?.description || ""}
          </Text>

          {/* Usage Progress */}
          <View style={styles.usageSection}>
            <View style={styles.usageHeader}>
              <Text style={styles.usageLabel}>Member Usage</Text>
              <Text style={styles.usageText}>
                {subscriptionStatus?.currentMembers || 0}
                {" / "}
                {subscriptionStatus?.maxMembers === -1
                  ? "Unlimited"
                  : subscriptionStatus?.maxMembers || 0}
              </Text>
            </View>
            {subscriptionStatus?.maxMembers !== -1 && (
              <View style={styles.progressBarContainer}>
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${getUsagePercentage()}%`,
                      backgroundColor: getUsageColor(),
                    },
                  ]}
                />
              </View>
            )}
            {subscriptionStatus?.isNearingLimit && (
              <Text style={styles.warningText}>
                <Ionicons
                  name="alert-circle"
                  size={14}
                  color={theme.colors.warning}
                />{" "}
                You&apos;re approaching your member limit
              </Text>
            )}
          </View>

          {/* Grace Period Warning */}
          {subscriptionStatus?.isInGracePeriod && (
            <View style={styles.gracePeriodBanner}>
              <Ionicons name="time" size={20} color={theme.colors.warning} />
              <View style={styles.gracePeriodContent}>
                <Text style={styles.gracePeriodTitle}>Payment Required</Text>
                <Text style={styles.gracePeriodText}>
                  Your payment failed.{" "}
                  {subscriptionStatus.daysUntilGracePeriodEnds !== null
                    ? `${subscriptionStatus.daysUntilGracePeriodEnds} days`
                    : "Time"}{" "}
                  remaining to update payment before restrictions apply.
                </Text>
              </View>
            </View>
          )}

          {/* Billing Info (for paid plans) */}
          {isPaidTier && subscriptionStatus?.currentPeriodEnd && (
            <View style={styles.billingInfo}>
              <Text style={styles.billingLabel}>
                {subscriptionStatus.cancelAtPeriodEnd
                  ? "Access until"
                  : "Next billing date"}
              </Text>
              <Text style={styles.billingValue}>
                {formatDate(subscriptionStatus.currentPeriodEnd)}
              </Text>
            </View>
          )}

          {/* Manage Billing Button (for paid subscribers) */}
          {isPaidTier && (
            <TouchableOpacity
              style={styles.manageBillingButton}
              onPress={handleManageBilling}
              disabled={processingAction}
            >
              <Ionicons
                name="card-outline"
                size={20}
                color={theme.colors.secondary}
              />
              <Text style={styles.manageBillingText}>Manage Billing</Text>
              {processingAction ? (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.secondary}
                />
              ) : (
                <Ionicons
                  name="open-outline"
                  size={16}
                  color={theme.colors.textSecondary}
                />
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Upgrade Options */}
        {!isEnterprise && (
          <View style={styles.upgradeSectionContainer}>
            <Text style={styles.sectionTitle}>
              {isFreeTier ? "Upgrade Your Plan" : "Change Plan"}
            </Text>

            {/* Basic Tier */}
            {currentTier !== "basic" && (
              <View style={styles.tierCard}>
                <View style={styles.tierHeader}>
                  <Text style={styles.tierName}>Basic</Text>
                  <View style={styles.tierPrice}>
                    <Text style={styles.priceAmount}>
                      {
                        subscriptionService.getDisplayPrice("basic", currency)
                          .formatted
                      }
                    </Text>
                    <Text style={styles.priceInterval}>/month</Text>
                  </View>
                </View>
                <Text style={styles.tierDescription}>
                  {SUBSCRIPTION_TIERS.basic.description}
                </Text>
                <View style={styles.tierFeatures}>
                  <View style={styles.featureRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={theme.colors.success}
                    />
                    <Text style={styles.featureText}>
                      Up to {SUBSCRIPTION_TIERS.basic.maxMembers} members
                    </Text>
                  </View>
                  <View style={styles.featureRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={theme.colors.success}
                    />
                    <Text style={styles.featureText}>Priority support</Text>
                  </View>
                </View>
                <Button
                  label={
                    currentTier === "pro"
                      ? "Switch to Basic"
                      : "Upgrade to Basic"
                  }
                  onPress={() => handleUpgrade("basic")}
                  theme={currentTier === "pro" ? "secondary" : "primary"}
                  disabled={processingAction}
                />
              </View>
            )}

            {/* Pro Tier */}
            {currentTier !== "pro" && (
              <View style={[styles.tierCard, styles.recommendedTier]}>
                <View style={styles.recommendedBadge}>
                  <Text style={styles.recommendedText}>Recommended</Text>
                </View>
                <View style={styles.tierHeader}>
                  <Text style={styles.tierName}>Pro</Text>
                  <View style={styles.tierPrice}>
                    <Text style={styles.priceAmount}>
                      {
                        subscriptionService.getDisplayPrice("pro", currency)
                          .formatted
                      }
                    </Text>
                    <Text style={styles.priceInterval}>/month</Text>
                  </View>
                </View>
                <Text style={styles.tierDescription}>
                  {SUBSCRIPTION_TIERS.pro.description}
                </Text>
                <View style={styles.tierFeatures}>
                  <View style={styles.featureRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={theme.colors.success}
                    />
                    <Text style={styles.featureText}>
                      Up to {SUBSCRIPTION_TIERS.pro.maxMembers} members
                    </Text>
                  </View>
                  <View style={styles.featureRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={theme.colors.success}
                    />
                    <Text style={styles.featureText}>Priority support</Text>
                  </View>
                </View>
                <Button
                  label="Upgrade to Pro"
                  onPress={() => handleUpgrade("pro")}
                  theme="primary"
                  disabled={processingAction}
                />
              </View>
            )}

            {/* Enterprise */}
            <View style={styles.enterpriseCard}>
              <View style={styles.enterpriseHeader}>
                <Ionicons
                  name="business"
                  size={32}
                  color={theme.colors.secondary}
                />
                <Text style={styles.enterpriseName}>Enterprise</Text>
              </View>
              <Text style={styles.enterpriseDescription}>
                {SUBSCRIPTION_TIERS.enterprise.description}
              </Text>
              <View style={styles.tierFeatures}>
                <View style={styles.featureRow}>
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={theme.colors.success}
                  />
                  <Text style={styles.featureText}>Unlimited members</Text>
                </View>
                <View style={styles.featureRow}>
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={theme.colors.success}
                  />
                  <Text style={styles.featureText}>Dedicated support</Text>
                </View>
                <View style={styles.featureRow}>
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={theme.colors.success}
                  />
                  <Text style={styles.featureText}>Custom integrations</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.contactSalesButton}
                onPress={() => {
                  // Open email
                  const email = "sales@sportnizer.com";
                  const subject = `Enterprise inquiry for ${club?.name || "our club"}`;
                  const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}`;
                  if (typeof window !== "undefined") {
                    window.open(mailtoUrl);
                  }
                }}
              >
                <Text style={styles.contactSalesText}>Contact Sales</Text>
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={theme.colors.secondary}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Upgrade/Downgrade Confirmation Modal */}
      <ConfirmationModal
        visible={showUpgradeModal}
        title={`${
          currentTier === "pro" && selectedTier === "basic"
            ? "Downgrade"
            : isPaidTier
              ? "Upgrade"
              : "Upgrade"
        } to ${selectedTier === "basic" ? "Basic" : "Pro"}`}
        message={
          isPaidTier
            ? currentTier === "pro" && selectedTier === "basic"
              ? "Your subscription will be downgraded immediately. You'll receive a prorated credit for the price difference."
              : "Your subscription will be upgraded immediately. You'll be charged the prorated difference."
            : "You will be redirected to complete your subscription."
        }
        confirmText={isPaidTier ? "Confirm Change" : "Continue to Payment"}
        cancelText="Cancel"
        onConfirm={confirmUpgrade}
        onCancel={() => setShowUpgradeModal(false)}
        confirmButtonTheme="primary"
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
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },

  // Current Plan Card
  currentPlanCard: {
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  planBadge: {
    backgroundColor: theme.colors.secondary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.small,
  },
  planBadgeText: {
    color: theme.colors.primary,
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.bold,
  },
  warningBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.warning + "20",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.small,
    gap: 4,
  },
  warningBadgeText: {
    color: theme.colors.warning,
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.medium,
  },
  planDescription: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },

  // Usage Section
  usageSection: {
    marginBottom: theme.spacing.md,
  },
  usageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  usageLabel: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
  },
  usageText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: theme.colors.inputBorder,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 4,
  },
  warningText: {
    marginTop: theme.spacing.sm,
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.warning,
  },

  // Grace Period Banner
  gracePeriodBanner: {
    flexDirection: "row",
    backgroundColor: theme.colors.warning + "15",
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.small,
    marginTop: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.warning + "40",
    gap: theme.spacing.sm,
  },
  gracePeriodContent: {
    flex: 1,
  },
  gracePeriodTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.warning,
    marginBottom: 2,
  },
  gracePeriodText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.text,
    lineHeight: 18,
  },

  // Billing Info
  billingInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
  },
  billingLabel: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
  },
  billingValue: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
  },

  // Manage Billing Button
  manageBillingButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.small,
    gap: theme.spacing.sm,
  },
  manageBillingText: {
    flex: 1,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },

  // Upgrade Section
  upgradeSectionContainer: {
    gap: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },

  // Tier Card
  tierCard: {
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  recommendedTier: {
    borderColor: theme.colors.secondary,
    borderWidth: 2,
    position: "relative",
  },
  recommendedBadge: {
    position: "absolute",
    top: -12,
    right: theme.spacing.md,
    backgroundColor: theme.colors.secondary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.small,
  },
  recommendedText: {
    color: theme.colors.primary,
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.bold,
  },
  tierHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  tierName: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  tierPrice: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  priceAmount: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.secondary,
  },
  priceInterval: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginLeft: 2,
  },
  tierDescription: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  tierFeatures: {
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  featureText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },

  // Enterprise Card
  enterpriseCard: {
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderStyle: "dashed",
  },
  enterpriseHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  enterpriseName: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  enterpriseDescription: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  contactSalesButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.small,
    gap: theme.spacing.sm,
  },
  contactSalesText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
});
