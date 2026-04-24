// Manage Fees Screen - Club admin view of all fees with edit/close actions

import ConfirmationModal from "@/components/ConfirmationModal";
import DateTimePicker from "@/components/DateTimePicker";
import { FEE_CATEGORY_I18N_KEYS, FeeCategory } from "@/constants/feeCategories";
import { theme } from "@/constants/theme";
import { useClubData } from "@/contexts/ClubDataContext";
import { MembershipFee, paymentService } from "@/services/paymentService";
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
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type StatusFilter = "active" | "closed" | "all";

export default function ManageFeesScreen() {
  const { t } = useTranslation(["screens", "common", "components"]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { clubId } = useLocalSearchParams();
  const { getClub } = useClubData();

  const club = typeof clubId === "string" ? getClub(clubId) : null;
  const currency = club?.stripe?.currency || "sek";

  const [fees, setFees] = useState<MembershipFee[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Edit modal state
  const [editingFee, setEditingFee] = useState<MembershipFee | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState<Date | null>(null);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Close confirmation
  const [closingFee, setClosingFee] = useState<MembershipFee | null>(null);

  // Result modal
  const [resultModal, setResultModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: "", message: "" });

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t("screens:manageFees.title"),
    });
  }, [navigation, t]);

  const loadFees = useCallback(
    async (silent = false) => {
      if (!clubId) return;
      if (!silent) setLoading(true);
      try {
        const status =
          statusFilter === "all"
            ? undefined
            : (statusFilter as "active" | "closed");
        const result = await paymentService.getMembershipFees(
          clubId as string,
          undefined,
          status,
        );
        if (result.success && result.fees) {
          setFees(result.fees);
        }
      } catch (e) {
        console.error("Error loading fees:", e);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [clubId, statusFilter],
  );

  useEffect(() => {
    loadFees();
  }, [loadFees]);

  const onRefresh = () => {
    setRefreshing(true);
    loadFees(true);
  };

  const openEdit = (fee: MembershipFee) => {
    setEditingFee(fee);
    setEditTitle(fee.title);
    setEditDescription(fee.description || "");
    setEditDueDate(fee.dueDate);
  };

  const handleSaveEdit = async () => {
    if (!editingFee || !editTitle.trim()) return;
    setSubmittingEdit(true);
    try {
      const result = await paymentService.updateMembershipFee({
        feeId: editingFee.feeId,
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        dueDate: editDueDate,
      });
      if (result.success) {
        setEditingFee(null);
        await loadFees(true);
      } else {
        setResultModal({
          visible: true,
          title: t("common:error"),
          message: result.error || t("common:genericError"),
        });
      }
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleCloseFee = async () => {
    if (!closingFee) return;
    const result = await paymentService.closeMembershipFee(closingFee.feeId);
    setClosingFee(null);
    if (result.success) {
      await loadFees(true);
    } else {
      setResultModal({
        visible: true,
        title: t("common:error"),
        message: result.error || t("common:genericError"),
      });
    }
  };

  const getCategoryLabel = (cat?: string): string => {
    if (!cat) return "";
    const key = FEE_CATEGORY_I18N_KEYS[cat as FeeCategory];
    if (!key) return cat;
    return t(`components:feeCategory.${key}`);
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return t("screens:manageFees.noDueDate");
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatCurrency = (amount: number) =>
    paymentService.formatAmount(amount, currency);

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />

      {/* Status Filter Tabs */}
      <View style={styles.filterRow}>
        {(["active", "closed", "all"] as StatusFilter[]).map((s) => (
          <TouchableOpacity
            key={s}
            style={[
              styles.filterTab,
              statusFilter === s && styles.filterTabActive,
            ]}
            onPress={() => setStatusFilter(s)}
          >
            <Text
              style={[
                styles.filterTabText,
                statusFilter === s && styles.filterTabTextActive,
              ]}
            >
              {t(`screens:manageFees.filter_${s}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
        </View>
      ) : fees.length === 0 ? (
        <View style={styles.centeredContainer}>
          <Ionicons
            name="receipt-outline"
            size={48}
            color={theme.colors.textSecondary}
          />
          <Text style={styles.emptyText}>{t("screens:manageFees.noFees")}</Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() =>
              router.push({
                pathname: "/create-fee",
                params: { clubId: clubId as string },
              } as any)
            }
          >
            <Text style={styles.createButtonText}>
              {t("screens:manageFees.createFee")}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {fees.map((fee) => (
            <View key={fee.feeId} style={styles.feeCard}>
              {/* Title + status badge */}
              <View style={styles.feeHeader}>
                <Text style={styles.feeTitle} numberOfLines={2}>
                  {fee.title}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    fee.status === "closed"
                      ? styles.statusBadgeClosed
                      : styles.statusBadgeActive,
                  ]}
                >
                  <Text style={styles.statusBadgeText}>
                    {fee.status === "closed"
                      ? t("screens:manageFees.closed")
                      : t("screens:manageFees.active")}
                  </Text>
                </View>
              </View>

              {/* Meta row */}
              <View style={styles.metaRow}>
                {fee.category ? (
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>
                      {getCategoryLabel(fee.category)}
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.metaText}>{fee.groupName}</Text>
              </View>

              {/* Progress */}
              <View style={styles.progressRow}>
                <Text style={styles.progressText}>
                  {t("screens:manageFees.paid", {
                    paid: fee.totalPaid,
                    total: fee.includedMembers.length,
                    percent: fee.percentPaid,
                  })}
                </Text>
                <Text style={styles.amountText}>
                  {formatCurrency(fee.amount)}
                </Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${Math.min(fee.percentPaid, 100)}%` },
                  ]}
                />
              </View>

              {/* Due date */}
              <Text style={styles.dueDateText}>
                {t("screens:manageFees.dueDate", {
                  date: formatDate(fee.dueDate),
                })}
              </Text>

              {/* Actions — only for active fees */}
              {fee.status === "active" && (
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => openEdit(fee)}
                  >
                    <Ionicons
                      name="pencil-outline"
                      size={16}
                      color={theme.colors.secondary}
                    />
                    <Text style={styles.actionButtonText}>
                      {t("screens:manageFees.edit")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonDanger]}
                    onPress={() => setClosingFee(fee)}
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={16}
                      color={theme.colors.error}
                    />
                    <Text
                      style={[
                        styles.actionButtonText,
                        styles.actionButtonTextDanger,
                      ]}
                    >
                      {t("screens:manageFees.close")}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* FAB — create fee */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() =>
          router.push({
            pathname: "/create-fee",
            params: { clubId: clubId as string },
          } as any)
        }
      >
        <Ionicons name="add" size={28} color={theme.colors.primary} />
      </TouchableOpacity>

      {/* Edit Modal */}
      <Modal
        visible={!!editingFee}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingFee(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setEditingFee(null)}
        >
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {t("screens:manageFees.editFee")}
            </Text>

            <Text style={styles.fieldLabel}>
              {t("screens:manageFees.editTitle")}
            </Text>
            <TextInput
              style={styles.fieldInput}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder={t("screens:manageFees.editTitlePlaceholder")}
              placeholderTextColor={theme.colors.textSecondary}
            />

            <Text style={styles.fieldLabel}>
              {t("screens:manageFees.editDescription")}
            </Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldTextArea]}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder={t("screens:manageFees.editDescriptionPlaceholder")}
              placeholderTextColor={theme.colors.textSecondary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <Text style={styles.fieldLabel}>
              {t("screens:manageFees.editDueDate")}
            </Text>
            <TouchableOpacity
              style={styles.dueDateButton}
              onPress={() => setShowDueDatePicker(true)}
            >
              <Ionicons
                name="calendar-outline"
                size={18}
                color={
                  editDueDate ? theme.colors.text : theme.colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.dueDateButtonText,
                  !editDueDate && styles.dueDateButtonTextPlaceholder,
                ]}
              >
                {editDueDate
                  ? formatDate(editDueDate)
                  : t("screens:manageFees.noDueDate")}
              </Text>
              {editDueDate && (
                <TouchableOpacity onPress={() => setEditDueDate(null)}>
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            <DateTimePicker
              value={editDueDate || new Date()}
              mode="date"
              isVisible={showDueDatePicker}
              onConfirm={(d) => {
                setEditDueDate(d);
                setShowDueDatePicker(false);
              }}
              onCancel={() => setShowDueDatePicker(false)}
              title={t("screens:manageFees.selectDueDate")}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setEditingFee(null)}
              >
                <Text style={styles.modalButtonCancelText}>
                  {t("common:cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButtonSave,
                  (!editTitle.trim() || submittingEdit) &&
                    styles.modalButtonDisabled,
                ]}
                onPress={handleSaveEdit}
                disabled={!editTitle.trim() || submittingEdit}
              >
                {submittingEdit ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primary}
                  />
                ) : (
                  <Text style={styles.modalButtonSaveText}>
                    {t("common:save")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Close confirmation */}
      <ConfirmationModal
        visible={!!closingFee}
        title={t("screens:manageFees.confirmCloseTitle")}
        message={t("screens:manageFees.confirmCloseMessage", {
          title: closingFee?.title ?? "",
        })}
        confirmText={t("screens:manageFees.close")}
        onConfirm={handleCloseFee}
        onCancel={() => setClosingFee(null)}
        confirmButtonTheme="danger"
      />

      {/* Result modal */}
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
    gap: 16,
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  createButton: {
    backgroundColor: theme.colors.secondary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createButtonText: {
    color: theme.colors.primary,
    fontWeight: "600",
    fontSize: 15,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
  },
  filterTabActive: { backgroundColor: theme.colors.secondary },
  filterTabText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  filterTabTextActive: { color: theme.colors.primary, fontWeight: "700" },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 100 },
  feeCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  feeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  feeTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
  },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  statusBadgeActive: { backgroundColor: theme.colors.secondary + "33" },
  statusBadgeClosed: { backgroundColor: theme.colors.textSecondary + "33" },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.text,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaChip: {
    backgroundColor: theme.colors.secondary + "22",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  metaChipText: {
    fontSize: 11,
    color: theme.colors.secondary,
    fontWeight: "500",
  },
  metaText: { fontSize: 13, color: theme.colors.textSecondary },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressText: { fontSize: 13, color: theme.colors.textSecondary },
  amountText: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.secondary,
  },
  progressBar: {
    height: 4,
    backgroundColor: theme.colors.inputBorder,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: theme.colors.secondary,
    borderRadius: 2,
  },
  dueDateText: { fontSize: 12, color: theme.colors.textSecondary },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
  },
  actionButtonDanger: { borderColor: theme.colors.error },
  actionButtonText: {
    fontSize: 13,
    color: theme.colors.secondary,
    fontWeight: "500",
  },
  actionButtonTextDanger: { color: theme.colors.error },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.secondary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  // Edit Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.text,
    marginTop: 8,
  },
  fieldInput: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    marginTop: 4,
  },
  fieldTextArea: { minHeight: 72, textAlignVertical: "top" },
  dueDateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    marginTop: 4,
  },
  dueDateButtonText: { flex: 1, fontSize: 15, color: theme.colors.text },
  dueDateButtonTextPlaceholder: { color: theme.colors.textSecondary },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 16 },
  modalButtonCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    alignItems: "center",
  },
  modalButtonCancelText: { color: theme.colors.text, fontWeight: "500" },
  modalButtonSave: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.secondary,
    alignItems: "center",
  },
  modalButtonSaveText: { color: theme.colors.primary, fontWeight: "700" },
  modalButtonDisabled: { opacity: 0.5 },
});
