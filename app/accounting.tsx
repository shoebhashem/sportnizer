// Accounting Dashboard Screen
// Club admins can review auto-generated bookkeeping verifications and export SIE files.

import ConfirmationModal from "@/components/ConfirmationModal";
import { FEE_CATEGORY_I18N_KEYS, FeeCategory } from "@/constants/feeCategories";
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
    Alert,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface VerificationLine {
  account: number;
  debit: number;
  credit: number;
  description: string;
}

interface Verification {
  verificationId: string;
  verNumber: number;
  date: number;
  description: string;
  lines: VerificationLine[];
  sourceType: string;
  feeTitle: string | null;
  category: string | null;
  memberName: string | null;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

export default function AccountingScreen() {
  const { t } = useTranslation(["screens", "common", "components"]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { clubId } = useLocalSearchParams();

  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [resultModal, setResultModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: "", message: "" });

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t("screens:accounting.title"),
    });
  }, [navigation, t]);

  const loadData = useCallback(
    async (silent = false) => {
      if (!clubId) return;
      if (!silent) setLoading(true);
      try {
        const from = new Date(`${selectedYear}-01-01T00:00:00Z`);
        const to = new Date(`${selectedYear}-12-31T23:59:59Z`);
        const result = await paymentService.getAccountingData(
          clubId as string,
          from,
          to,
        );
        if (result.success) {
          setVerifications(result.verifications ?? []);
          setTotalDebit(result.totalDebit ?? 0);
          setTotalCredit(result.totalCredit ?? 0);
        }
      } catch (e) {
        console.error("Error loading accounting data:", e);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [clubId, selectedYear],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  const handleExportSIE = async () => {
    if (!clubId) return;
    setExportLoading(true);
    try {
      const result = await paymentService.generateSIEExport(
        clubId as string,
        selectedYear,
      );
      if (!result.success || !result.content) {
        setResultModal({
          visible: true,
          title: t("common:error"),
          message: result.error || t("common:genericError"),
        });
        return;
      }

      if (Platform.OS === "web") {
        // Web: trigger browser download
        const blob = new Blob([result.content], {
          type: "text/plain;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename ?? `SIE_${selectedYear}.se`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // Native: share via expo-sharing
        try {
          const FileSystem = await import("expo-file-system");
          const Sharing = await import("expo-sharing");
          const fileUri =
            FileSystem.documentDirectory +
            (result.filename ?? `SIE_${selectedYear}.se`);
          await FileSystem.writeAsStringAsync(fileUri, result.content, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, {
              mimeType: "text/plain",
              dialogTitle: t("screens:accounting.exportSIE"),
            });
          } else {
            Alert.alert(
              t("common:error"),
              t("screens:accounting.sharingNotAvailable"),
            );
          }
        } catch (nativeErr: any) {
          setResultModal({
            visible: true,
            title: t("common:error"),
            message: nativeErr.message ?? t("common:genericError"),
          });
        }
      }
    } finally {
      setExportLoading(false);
    }
  };

  const formatAmount = (öre: number): string =>
    (öre / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const getCategoryLabel = (cat?: string | null): string => {
    if (!cat) return "";
    const key = FEE_CATEGORY_I18N_KEYS[cat as FeeCategory];
    return key ? t(`components:feeCategory.${key}`) : cat;
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />

      {/* Year selector */}
      <View style={styles.yearRow}>
        {YEAR_OPTIONS.map((y) => (
          <TouchableOpacity
            key={y}
            style={[styles.yearTab, selectedYear === y && styles.yearTabActive]}
            onPress={() => setSelectedYear(y)}
          >
            <Text
              style={[
                styles.yearTabText,
                selectedYear === y && styles.yearTabTextActive,
              ]}
            >
              {y}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={styles.exportButton}
          onPress={handleExportSIE}
          disabled={exportLoading || verifications.length === 0}
        >
          {exportLoading ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <>
              <Ionicons
                name="download-outline"
                size={16}
                color={theme.colors.primary}
              />
              <Text style={styles.exportButtonText}>
                {t("screens:accounting.exportSIE")}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
        </View>
      ) : verifications.length === 0 ? (
        <View style={styles.centeredContainer}>
          <Ionicons
            name="document-text-outline"
            size={48}
            color={theme.colors.textSecondary}
          />
          <Text style={styles.emptyText}>
            {t("screens:accounting.noVerifications", { year: selectedYear })}
          </Text>
        </View>
      ) : (
        <>
          {/* Summary card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>
                {t("screens:accounting.totalVerifications")}
              </Text>
              <Text style={styles.summaryValue}>{verifications.length}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>
                {t("screens:accounting.totalDebit")}
              </Text>
              <Text style={styles.summaryValue}>
                {formatAmount(totalDebit)}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>
                {t("screens:accounting.totalCredit")}
              </Text>
              <Text style={styles.summaryValue}>
                {formatAmount(totalCredit)}
              </Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            {verifications.map((ver) => (
              <View key={ver.verificationId} style={styles.verCard}>
                {/* Header */}
                <View style={styles.verHeader}>
                  <Text style={styles.verNumber}>#{ver.verNumber}</Text>
                  <Text style={styles.verDate}>
                    {new Date(ver.date).toLocaleDateString()}
                  </Text>
                  <View
                    style={[
                      styles.sourceChip,
                      ver.sourceType === "stripe_refund" &&
                        styles.sourceChipRefund,
                    ]}
                  >
                    <Text style={styles.sourceChipText}>
                      {ver.sourceType === "stripe_refund"
                        ? t("screens:accounting.refund")
                        : t("screens:accounting.payment")}
                    </Text>
                  </View>
                </View>

                <Text style={styles.verDescription} numberOfLines={2}>
                  {ver.description}
                </Text>

                {ver.category ? (
                  <Text style={styles.verCategory}>
                    {getCategoryLabel(ver.category)}
                  </Text>
                ) : null}

                {/* Journal lines */}
                <View style={styles.linesContainer}>
                  <View style={styles.linesHeader}>
                    <Text style={[styles.linesHeaderCell, { flex: 2 }]}>
                      {t("screens:accounting.account")}
                    </Text>
                    <Text style={[styles.linesHeaderCell, styles.amountCell]}>
                      {t("screens:accounting.debit")}
                    </Text>
                    <Text style={[styles.linesHeaderCell, styles.amountCell]}>
                      {t("screens:accounting.credit")}
                    </Text>
                  </View>
                  {ver.lines.map((line, idx) => (
                    <View key={idx} style={styles.linesRow}>
                      <Text style={[styles.lineCell, { flex: 2 }]}>
                        {line.account}
                        {line.description ? ` – ${line.description}` : ""}
                      </Text>
                      <Text style={[styles.lineCell, styles.amountCell]}>
                        {line.debit > 0 ? formatAmount(line.debit) : ""}
                      </Text>
                      <Text style={[styles.lineCell, styles.amountCell]}>
                        {line.credit > 0 ? formatAmount(line.credit) : ""}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </>
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
    gap: 16,
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  yearRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  yearTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.inputBackground,
  },
  yearTabActive: { backgroundColor: theme.colors.secondary },
  yearTabText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  yearTabTextActive: { color: theme.colors.primary, fontWeight: "700" },
  exportButton: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.secondary,
  },
  exportButtonText: {
    color: theme.colors.primary,
    fontWeight: "600",
    fontSize: 13,
  },
  summaryCard: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: theme.colors.inputBackground,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
  },
  summaryItem: { alignItems: "center", gap: 4 },
  summaryLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  summaryValue: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 40 },
  verCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  verHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  verNumber: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  verDate: { fontSize: 13, color: theme.colors.textSecondary },
  sourceChip: {
    marginLeft: "auto",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: theme.colors.secondary + "33",
  },
  sourceChipRefund: { backgroundColor: theme.colors.error + "33" },
  sourceChipText: { fontSize: 11, fontWeight: "500", color: theme.colors.text },
  verDescription: { fontSize: 14, color: theme.colors.text },
  verCategory: { fontSize: 12, color: theme.colors.secondary },
  linesContainer: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderRadius: 8,
    overflow: "hidden",
  },
  linesHeader: {
    flexDirection: "row",
    backgroundColor: theme.colors.background,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  linesHeaderCell: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
  },
  linesRow: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
  },
  lineCell: { fontSize: 12, color: theme.colors.text },
  amountCell: { flex: 1, textAlign: "right" },
});
