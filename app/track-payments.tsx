// Track Payments Screen - Club admins view payment status for membership fees
// Supports viewing multiple fees and drilling into member payment details

import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import { ScreenTooltipManager } from "@/components/onboarding";
import PaymentStatusBadge, {
    PaymentStatus,
} from "@/components/PaymentStatusBadge";
import { getDefaultProfilePicture } from "@/constants/profilePictures";
import { theme } from "@/constants/theme";
import { useGroupData } from "@/contexts/GroupDataContext";
import { useTrackFeatureOnMount } from "@/hooks/useOnboardingFeatureTracker";
import { MembershipFee, paymentService } from "@/services/paymentService";
import { GroupMemberData } from "@/services/types/group";
import {
    FeePaymentEntry,
    setFeePaymentStatuses,
} from "@/utils/feePaymentStore";
import { consumeSelectedMemberIds } from "@/utils/memberSelectionStore";
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
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    FlatList,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Filter options
type FilterOption = "all" | "paid" | "pending" | "overdue";

// Extended member data with payment info (from Firestore allMembers doc)
interface MemberWithPaymentData extends GroupMemberData {
  paymentStatus?: {
    activeFeeId?: string;
    status?: "paid" | "pending" | "overdue" | "no_fee";
    paidBy?: string;
    paidAt?: any;
  };
}

// Member with computed payment info for display
interface MemberPaymentInfo {
  userId: string;
  name: string;
  email: string;
  roles: string[];
  photoURL: string;
  needsGuardian: boolean;
  displayPaymentStatus: PaymentStatus;
  paidBy?: string | null;
  paidAt?: Date | null;
}

