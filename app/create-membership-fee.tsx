// Create Membership Fee Screen - Club admins create payment requests
// Allows targeting specific roles with fee requests

import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import DateTimePicker from "@/components/DateTimePicker";
import Input from "@/components/Input";
import { theme } from "@/constants/theme";
import { clubService } from "@/services/club";
import { fetchClubGroups } from "@/services/fetchClubGroups";
import { fetchGroupMembers } from "@/services/fetchGroupMembers";
import { paymentService } from "@/services/paymentService";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
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
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface GroupOption {
  id: string;
  name: string;
}

interface RoleCount {
  role: string;
  count: number;
  selected: boolean;
}

export default function CreateMembershipFeeScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { clubId, groupId: preselectedGroupId } = useLocalSearchParams();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    preselectedGroupId ? [preselectedGroupId as string] : [],
  );

  // Data state
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [roleCounts, setRoleCounts] = useState<RoleCount[]>([]);
  const [clubCountry, setClubCountry] = useState("SE");
  const [clubCurrency, setClubCurrency] = useState("sek");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Set header title
  useLayoutEffect(() => {
    navigation.setOptions({
      title: t("screens:createMembershipFee.createFee"),
    });
  }, [navigation, t]);

  // Load members when groups are selected - aggregates across all selected groups
  const loadGroupsMembers = useCallback(
    async (groupIds: string[]) => {
      if (!clubId || groupIds.length === 0) {
        setRoleCounts([]);
        return;
      }

      try {
        // Aggregate role counts across all selected groups
        const roleMap = new Map<string, number>();

        for (const groupId of groupIds) {
          const result = await fetchGroupMembers(clubId as string, groupId);
          if (result.success) {
            for (const member of result.members) {
              for (const role of member.roles || []) {
                roleMap.set(role, (roleMap.get(role) || 0) + 1);
              }
            }
          }
        }

        // Convert to array and mark payer roles as selected by default
        const counts: RoleCount[] = Array.from(roleMap.entries()).map(
          ([role, count]) => ({
            role,
            count,
            selected: role === "player" || role === "player-underage",
          }),
        );

        // Sort: players first, then others alphabetically
        counts.sort((a, b) => {
          if (a.role.startsWith("player") && !b.role.startsWith("player"))
            return -1;
          if (!a.role.startsWith("player") && b.role.startsWith("player"))
            return 1;
          return a.role.localeCompare(b.role);
        });

        setRoleCounts(counts);
      } catch (error) {
        console.error("Error loading group members:", error);
      }
    },
    [clubId],
  );

  // Fetch club data and groups
  const fetchData = useCallback(async () => {
    if (!clubId) return;

    setLoading(true);
    try {
      // Fetch club for currency info
      const clubResult = await clubService.getClub(clubId as string);
      if (clubResult.success && clubResult.data) {
        const club = clubResult.data;
        setClubCountry(club.stripe?.country || "SE");
        setClubCurrency(club.stripe?.currency || "sek");
      }

      // Fetch groups
      const groupsResult = await fetchClubGroups(clubId as string);
      if (groupsResult.success) {
        setGroups(
          groupsResult.groups.map((g: any) => ({ id: g.id, name: g.name })),
        );

        // If preselected group, load its members
        if (preselectedGroupId) {
          await loadGroupsMembers([preselectedGroupId as string]);
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, [clubId, preselectedGroupId, loadGroupsMembers]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Toggle group selection (multi-select)
  const handleGroupToggle = async (groupId: string) => {
    const newSelectedIds = selectedGroupIds.includes(groupId)
      ? selectedGroupIds.filter((id) => id !== groupId)
      : [...selectedGroupIds, groupId];

    setSelectedGroupIds(newSelectedIds);
    await loadGroupsMembers(newSelectedIds);
  };

  const toggleRole = (role: string) => {
    setRoleCounts((prev) =>
      prev.map((rc) =>
        rc.role === role ? { ...rc, selected: !rc.selected } : rc,
      ),
    );
  };

  // Calculate totals
  const selectedRoles = roleCounts.filter((rc) => rc.selected);
  const totalMembers = selectedRoles.reduce((sum, rc) => sum + rc.count, 0);
  const amountInSmallestUnit = Math.round(parseFloat(amount || "0") * 100);
  const feeEstimate = paymentService.estimateFees(
    amountInSmallestUnit,
    clubCountry,
  );
  const totalExpected = totalMembers * amountInSmallestUnit;

  // Validate form
  const isValid =
    title.trim().length > 0 &&
    selectedGroupIds.length > 0 &&
    amountInSmallestUnit >= 300 && // Minimum 3.00
    selectedRoles.length > 0;

  const handleSubmit = async () => {
    if (!isValid || !clubId || selectedGroupIds.length === 0) return;

    setSubmitting(true);

    try {
      // Create fee for each selected group
      let totalMembersNotified = 0;
      let successCount = 0;
      const errors: string[] = [];

      for (const groupId of selectedGroupIds) {
        const result = await paymentService.createMembershipFee({
          clubId: clubId as string,
          groupId,
          title: title.trim(),
          description: description.trim() || undefined,
          amount: amountInSmallestUnit,
          currency: clubCurrency,
          dueDate: dueDate || undefined,
          targetRoles: selectedRoles.map((rc) => rc.role),
        });

        if (result.success) {
          successCount++;
          totalMembersNotified += result.includedMembersCount || 0;
        } else {
          const groupName =
            groups.find((g) => g.id === groupId)?.name || groupId;
          errors.push(`${groupName}: ${result.error}`);
        }
      }

      if (successCount > 0) {
        const groupWord = successCount === 1 ? "group" : "groups";
        setSuccessMessage(
          `Fee created for ${successCount} ${groupWord}!\n\n${totalMembersNotified} members will receive a payment request.${
            errors.length > 0
              ? `\n\nSome groups had errors:\n${errors.join("\n")}`
              : ""
          }`,
        );
        setShowSuccessModal(true);
      } else {
        setErrorMessage(
          errors.length > 0
            ? errors.join("\n")
            : "Failed to create membership fee",
        );
        setShowErrorModal(true);
      }
    } catch (error: any) {
      setErrorMessage(error.message || "An error occurred");
      setShowErrorModal(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSuccessClose = () => {
    setShowSuccessModal(false);
    router.back();
  };

  const formatCurrency = (amountInSmallest: number): string => {
    return paymentService.formatAmount(amountInSmallest, clubCurrency);
  };

  const getRoleDisplayName = (role: string): string => {
    const names: Record<string, string> = {
      player: "Player (Adult)",
      "player-underage": "Player (Youth)",
      coach: "Coach",
      admin: "Admin",
      "club-admin": "Club Admin",
    };
    return names[role] || role;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Fee Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t("screens:createMembershipFee.feeDetails")}
          </Text>

          <Input
            label={t("screens:createMembershipFee.titleRequired")}
            placeholder={t("screens:createMembershipFee.titlePlaceholder")}
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.inputLabel}>
            {t("screens:createMembershipFee.descriptionOptional")}
          </Text>
          <TextInput
            style={styles.textArea}
            placeholder={t(
              "screens:createMembershipFee.descriptionPlaceholder",
            )}
            placeholderTextColor={theme.colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <Text style={styles.inputLabel}>
            {t("screens:createMembershipFee.amountRequired", {
              currency: clubCurrency.toUpperCase(),
            })}
          </Text>
          <View style={styles.amountInputContainer}>
            <TextInput
              style={styles.amountInput}
              placeholder={t("screens:createMembershipFee.amountPlaceholder")}
              placeholderTextColor={theme.colors.textSecondary}
              value={amount}
              onChangeText={(text) => {
                // Allow only numbers and one decimal point
                const cleaned = text.replace(/[^0-9.]/g, "");
                const parts = cleaned.split(".");
                if (parts.length <= 2) {
                  if (parts[1]?.length > 2) {
                    parts[1] = parts[1].substring(0, 2);
                  }
                  setAmount(parts.join("."));
                }
              }}
              keyboardType="decimal-pad"
            />
            <Text style={styles.currencyLabel}>
              {clubCurrency.toUpperCase()}
            </Text>
          </View>
          {amountInSmallestUnit > 0 && amountInSmallestUnit < 300 && (
            <Text style={styles.errorHint}>
              {t("screens:createMembershipFee.minimumAmountError", {
                min: "3.00",
                currency: clubCurrency.toUpperCase(),
              })}
            </Text>
          )}

          {/* Due Date (Optional) */}
          <Text style={styles.inputLabel}>
            {t("screens:createMembershipFee.dueDateOptional")}
          </Text>
          <TouchableOpacity
            style={styles.dueDateButton}
            onPress={() => setShowDueDatePicker(true)}
          >
            <Ionicons
              name="calendar-outline"
              size={20}
              color={dueDate ? theme.colors.text : theme.colors.textSecondary}
            />
            <Text
              style={[
                styles.dueDateText,
                !dueDate && styles.dueDatePlaceholder,
              ]}
            >
              {dueDate
                ? dueDate.toLocaleDateString("en-US", {
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : t("screens:createMembershipFee.selectDueDatePlaceholder")}
            </Text>
            {dueDate && (
              <TouchableOpacity
                onPress={() => setDueDate(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="close-circle"
                  size={20}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          <DateTimePicker
            value={dueDate || new Date()}
            mode="date"
            isVisible={showDueDatePicker}
            onConfirm={(date) => {
              setDueDate(date);
              setShowDueDatePicker(false);
            }}
            onCancel={() => setShowDueDatePicker(false)}
            title={t("screens:createMembershipFee.selectDueDate")}
          />
        </View>

        {/* Group Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t("screens:createMembershipFee.selectGroupsRequired")}
          </Text>
          <Text style={styles.sectionSubtitle}>
            {t("screens:createMembershipFee.selectGroupsHint")}
          </Text>

          {groups.length === 0 ? (
            <Text style={styles.emptyText}>
              {t("screens:createMembershipFee.noGroupsInClub")}
            </Text>
          ) : (
            <View style={styles.groupList}>
              {groups.map((group) => {
                const isSelected = selectedGroupIds.includes(group.id);
                return (
                  <TouchableOpacity
                    key={group.id}
                    style={[
                      styles.groupItem,
                      isSelected && styles.groupItemSelected,
                    ]}
                    onPress={() => handleGroupToggle(group.id)}
                  >
                    <View style={styles.groupCheckbox}>
                      {isSelected && (
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={theme.colors.primary}
                        />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.groupName,
                        isSelected && styles.groupNameSelected,
                      ]}
                    >
                      {group.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {selectedGroupIds.length > 0 && (
            <Text style={styles.groupSelectionHint}>
              {t("screens:createMembershipFee.groupsSelected", {
                count: selectedGroupIds.length,
              })}
            </Text>
          )}
        </View>

        {/* Role Selection */}
        {selectedGroupIds.length > 0 && roleCounts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t("screens:createMembershipFee.whoShouldPay")}
            </Text>
            <Text style={styles.sectionSubtitle}>
              {t("screens:createMembershipFee.whoShouldPayHint")}
            </Text>

            <View style={styles.roleList}>
              {roleCounts.map((rc) => (
                <TouchableOpacity
                  key={rc.role}
                  style={[
                    styles.roleItem,
                    rc.selected && styles.roleItemSelected,
                  ]}
                  onPress={() => toggleRole(rc.role)}
                >
                  <View style={styles.roleCheckbox}>
                    {rc.selected && (
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color={theme.colors.primary}
                      />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.roleName,
                      rc.selected && styles.roleNameSelected,
                    ]}
                  >
                    {getRoleDisplayName(rc.role)}
                  </Text>
                  <Text
                    style={[
                      styles.roleCount,
                      rc.selected && styles.roleCountSelected,
                    ]}
                  >
                    {t("screens:createMembershipFee.membersCount", {
                      count: rc.count,
                    })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Fee Breakdown Preview */}
        {amountInSmallestUnit > 0 && selectedRoles.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t("screens:createMembershipFee.feeBreakdown")}
            </Text>

            <View style={styles.breakdownCard}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>
                  {t("screens:createMembershipFee.membersPay")}
                </Text>
                <Text style={styles.breakdownValue}>
                  {formatCurrency(amountInSmallestUnit)}
                </Text>
              </View>

              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>
                  {t("screens:createMembershipFee.stripeFee", {
                    percent: (
                      (feeEstimate.stripeFeeEstimate / amountInSmallestUnit) *
                      100
                    ).toFixed(1),
                  })}
                </Text>
                <Text style={styles.breakdownValueMuted}>
                  -{formatCurrency(feeEstimate.stripeFeeEstimate)}
                </Text>
              </View>

              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>
                  {t("screens:createMembershipFee.clubnizerFee")}
                </Text>
                <Text style={styles.breakdownValueMuted}>
                  -{formatCurrency(feeEstimate.platformFee)}
                </Text>
              </View>

              <View style={styles.breakdownDivider} />

              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabelBold}>
                  {t("screens:createMembershipFee.clubReceives")}
                </Text>
                <Text style={styles.breakdownValueBold}>
                  ≈{formatCurrency(feeEstimate.clubReceivesEstimate)}
                </Text>
              </View>

              <View style={styles.breakdownDivider} />

              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>
                  {t("screens:createMembershipFee.totalExpected")}
                </Text>
                <Text style={styles.breakdownValue}>
                  {totalMembers} × {formatCurrency(amountInSmallestUnit)} ={" "}
                  {formatCurrency(totalExpected)}
                </Text>
              </View>
            </View>

            <View style={styles.infoBox}>
              <Ionicons
                name="information-circle"
                size={18}
                color={theme.colors.secondary}
              />
              <Text style={styles.infoText}>
                {t("screens:createMembershipFee.stripeFeesDisclaimer")}
              </Text>
            </View>
          </View>
        )}

        {/* Submit Button */}
        <View style={styles.buttonContainer}>
          <Button
            label={
              submitting
                ? t("screens:createMembershipFee.creatingFee")
                : t("screens:createMembershipFee.createFee")
            }
            onPress={handleSubmit}
            theme="primary"
            disabled={!isValid || submitting}
          />
        </View>
      </ScrollView>

      {/* Success Modal */}
      <ConfirmationModal
        visible={showSuccessModal}
        title={t("screens:createMembershipFee.feeCreated")}
        message={successMessage}
        confirmText="OK"
        onConfirm={handleSuccessClose}
        onCancel={handleSuccessClose}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  scrollContent: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  textArea: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 8,
    padding: 12,
    color: theme.colors.text,
    fontSize: 16,
    minHeight: 80,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  amountInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  amountInput: {
    flex: 1,
    padding: 12,
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "600",
  },
  currencyLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    paddingRight: 12,
  },
  errorHint: {
    fontSize: 12,
    color: theme.colors.error,
    marginTop: 4,
  },
  dueDateButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    gap: 10,
  },
  dueDateText: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text,
  },
  dueDatePlaceholder: {
    color: theme.colors.textSecondary,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: "center",
    paddingVertical: 16,
  },
  groupList: {
    gap: 8,
  },
  groupItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 8,
    backgroundColor: theme.colors.inputBackground,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    gap: 12,
  },
  groupItemSelected: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  groupCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.inputBorder,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
  groupName: {
    fontSize: 16,
    color: theme.colors.text,
    flex: 1,
  },
  groupNameSelected: {
    color: theme.colors.primary,
    fontWeight: "600",
  },
  groupSelectionHint: {
    fontSize: 13,
    color: theme.colors.primary,
    marginTop: 8,
    fontWeight: "500",
  },
  roleList: {
    gap: 8,
  },
  roleItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 8,
    backgroundColor: theme.colors.inputBackground,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  roleItemSelected: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  roleCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.white,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  roleName: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text,
  },
  roleNameSelected: {
    color: theme.colors.primary,
    fontWeight: "600",
  },
  roleCount: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  roleCountSelected: {
    color: theme.colors.primary,
  },
  breakdownCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 12,
    padding: 16,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  breakdownLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  breakdownLabelBold: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
  },
  breakdownValue: {
    fontSize: 14,
    color: theme.colors.text,
  },
  breakdownValueMuted: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  breakdownValueBold: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.success,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 12,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginLeft: 8,
  },
  buttonContainer: {
    marginTop: 16,
  },
});
