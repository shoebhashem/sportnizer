// Chart of Accounts Screen
// Allows club admins to view and edit the club's chart of accounts.
// Admins can change account numbers and names; system accounts are locked
// against deactivation or type changes.

import ConfirmationModal from "@/components/ConfirmationModal";
import { theme } from "@/constants/theme";
import { paymentService } from "@/services/paymentService";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useNavigation } from "expo-router";
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
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ChartAccount {
  id: string;
  number: number;
  name: string;
  type: string;
  vatRate: number;
  taxExempt: boolean;
  categoryMapping: string | null;
  isActive: boolean;
  isSystem: boolean;
}

interface AccountingSettings {
  country?: string;
  fiscalYearStartMonth?: number;
  vatExempt?: boolean;
  chartVersion?: number;
}

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  Asset: "#1565c0",
  Liability: "#6a1b9a",
  Equity: "#4e342e",
  Revenue: "#2e7d32",
  Expense: "#b71c1c",
};

export default function AccountingSettingsScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { clubId } = useLocalSearchParams();

  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [settings, setSettings] = useState<AccountingSettings>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNumber, setEditNumber] = useState("");
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [resultModal, setResultModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: "", message: "" });

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t("screens:accountingSettings.chartOfAccounts"),
    });
  }, [navigation, t]);

  const loadData = useCallback(
    async (silent = false) => {
      if (!clubId) return;
      if (!silent) setLoading(true);
      try {
        const result = await paymentService.getChartOfAccounts(
          clubId as string,
        );
        if (result.success) {
          setAccounts(result.accounts ?? []);
          setSettings(result.settings ?? {});
        }
      } catch (e) {
        console.error("Error loading chart of accounts:", e);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [clubId],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  const startEditing = (account: ChartAccount) => {
    setEditingId(account.id);
    setEditNumber(String(account.number));
    setEditName(account.name);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditNumber("");
    setEditName("");
  };

  const saveAccount = async (account: ChartAccount) => {
    if (!clubId) return;
    const newNumber = parseInt(editNumber, 10);
    if (isNaN(newNumber) || newNumber < 1 || newNumber > 99999) {
      setResultModal({
        visible: true,
        title: t("common:error"),
        message: t("screens:accountingSettings.invalidAccountNumber"),
      });
      return;
    }
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setResultModal({
        visible: true,
        title: t("common:error"),
        message: t("screens:accountingSettings.accountNameRequired"),
      });
      return;
    }

    setSaving(true);
    try {
      await paymentService.updateChartAccount(clubId as string, account.id, {
        number: newNumber,
        name: trimmedName,
      });
      // Update local state immediately
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === account.id
            ? { ...a, number: newNumber, name: trimmedName }
            : a,
        ),
      );
      setEditingId(null);
    } catch (e: any) {
      setResultModal({
        visible: true,
        title: t("common:error"),
        message: e?.message ?? t("common:genericError"),
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (account: ChartAccount) => {
    if (!clubId) return;
    if (account.id === "bank" && account.isActive) {
      setResultModal({
        visible: true,
        title: t("common:error"),
        message: t("screens:accountingSettings.cannotDeactivateBank"),
      });
      return;
    }
    try {
      await paymentService.updateChartAccount(clubId as string, account.id, {
        isActive: !account.isActive,
      });
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === account.id ? { ...a, isActive: !a.isActive } : a,
        ),
      );
    } catch (e: any) {
      setResultModal({
        visible: true,
        title: t("common:error"),
        message: e?.message ?? t("common:genericError"),
      });
    }
  };

  // Group accounts by type for display
  const groupedAccounts = accounts.reduce<Record<string, ChartAccount[]>>(
    (acc, account) => {
      if (!acc[account.type]) acc[account.type] = [];
      acc[account.type].push(account);
      return acc;
    },
    {},
  );
  const TYPE_ORDER = ["Asset", "Liability", "Equity", "Revenue", "Expense"];

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />

      {loading ? (
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Settings info card */}
          {settings.country ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>
                {t("screens:accountingSettings.settingsTitle")}
              </Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>
                  {t("screens:accountingSettings.country")}:
                </Text>
                <Text style={styles.infoValue}>{settings.country}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>
                  {t("screens:accountingSettings.vatExempt")}:
                </Text>
                <Text style={styles.infoValue}>
                  {settings.vatExempt ? t("common:yes") : t("common:no")}
                </Text>
              </View>
            </View>
          ) : null}

          <Text style={styles.sectionHint}>
            {t("screens:accountingSettings.editHint")}
          </Text>

          {TYPE_ORDER.map((type) => {
            const typeAccounts = groupedAccounts[type];
            if (!typeAccounts?.length) return null;
            return (
              <View key={type}>
                <View
                  style={[
                    styles.typeHeader,
                    {
                      borderLeftColor:
                        ACCOUNT_TYPE_COLORS[type] ?? theme.colors.secondary,
                    },
                  ]}
                >
                  <Text style={styles.typeHeaderText}>{type}</Text>
                </View>
                {typeAccounts.map((account) => {
                  const isEditing = editingId === account.id;
                  return (
                    <View
                      key={account.id}
                      style={[
                        styles.accountCard,
                        !account.isActive && styles.accountCardInactive,
                      ]}
                    >
                      {isEditing ? (
                        /* Edit mode */
                        <View style={styles.editContainer}>
                          <View style={styles.editRow}>
                            <View style={styles.editNumberWrapper}>
                              <Text style={styles.editFieldLabel}>
                                {t("screens:accountingSettings.accountNumber")}
                              </Text>
                              <TextInput
                                style={styles.editInput}
                                value={editNumber}
                                onChangeText={setEditNumber}
                                keyboardType="number-pad"
                                maxLength={5}
                                editable={!saving}
                                placeholderTextColor={
                                  theme.colors.textSecondary
                                }
                              />
                            </View>
                            <View style={styles.editNameWrapper}>
                              <Text style={styles.editFieldLabel}>
                                {t("screens:accountingSettings.accountName")}
                              </Text>
                              <TextInput
                                style={styles.editInput}
                                value={editName}
                                onChangeText={setEditName}
                                editable={!saving}
                                placeholderTextColor={
                                  theme.colors.textSecondary
                                }
                              />
                            </View>
                          </View>
                          <View style={styles.editActions}>
                            <TouchableOpacity
                              style={styles.cancelButton}
                              onPress={cancelEditing}
                              disabled={saving}
                            >
                              <Text style={styles.cancelButtonText}>
                                {t("common:cancel")}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.saveButton}
                              onPress={() => saveAccount(account)}
                              disabled={saving}
                            >
                              {saving ? (
                                <ActivityIndicator
                                  size="small"
                                  color={theme.colors.primary}
                                />
                              ) : (
                                <Text style={styles.saveButtonText}>
                                  {t("screens:accountingSettings.save")}
                                </Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        /* View mode */
                        <View style={styles.accountRow}>
                          <View style={styles.accountNumberBadge}>
                            <Text style={styles.accountNumberText}>
                              {account.number}
                            </Text>
                          </View>
                          <View style={styles.accountInfo}>
                            <Text
                              style={[
                                styles.accountName,
                                !account.isActive && styles.accountNameInactive,
                              ]}
                            >
                              {account.name}
                            </Text>
                            <View style={styles.accountMeta}>
                              {account.isSystem ? (
                                <View style={styles.systemBadge}>
                                  <Ionicons
                                    name="lock-closed"
                                    size={10}
                                    color={theme.colors.textSecondary}
                                  />
                                  <Text style={styles.systemBadgeText}>
                                    {t("screens:accountingSettings.system")}
                                  </Text>
                                </View>
                              ) : null}
                              {account.vatRate > 0 ? (
                                <Text style={styles.vatLabel}>
                                  {t("screens:accountingSettings.vat")}:{" "}
                                  {account.vatRate}%
                                </Text>
                              ) : account.taxExempt ? (
                                <Text style={styles.vatLabel}>
                                  {t("screens:accountingSettings.taxExempt")}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                          <View style={styles.accountActions}>
                            <TouchableOpacity
                              style={styles.editIconButton}
                              onPress={() => startEditing(account)}
                            >
                              <Ionicons
                                name="pencil-outline"
                                size={18}
                                color={theme.colors.secondary}
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.toggleButton}
                              onPress={() => toggleActive(account)}
                            >
                              <Ionicons
                                name={
                                  account.isActive
                                    ? "eye-outline"
                                    : "eye-off-outline"
                                }
                                size={18}
                                color={
                                  account.isActive
                                    ? theme.colors.secondary
                                    : theme.colors.textSecondary
                                }
                              />
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}

      <ConfirmationModal
        visible={resultModal.visible}
        title={resultModal.title}
        message={resultModal.message}
        confirmText="OK"
        onConfirm={() => setResultModal({ ...resultModal, visible: false })}
        onCancel={() => setResultModal({ ...resultModal, visible: false })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.primary },
  centeredContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: { padding: 16, gap: 4, paddingBottom: 40 },
  infoCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 6,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 2,
  },
  infoRow: { flexDirection: "row", gap: 8 },
  infoLabel: { fontSize: 13, color: theme.colors.textSecondary },
  infoValue: { fontSize: 13, color: theme.colors.text, fontWeight: "500" },
  sectionHint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  typeHeader: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    marginTop: 12,
    marginBottom: 4,
  },
  typeHeaderText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  accountCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 10,
    marginBottom: 4,
    overflow: "hidden",
  },
  accountCardInactive: { opacity: 0.55 },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  accountNumberBadge: {
    minWidth: 48,
    backgroundColor: theme.colors.background,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignItems: "center",
  },
  accountNumberText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
    fontVariant: ["tabular-nums"],
  },
  accountInfo: { flex: 1, gap: 2 },
  accountName: { fontSize: 14, color: theme.colors.text, fontWeight: "500" },
  accountNameInactive: { color: theme.colors.textSecondary },
  accountMeta: { flexDirection: "row", gap: 8, alignItems: "center" },
  systemBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: theme.colors.background,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  systemBadgeText: { fontSize: 10, color: theme.colors.textSecondary },
  vatLabel: { fontSize: 11, color: theme.colors.textSecondary },
  accountActions: { flexDirection: "row", gap: 4 },
  editIconButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.background,
  },
  toggleButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.background,
  },
  // Editing
  editContainer: { padding: 12, gap: 10 },
  editRow: { flexDirection: "row", gap: 10 },
  editNumberWrapper: { width: 90 },
  editNameWrapper: { flex: 1 },
  editFieldLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginBottom: 4,
    fontWeight: "500",
  },
  editInput: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  cancelButtonText: { fontSize: 14, color: theme.colors.textSecondary },
  saveButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.secondary,
    minWidth: 70,
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.primary,
  },
});
