// Create Fee Screen - Club admins create payment requests with category
import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import DateTimePicker from "@/components/DateTimePicker";
import DropdownInput from "@/components/DropdownInput";
import Input from "@/components/Input";
import {
    EARMARKABLE_CATEGORIES,
    FEE_CATEGORIES,
    FEE_CATEGORY_I18N_KEYS,
    FEE_CATEGORY_LABELS,
    FeeCategory,
    isEarmarkable,
} from "@/constants/feeCategories";
import { theme } from "@/constants/theme";
import { useClubData } from "@/contexts/ClubDataContext";
import { useGroupData } from "@/contexts/GroupDataContext";
import { useTrackFeatureOnAction } from "@/hooks/useOnboardingFeatureTracker";
import { fetchClubGroups } from "@/services/fetchClubGroups";
import { paymentService } from "@/services/paymentService";
import { consumeSelectedMemberIds } from "@/utils/memberSelectionStore";
import { FontAwesome, Ionicons } from "@expo/vector-icons";
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
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
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

export default function CreateFeeScreen() {
  const { t } = useTranslation(["screens", "common", "components"]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { clubId, groupId: preselectedGroupId } = useLocalSearchParams();
  const { getClub } = useClubData();
  const { getGroupMembers } = useGroupData();
  const trackFeeCreated = useTrackFeatureOnAction("fee-created");

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    preselectedGroupId ? [preselectedGroupId as string] : [],
  );
  const [category, setCategory] = useState<FeeCategory>("membership_fee");
  const [earmarkForGroup, setEarmarkForGroup] = useState(false);

  // Data state
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [roleCounts, setRoleCounts] = useState<RoleCount[]>([]);
  const [clubCountry, setClubCountry] = useState("SE");
  const [clubCurrency, setClubCurrency] = useState("sek");
  const [clubPlatformFeePercent, setClubPlatformFeePercent] =
    useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  // Modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t("screens:createFee.createFee"),
    });
  }, [navigation, t]);

  const loadGroupsMembers = useCallback(
    async (groupIds: string[]) => {
      if (!clubId || groupIds.length === 0) {
        setRoleCounts([]);
        return;
      }
      try {
        const roleMap = new Map<string, number>();
        for (const gId of groupIds) {
          const members = getGroupMembers(clubId as string, gId);
          for (const member of members) {
            for (const role of member.roles || []) {
              roleMap.set(role, (roleMap.get(role) || 0) + 1);
            }
          }
        }
        const counts: RoleCount[] = Array.from(roleMap.entries()).map(
          ([role, count]) => ({
            role,
            count,
            selected: role === "player" || role === "player-underage",
          }),
        );
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
    [clubId, getGroupMembers],
  );

  const fetchData = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    try {
      const club = getClub(clubId as string);
      if (club) {
        setClubCountry(club.stripe?.country || "SE");
        setClubCurrency(club.stripe?.currency || "sek");
        setClubPlatformFeePercent(
          typeof club.platformFeePercent === "number"
            ? club.platformFeePercent
            : 0,
        );
      }
      const groupsResult = await fetchClubGroups(clubId as string);
      if (groupsResult.success) {
        setGroups(
          groupsResult.groups.map((g: any) => ({ id: g.id, name: g.name })),
        );
        if (preselectedGroupId) {
          await loadGroupsMembers([preselectedGroupId as string]);
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, [clubId, preselectedGroupId, loadGroupsMembers, getClub]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Consume specific member IDs from store when returning from select-event-members
  useFocusEffect(
    useCallback(() => {
      const ids = consumeSelectedMemberIds();
      if (ids !== null) {
        setSelectedMemberIds(ids);
      }
    }, []),
  );

  const handleGroupToggle = async (groupId: string) => {
    const newSelectedIds = selectedGroupIds.includes(groupId)
      ? selectedGroupIds.filter((id) => id !== groupId)
      : [...selectedGroupIds, groupId];
    setSelectedGroupIds(newSelectedIds);
    await loadGroupsMembers(newSelectedIds);
    if (selectedMemberIds.length > 0) setSelectedMemberIds([]);
  };

  const toggleRole = (role: string) => {
    setRoleCounts((prev) =>
      prev.map((rc) =>
        rc.role === role ? { ...rc, selected: !rc.selected } : rc,
      ),
    );
  };

  const selectedRoles = roleCounts.filter((rc) => rc.selected);
  const totalMembers = selectedRoles.reduce((sum, rc) => sum + rc.count, 0);
  const effectiveMemberCount =
    selectedMemberIds.length > 0 ? selectedMemberIds.length : totalMembers;
  const amountInSmallestUnit = Math.round(parseFloat(amount || "0") * 100);
  const feeEstimate = paymentService.estimateFees(
    amountInSmallestUnit,
    clubCountry,
    clubPlatformFeePercent,
  );
  const totalExpected = effectiveMemberCount * amountInSmallestUnit;

  const isValid =
    title.trim().length > 0 &&
    selectedGroupIds.length > 0 &&
    amountInSmallestUnit >= 300 &&
    (selectedRoles.length > 0 || selectedMemberIds.length > 0) &&
    category.length > 0;

  // Earmark group: if earmark is on, use the first selected group as the earmarked group
  const earmarkedGroupId =
    earmarkForGroup && isEarmarkable(category) && selectedGroupIds.length > 0
      ? selectedGroupIds[0]
      : undefined;

  const handleSubmit = async () => {
    if (!isValid || !clubId || selectedGroupIds.length === 0) return;
    setSubmitting(true);
    try {
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
          category,
          earmarkedGroupId,
          specificMemberIds:
            selectedMemberIds.length > 0 ? selectedMemberIds : undefined,
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
        trackFeeCreated();
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
          errors.length > 0 ? errors.join("\n") : "Failed to create fee",
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
          <Text style={styles.loadingText}>{t("common:loading")}</Text>
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
            {t("screens:createFee.feeDetails")}
          </Text>

          <Input
            label={t("screens:createFee.titleRequired")}
            placeholder={t("screens:createFee.titlePlaceholder")}
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.inputLabel}>
            {t("screens:createFee.descriptionOptional")}
          </Text>
          <TextInput
            style={styles.textArea}
            placeholder={t("screens:createFee.descriptionPlaceholder")}
            placeholderTextColor={theme.colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Category picker */}
          <DropdownInput
            label={`${t("screens:createFee.categoryRequired")} *`}
            value={category}
            onValueChange={(val) => {
              setCategory(val as FeeCategory);
              if (!isEarmarkable(val as FeeCategory)) setEarmarkForGroup(false);
            }}
            options={FEE_CATEGORIES.map((cat) => ({
              id: cat,
              name: t(`components:feeCategory.${FEE_CATEGORY_I18N_KEYS[cat]}`, {
                defaultValue: FEE_CATEGORY_LABELS[cat],
              }),
            }))}
          />

          {/* Earmark toggle — only for earmarkable categories */}
          {isEarmarkable(category) && selectedGroupIds.length > 0 && (
            <View style={styles.earmarkRow}>
              <View style={styles.earmarkTextContainer}>
                <Text style={styles.earmarkTitle}>
                  {t("screens:createFee.earmarkTitle")}
                </Text>
                <Text style={styles.earmarkSubtitle}>
                  {t("screens:createFee.earmarkHint")}
                </Text>
              </View>
              <Switch
                value={earmarkForGroup}
                onValueChange={setEarmarkForGroup}
                trackColor={{
                  false: theme.colors.inputBorder,
                  true: theme.colors.secondary,
                }}
              />
            </View>
          )}

          <Text style={styles.inputLabel}>
            {t("screens:createFee.amountRequired", {
              currency: clubCurrency.toUpperCase(),
            })}
          </Text>
          <View style={styles.amountInputContainer}>
            <TextInput
              style={styles.amountInput}
              placeholder={t("screens:createFee.amountPlaceholder")}
              placeholderTextColor={theme.colors.textSecondary}
              value={amount}
              onChangeText={(text) => {
                const cleaned = text.replace(/[^0-9.]/g, "");
                const parts = cleaned.split(".");
                if (parts.length <= 2) {
                  if (parts[1]?.length > 2) parts[1] = parts[1].substring(0, 2);
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
              {t("screens:createFee.minimumAmountError", {
                min: "3.00",
                currency: clubCurrency.toUpperCase(),
              })}
            </Text>
          )}

          {/* Due Date */}
          <Text style={styles.inputLabel}>
            {t("screens:createFee.dueDateOptional")}
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
                : t("screens:createFee.selectDueDatePlaceholder")}
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
            title={t("screens:createFee.selectDueDate")}
          />
        </View>

        {/* Group Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t("screens:createFee.selectGroupsRequired")}
          </Text>
          <Text style={styles.sectionSubtitle}>
            {t("screens:createFee.selectGroupsHint")}
          </Text>
          {groups.length === 0 ? (
            <Text style={styles.emptyText}>
              {t("screens:createFee.noGroupsInClub")}
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
              {t("screens:createFee.groupsSelected", {
                count: selectedGroupIds.length,
              })}
            </Text>
          )}
        </View>

        {/* Role Selection */}
        {selectedGroupIds.length > 0 && roleCounts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t("screens:createFee.whoShouldPay")}
            </Text>
            <Text style={styles.sectionSubtitle}>
              {t("screens:createFee.whoShouldPayHint")}
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
                  <View
                    style={[
                      styles.roleCheckbox,
                      rc.selected && styles.roleCheckboxSelected,
                    ]}
                  >
                    {rc.selected && (
                      <Ionicons name="checkmark" size={16} color="white" />
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
                    {t("screens:createFee.membersCount", { count: rc.count })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Specific Member Selection */}
        {selectedGroupIds.length === 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t("screens:createFee.specificMembers", {
                defaultValue: "Target Specific Members",
              })}
            </Text>
            <Text style={styles.sectionSubtitle}>
              {t("screens:createFee.specificMembersHint", {
                defaultValue:
                  "Optionally skip role filter and send this fee to specific members only.",
              })}
            </Text>
            <TouchableOpacity
              style={[
                styles.selectMembersBtn,
                selectedMemberIds.length > 0 && styles.selectMembersBtnActive,
              ]}
              onPress={() => {
                router.push({
                  pathname: "/select-event-members",
                  params: {
                    clubId: clubId as string,
                    groupId: selectedGroupIds[0],
                    level: "group",
                    clubName: "",
                    groupName:
                      groups.find((g) => g.id === selectedGroupIds[0])?.name ||
                      "",
                    subgroupId: "",
                    subgroupName: "",
                    sourceScreen: "create-fee",
                    roleFilter: "",
                    preSelectedIds: selectedMemberIds.join(","),
                  },
                });
              }}
            >
              <FontAwesome
                name="user-plus"
                size={14}
                color={
                  selectedMemberIds.length > 0
                    ? "white"
                    : theme.colors.textSecondary
                }
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.selectMembersBtnText,
                  selectedMemberIds.length > 0 &&
                    styles.selectMembersBtnTextActive,
                ]}
              >
                {selectedMemberIds.length > 0
                  ? t("screens:createEvent.membersSelected", {
                      count: selectedMemberIds.length,
                      defaultValue: `${selectedMemberIds.length} members selected`,
                    })
                  : t("screens:createEvent.selectMembers", {
                      defaultValue: "Select members",
                    })}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={
                  selectedMemberIds.length > 0
                    ? "white"
                    : theme.colors.textSecondary
                }
              />
            </TouchableOpacity>
            {selectedMemberIds.length > 0 && (
              <TouchableOpacity
                style={styles.clearMembersBtn}
                onPress={() => setSelectedMemberIds([])}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={16}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.clearMembersBtnText}>
                  {t("screens:createEvent.clearSelection", {
                    defaultValue: "Clear selection",
                  })}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Fee Breakdown Preview */}
        {amountInSmallestUnit > 0 &&
          (selectedRoles.length > 0 || selectedMemberIds.length > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {t("screens:createFee.feeBreakdown")}
              </Text>
              <View style={styles.breakdownCard}>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>
                    {t("screens:createFee.membersPay")}
                  </Text>
                  <Text style={styles.breakdownValue}>
                    {formatCurrency(amountInSmallestUnit)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>
                    {t("screens:createFee.stripeFee", {
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
                    {t("screens:createFee.clubnizerFee", {
                      feePercent: clubPlatformFeePercent,
                    })}
                  </Text>
                  <Text style={styles.breakdownValueMuted}>
                    -{formatCurrency(feeEstimate.platformFee)}
                  </Text>
                </View>
                <View style={styles.breakdownDivider} />
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabelBold}>
                    {t("screens:createFee.clubReceives")}
                  </Text>
                  <Text style={styles.breakdownValueBold}>
                    ≈{formatCurrency(feeEstimate.clubReceivesEstimate)}
                  </Text>
                </View>
                <View style={styles.breakdownDivider} />
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>
                    {t("screens:createFee.totalExpected")}
                  </Text>
                  <Text style={styles.breakdownValue}>
                    {effectiveMemberCount} ×{" "}
                    {formatCurrency(amountInSmallestUnit)} ={" "}
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
                  {t("screens:createFee.stripeFeesDisclaimer")}
                </Text>
              </View>
            </View>
          )}

        {/* Submit */}
        <View style={styles.buttonContainer}>
          <Button
            label={
              submitting
                ? t("screens:createFee.creatingFee")
                : t("screens:createFee.createFee")
            }
            onPress={handleSubmit}
            theme="primary"
            disabled={!isValid || submitting}
          />
        </View>
      </ScrollView>

      <ConfirmationModal
        visible={showSuccessModal}
        title={t("screens:createFee.feeCreated")}
        message={successMessage}
        confirmText="OK"
        onConfirm={handleSuccessClose}
        onCancel={handleSuccessClose}
        confirmButtonTheme="primary"
      />
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

// Keep reference to EARMARKABLE_CATEGORIES to suppress lint warning
void EARMARKABLE_CATEGORIES;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.primary },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  scrollContent: { padding: 20 },
  section: { marginBottom: 24 },
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
  requiredStar: { color: theme.colors.error },
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

  earmarkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  earmarkTextContainer: { flex: 1, marginRight: 12 },
  earmarkTitle: { fontSize: 14, fontWeight: "500", color: theme.colors.text },
  earmarkSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
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
  errorHint: { fontSize: 12, color: theme.colors.error, marginTop: 4 },
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
  dueDateText: { flex: 1, fontSize: 16, color: theme.colors.text },
  dueDatePlaceholder: { color: theme.colors.textSecondary },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: "center",
    paddingVertical: 16,
  },
  groupList: { gap: 8 },
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
  groupName: { fontSize: 16, color: theme.colors.text, flex: 1 },
  groupNameSelected: { color: theme.colors.primary, fontWeight: "600" },
  groupSelectionHint: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 8,
  },
  roleList: { gap: 8 },
  roleItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 8,
    backgroundColor: theme.colors.inputBackground,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    gap: 12,
  },
  roleItemSelected: {
    borderColor: theme.colors.secondary,
  },
  roleCheckboxSelected: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  roleCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.inputBorder,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
  roleName: { fontSize: 16, color: theme.colors.text, flex: 1 },
  roleNameSelected: { color: theme.colors.text, fontWeight: "600" },
  roleCount: { fontSize: 13, color: theme.colors.textSecondary },
  roleCountSelected: { color: theme.colors.secondary },
  breakdownCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  breakdownLabel: { fontSize: 14, color: theme.colors.textSecondary, flex: 1 },
  breakdownLabelBold: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.text,
    flex: 1,
  },
  breakdownValue: { fontSize: 14, color: theme.colors.text },
  breakdownValueMuted: { fontSize: 14, color: theme.colors.error },
  breakdownValueBold: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.secondary,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: theme.colors.inputBorder,
    marginVertical: 4,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: theme.colors.secondary + "22",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  buttonContainer: { marginTop: 8 },
  selectMembersBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 8,
    backgroundColor: theme.colors.inputBackground,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    gap: 8,
  },
  selectMembersBtnActive: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  selectMembersBtnText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: theme.colors.text,
  },
  selectMembersBtnTextActive: {
    color: "white",
  },
  clearMembersBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 4,
  },
  clearMembersBtnText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
});