export default function TrackPaymentsScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { clubId, groupId, groupName, feeId } = useLocalSearchParams();
  useTrackFeatureOnMount("payments-viewed");
  const { getGroupMembers } = useGroupData();

  // Get members from real-time context
  const contextGroupMembers = getGroupMembers(
    clubId as string,
    groupId as string,
  );

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fees, setFees] = useState<MembershipFee[]>([]);
  const [selectedFee, setSelectedFee] = useState<MembershipFee | null>(null);
  const [members, setMembers] = useState<MemberPaymentInfo[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterOption>("all");
  const [showFilters, setShowFilters] = useState(false);

  // Manage-members state
  const [isUpdatingMembers, setIsUpdatingMembers] = useState(false);

  // Modal state
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showUpdateResultModal, setShowUpdateResultModal] = useState(false);
  const [updateResultMessage, setUpdateResultMessage] = useState("");

  // Set header title
  useLayoutEffect(() => {
    navigation.setOptions({
      title: groupName
        ? t("screens:trackPayments.groupPayments", { groupName })
        : t("screens:trackPayments.trackPayments"),
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setShowFilters((prev) => !prev)}
          style={{ marginRight: 8, padding: 8 }}
        >
          <Ionicons
            name={activeFilter !== "all" ? "filter" : "filter-outline"}
            size={24}
            color={theme.colors.secondary}
          />
          {activeFilter !== "all" && (
            <View
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.colors.error,
              }}
            />
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, groupName, t, activeFilter]);

  // Fetch fees for the group
  const fetchFees = useCallback(async () => {
    if (!clubId || !groupId) return;

    try {
      const result = await paymentService.getMembershipFees(
        clubId as string,
        groupId as string,
      );

      if (result.success && result.fees) {
        setFees(result.fees);

        // If a specific feeId was passed (from manage-fees), pre-select it.
        // Otherwise fall back to first active fee, then first fee.
        const targetFeeId = typeof feeId === "string" ? feeId : null;
        if (targetFeeId) {
          const target = result.fees.find((f) => f.feeId === targetFeeId);
          if (target) {
            setSelectedFee(target);
            return;
          }
        }
        const activeFee = result.fees.find((f) => f.status === "active");
        if (activeFee) {
          setSelectedFee(activeFee);
        } else if (result.fees.length > 0) {
          setSelectedFee(result.fees[0]);
        }
      }
    } catch (error) {
      console.error("Error fetching fees:", error);
      setErrorMessage(t("screens:trackPayments.failedToLoadMembershipFees"));
      setShowErrorModal(true);
    }
  }, [clubId, groupId, feeId, t]);

  // Navigate to select-event-members in "fee mode"
  const handleManageMembers = useCallback(() => {
    if (!selectedFee) return;

    // Populate the fee payment store so select-event-members can show statuses
    const entries: FeePaymentEntry[] = members
      .filter((m) => m.displayPaymentStatus !== "no_fee")
      .map((m) => ({ userId: m.userId, status: m.displayPaymentStatus }));
    setFeePaymentStatuses(entries);

    router.push({
      pathname: "/select-event-members",
      params: {
        clubId: clubId as string,
        groupId: groupId as string,
        groupName: groupName as string,
        level: "group",
        sourceScreen: "track-payments",
        preSelectedIds: selectedFee.includedMembers.join(","),
      },
    } as any);
  }, [selectedFee, members, clubId, groupId, groupName]);

  // Pick up selected member IDs when returning from select-event-members
  useFocusEffect(
    useCallback(() => {
      const ids = consumeSelectedMemberIds();
      if (ids !== null && selectedFee) {
        handleMemberUpdate(ids);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFee]),
  );

  const handleMemberUpdate = useCallback(
    async (newMemberIds: string[]) => {
      if (!selectedFee) return;
      setIsUpdatingMembers(true);
      try {
        const result = await paymentService.updateFeeMembers(
          selectedFee.feeId,
          newMemberIds,
        );
        if (result.success) {
          await fetchFees();
          let msg = t("screens:trackPayments.membersUpdatedSuccess", {
            added: result.addedCount ?? 0,
            removed: result.removedCount ?? 0,
          });
          if ((result.removedPaidCount ?? 0) > 0) {
            msg +=
              "\n\n" +
              t("screens:trackPayments.paidMembersKept", {
                count: result.removedPaidCount,
              });
          }
          setUpdateResultMessage(msg);
          setShowUpdateResultModal(true);
        } else {
          setErrorMessage(result.error || t("common:genericError"));
          setShowErrorModal(true);
        }
      } finally {
        setIsUpdatingMembers(false);
      }
    },
    [selectedFee, fetchFees, t],
  );

  // Derive members with payment status from context
  const fetchMembersWithPaymentStatus = useCallback(async () => {
    if (!clubId || !groupId) return;

    try {
      // Cast context members to include potential payment data
      const membersWithPaymentData =
        contextGroupMembers as MemberWithPaymentData[];

      // Map members with their payment status
      const membersWithStatus: MemberPaymentInfo[] = membersWithPaymentData.map(
        (member) => {
          // Payment data may be stored in member document from Firestore
          const paymentData = member.paymentStatus;

          // Determine payment status
          let status: PaymentStatus = "no_fee";

          if (
            paymentData &&
            selectedFee &&
            paymentData.activeFeeId === selectedFee.feeId
          ) {
            if (paymentData.status === "paid") {
              status = "paid";
            } else if (paymentData.status === "overdue") {
              status = "overdue";
            } else {
              status = "pending";
            }
          } else if (selectedFee) {
            // Only show members who are actually included in this fee
            const isIncluded = selectedFee.includedMembers?.includes(
              member.userId,
            );
            if (isIncluded) {
              // Check if fee is overdue
              if (selectedFee.dueDate && new Date() > selectedFee.dueDate) {
                status = "overdue";
              } else {
                status = "pending";
              }
            }
          }

          return {
            userId: member.userId,
            name: member.name,
            email: member.email,
            roles: member.roles,
            photoURL: member.photoURL,
            needsGuardian: member.needsGuardian,
            displayPaymentStatus: status,
            paidBy: paymentData?.paidBy || null,
            paidAt: paymentData?.paidAt || null,
          };
        },
      );

      setMembers(membersWithStatus);
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  }, [clubId, groupId, contextGroupMembers, selectedFee]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchFees();
      setLoading(false);
    };
    loadData();
  }, [fetchFees]);

  // Fetch members when fee is selected
  useEffect(() => {
    if (selectedFee) {
      fetchMembersWithPaymentStatus();
    }
  }, [selectedFee, fetchMembersWithPaymentStatus]);

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchFees();
    await fetchMembersWithPaymentStatus();
    setRefreshing(false);
  }, [fetchFees, fetchMembersWithPaymentStatus]);

  // Filter members based on active filter
  const filteredMembers = members.filter((member) => {
    if (member.displayPaymentStatus === "no_fee") return false;
    if (activeFilter === "all") return true;
    if (activeFilter === "paid") return member.displayPaymentStatus === "paid";
    if (activeFilter === "pending")
      return member.displayPaymentStatus === "pending";
    if (activeFilter === "overdue")
      return member.displayPaymentStatus === "overdue";
    return true;
  });

  // Calculate stats
  const stats = {
    total: members.filter((m) => m.displayPaymentStatus !== "no_fee").length,
    paid: members.filter((m) => m.displayPaymentStatus === "paid").length,
    pending: members.filter((m) => m.displayPaymentStatus === "pending").length,
    overdue: members.filter((m) => m.displayPaymentStatus === "overdue").length,
  };

  // Format currency
  const formatAmount = (amount: number, currency: string) => {
    const majorAmount = amount / 100;
    return new Intl.NumberFormat("sv-SE", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(majorAmount);
  };

  // Format date
  const formatDate = (date: Date | null) => {
    if (!date) return t("screens:trackPayments.noDueDate");
    return date.toLocaleDateString("sv-SE", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Render fee card (for fee selection)
  const renderFeeCard = (fee: MembershipFee) => {
    const isSelected = selectedFee?.feeId === fee.feeId;
    const isActive = fee.status === "active";

    return (
      <TouchableOpacity
        key={fee.feeId}
        style={[styles.feeCard, isSelected && styles.feeCardSelected]}
        onPress={() => setSelectedFee(fee)}
      >
        <View style={styles.feeCardHeader}>
          <Text style={styles.feeTitle} numberOfLines={1}>
            {fee.title}
          </Text>
          <View
            style={[
              styles.feeStatusBadge,
              isActive ? styles.feeStatusActive : styles.feeStatusClosed,
            ]}
          >
            <Text
              style={[
                styles.feeStatusText,
                isActive
                  ? styles.feeStatusTextActive
                  : styles.feeStatusTextClosed,
              ]}
            >
              {isActive ? t("common:active") : t("common:closed")}
            </Text>
          </View>
        </View>
        <Text style={styles.feeAmount}>
          {formatAmount(fee.amount, fee.currency)}
        </Text>
        <Text style={styles.feeDueDate}>
          {t("screens:trackPayments.dueDate", {
            date: formatDate(fee.dueDate),
          })}
        </Text>
        <View style={styles.feeProgressContainer}>
          <View
            style={[
              styles.feeProgressBar,
              { width: `${fee.percentPaid || 0}%` },
            ]}
          />
        </View>
        <Text style={styles.feeProgressText}>
          {t("screens:trackPayments.paidProgress", {
            paid: fee.totalPaid || 0,
            total: fee.totalExpected || 0,
            percent: Math.round(fee.percentPaid || 0),
          })}
        </Text>
      </TouchableOpacity>
    );
  };

  // Render member item
  const renderMemberItem = ({ item }: { item: MemberPaymentInfo }) => {
    return (
      <View style={styles.memberItem}>
        <Image
          style={styles.memberAvatar}
          source={{
            uri: item.photoURL || getDefaultProfilePicture(item.needsGuardian),
          }}
        />
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.name}</Text>
          <Text style={styles.memberRole}>
            {item.roles.join(", ")}{" "}
            {item.needsGuardian && t("screens:trackPayments.childYouthLabel")}
          </Text>
        </View>
        <PaymentStatusBadge
          status={item.displayPaymentStatus}
          paidBy={item.paidBy}
        />
      </View>
    );
  };

  // Render filter tabs
  const renderFilterTabs = () => (
    <View style={styles.filterContainer}>
      {(["all", "pending", "paid", "overdue"] as FilterOption[]).map(
        (filter) => {
          const count =
            filter === "all"
              ? stats.total
              : filter === "paid"
                ? stats.paid
                : filter === "pending"
                  ? stats.pending
                  : stats.overdue;

          return (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterTab,
                activeFilter === filter && styles.filterTabActive,
              ]}
              onPress={() => setActiveFilter(filter)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  activeFilter === filter && styles.filterTabTextActive,
                ]}
              >
                {t(
                  `screens:trackPayments.filter${filter.charAt(0).toUpperCase() + filter.slice(1)}`,
                  { count },
                )}
              </Text>
            </TouchableOpacity>
          );
        },
      )}
    </View>
  );

  // Loading state
  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>
            {t("screens:trackPayments.loadingPaymentData")}
          </Text>
        </View>
      </View>
    );
  }

  // No fees state
  if (fees.length === 0) {
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <StatusBar style="light" />
        <View style={styles.emptyContainer}>
          <Ionicons
            name="receipt-outline"
            size={64}
            color={theme.colors.textSecondary}
          />
          <Text style={styles.emptyTitle}>
            {t("screens:trackPayments.noMembershipFees")}
          </Text>
          <Text style={styles.emptySubtitle}>
            {t("screens:trackPayments.noMembershipFeesMessage")}
          </Text>
          <Button
            label={t("screens:trackPayments.createFee")}
            onPress={() =>
              router.push({
                pathname: "/create-fee",
                params: { clubId, groupId },
              } as any)
            }
            theme="secondary"
          />
        </View>
      </View>
    );
  }

  const listHeader = (
    <>
      {/* Fee Selection (if multiple fees) */}
      {fees.length > 1 && (
        <View style={styles.feesSection}>
          <Text style={styles.sectionTitle}>
            {t("screens:trackPayments.membershipFees")}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.feesCarousel}
          >
            {fees.map(renderFeeCard)}
          </ScrollView>
        </View>
      )}

      {/* Selected Fee Summary */}
      {selectedFee && fees.length === 1 && (
        <View style={styles.selectedFeeContainer}>
          <View style={styles.selectedFeeHeader}>
            <Text style={styles.selectedFeeTitle}>{selectedFee.title}</Text>
            <View
              style={[
                styles.feeStatusBadge,
                selectedFee.status === "active"
                  ? styles.feeStatusActive
                  : styles.feeStatusClosed,
              ]}
            >
              <Text
                style={[
                  styles.feeStatusText,
                  selectedFee.status === "active"
                    ? styles.feeStatusTextActive
                    : styles.feeStatusTextClosed,
                ]}
              >
                {selectedFee.status === "active"
                  ? t("common:active")
                  : t("common:closed")}
              </Text>
            </View>
          </View>
          <Text style={styles.selectedFeeAmount}>
            {formatAmount(selectedFee.amount, selectedFee.currency)}
          </Text>
          <Text style={styles.selectedFeeDueDate}>
            {t("screens:trackPayments.dueDate", {
              date: formatDate(selectedFee.dueDate),
            })}
          </Text>
        </View>
      )}

      {/* Filter Tabs (toggled from header icon) */}
      {showFilters && renderFilterTabs()}

      {/* Members List Header */}
      <View style={styles.membersSection}>
        <Text style={styles.sectionTitle}>
          {t("screens:trackPayments.membersCount", {
            count: filteredMembers.length,
          })}
        </Text>
        {/* Manage members icon — only for active fees */}
        {selectedFee?.status === "active" && (
          <TouchableOpacity
            onPress={handleManageMembers}
            style={{ padding: 4 }}
            disabled={isUpdatingMembers}
          >
            {isUpdatingMembers ? (
              <ActivityIndicator size="small" color={theme.colors.secondary} />
            ) : (
              <Ionicons
                name="person-add-outline"
                size={22}
                color={theme.colors.secondary}
              />
            )}
          </TouchableOpacity>
        )}
      </View>
    </>
  );

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />

      <FlatList
        data={filteredMembers}
        renderItem={renderMemberItem}
        keyExtractor={(item) => item.userId}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.noMembersContainer}>
            <Text style={styles.noMembersText}>
              {t("screens:trackPayments.noMembersMatchFilter")}
            </Text>
          </View>
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.secondary}
          />
        }
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

      {/* Member update result modal */}
      <ConfirmationModal
        visible={showUpdateResultModal}
        title={t("common:success")}
        message={updateResultMessage}
        confirmText="OK"
        onConfirm={() => setShowUpdateResultModal(false)}
        onCancel={() => setShowUpdateResultModal(false)}
        confirmButtonTheme="primary"
      />

      <ScreenTooltipManager screen="track-payments" />
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
    color: theme.colors.textSecondary,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: theme.colors.white,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: theme.spacing.xl,
  },

  // Fee Selection
  feesSection: {
    marginTop: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.white,
    marginBottom: theme.spacing.md,
  },
  feesCarousel: {
    paddingRight: theme.spacing.lg,
  },
  feeCard: {
    width: 200,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.large,
    padding: theme.spacing.md,
    marginRight: theme.spacing.md,
    borderWidth: 2,
    borderColor: "transparent",
  },
  feeCardSelected: {
    borderColor: theme.colors.secondary,
  },
  feeCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  feeTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.white,
    flex: 1,
  },
  feeStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  feeStatusActive: {
    backgroundColor: "#DCFCE7",
  },
  feeStatusClosed: {
    backgroundColor: theme.colors.inputBorder,
  },
  feeStatusText: {
    fontSize: 10,
    fontWeight: "600",
  },
  feeStatusTextActive: {
    color: "#166534",
  },
  feeStatusTextClosed: {
    color: theme.colors.textSecondary,
  },
  feeAmount: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.secondary,
    marginBottom: 4,
  },
  feeDueDate: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  feeProgressContainer: {
    height: 4,
    backgroundColor: theme.colors.inputBorder,
    borderRadius: 2,
    marginBottom: 4,
    overflow: "hidden",
  },
  feeProgressBar: {
    height: "100%",
    backgroundColor: theme.colors.secondary,
    borderRadius: 2,
  },
  feeProgressText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },

  // Selected Fee (single fee view)
  selectedFeeContainer: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.large,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.lg,
  },
  selectedFeeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  selectedFeeTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.white,
    flex: 1,
  },
  selectedFeeAmount: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.secondary,
  },
  selectedFeeDueDate: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },

  // Filter Tabs
  filterContainer: {
    flexDirection: "row",
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: 4,
  },
  filterTab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: "center",
    borderRadius: theme.borderRadius.small,
  },
  filterTabActive: {
    backgroundColor: theme.colors.secondary,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  filterTabTextActive: {
    color: theme.colors.primary,
  },

  // Members
  membersSection: {
    marginTop: theme.spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  membersList: {
    marginTop: theme.spacing.sm,
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: theme.spacing.md,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.white,
  },
  memberRole: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  noMembersContainer: {
    padding: theme.spacing.xl,
    alignItems: "center",
  },
  noMembersText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
});
