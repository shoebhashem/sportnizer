// LOK-stöd Report Management Screen
// Swedish clubs only. Club admins can generate, view, resolve conflicts in,
// and submit LOK attendance reports to RF (Riksidrottsförbundet).

import ConfirmationModal from "@/components/ConfirmationModal";
import { theme } from "@/constants/theme";
import {
    type LokReportSummary,
    deleteLokReport,
    downloadKommunExport,
    generateKommunExport,
    generateLokReport,
    getLokReport,
    listLokReports,
    resolveReportConflict,
    submitLokReportToRf,
} from "@/services/lok/rfService";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useState,
} from "react";
import {
    ActivityIndicator,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── Period helpers ────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const PERIOD_OPTIONS: string[] = [];
for (let y = CURRENT_YEAR; y >= CURRENT_YEAR - 2; y--) {
  PERIOD_OPTIONS.push(`${y}-H2`);
  PERIOD_OPTIONS.push(`${y}-H1`);
}

/** Human-readable label for an RF halvår period, e.g. "H1 2026 (jan–jun)" */
function periodLabel(period: string): string {
  const m = period.match(/^(\d{4})-H([12])$/);
  if (!m) return period;
  const [, year, half] = m;
  return half === "1" ? `H1 ${year} (jan–jun)` : `H2 ${year} (jul–dec)`;
}

// ─── Status badge ──────────────────────────────────────────────

function StatusBadge({ status }: { status: LokReportSummary["status"] }) {
  const color =
    status === "submitted"
      ? "#2196F3"
      : status === "accepted"
        ? "#4CAF50"
        : status === "rejected"
          ? theme.colors.error
          : theme.colors.textSecondary;
  const label =
    status === "submitted"
      ? "Inskickad"
      : status === "accepted"
        ? "Godkänd"
        : status === "rejected"
          ? "Avvisad"
          : "Utkast";
  return (
    <View style={[styles.badge, { backgroundColor: color + "22" }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Conflict resolution row ───────────────────────────────────

interface ConflictRowProps {
  conflict: {
    type: "TIME_OVERLAP" | "SAME_DAY_SAME_SPORT";
    activityIds: string[];
    affectedUserIds: string[];
    resolved: boolean;
    resolution?: string;
  };
  index: number;
  onResolve: (
    index: number,
    resolution: "keep_first" | "keep_second" | "exclude_both",
  ) => void;
}

function ConflictRow({ conflict, index, onResolve }: ConflictRowProps) {
  const typeLabel =
    conflict.type === "TIME_OVERLAP"
      ? "Tidsöverlapp"
      : "Samma dag, samma idrott";
  const [expanded, setExpanded] = useState(false);

  if (conflict.resolved) {
    const resLabel =
      conflict.resolution === "keep_first"
        ? "Behåll första"
        : conflict.resolution === "keep_second"
          ? "Behåll andra"
          : "Uteslut båda";
    return (
      <View style={[styles.conflictRow, styles.conflictResolved]}>
        <Ionicons
          name="checkmark-circle"
          size={18}
          color="#4CAF50"
          style={{ marginRight: 8 }}
        />
        <Text style={styles.conflictResolvedText}>
          {typeLabel} – {resLabel}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.conflictRow}>
      <TouchableOpacity
        style={styles.conflictHeader}
        onPress={() => setExpanded((e) => !e)}
      >
        <Ionicons
          name="warning-outline"
          size={18}
          color={theme.colors.error}
          style={{ marginRight: 8 }}
        />
        <Text style={styles.conflictTitle}>
          {typeLabel} – {conflict.affectedUserIds.length} deltagare
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={theme.colors.textSecondary}
        />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.conflictActions}>
          <Text style={styles.conflictHint}>
            Aktiviteter:{" "}
            {conflict.activityIds.map((id) => id.slice(-6)).join(", ")}
          </Text>
          <View style={styles.conflictButtons}>
            <TouchableOpacity
              style={styles.conflictBtn}
              onPress={() => onResolve(index, "keep_first")}
            >
              <Text style={styles.conflictBtnText}>Behåll första</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.conflictBtn}
              onPress={() => onResolve(index, "keep_second")}
            >
              <Text style={styles.conflictBtnText}>Behåll andra</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.conflictBtn, styles.conflictBtnDanger]}
              onPress={() => onResolve(index, "exclude_both")}
            >
              <Text
                style={[styles.conflictBtnText, { color: theme.colors.error }]}
              >
                Uteslut båda
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────

export default function LokReportsScreen() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [reports, setReports] = useState<LokReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<"csv" | "xml" | "json">(
    "csv",
  );
  const [selectedPeriod, setSelectedPeriod] = useState(PERIOD_OPTIONS[0]);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [reportDetail, setReportDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Confirmation modal state
  const [modal, setModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmText?: string;
    confirmButtonTheme?: "primary" | "secondary";
    onConfirm?: () => void;
  }>({ visible: false, title: "", message: "" });

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "LOK-stöd",
      headerRight: () => (
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/lok-settings",
              params: { clubId },
            } as any)
          }
          style={{ marginRight: 8, padding: 4 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="settings-outline"
            size={22}
            color={theme.colors.secondary}
          />
        </TouchableOpacity>
      ),
    });
  }, [navigation, clubId]);

  const loadReports = useCallback(async () => {
    if (!clubId) return;
    const result = await listLokReports(clubId);
    if (result.success) setReports(result.reports);
  }, [clubId]);

  useEffect(() => {
    setLoading(true);
    loadReports().finally(() => setLoading(false));
  }, [loadReports]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  }, [loadReports]);

  // ─── Generate report ─────────────────────────────────────────

  const handleGenerate = () => {
    const alreadyExists = reports.some(
      (r) => r.period === selectedPeriod && r.status === "draft",
    );
    if (alreadyExists) {
      setModal({
        visible: true,
        title: "Rapport finns redan",
        message: `Det finns redan ett utkast för ${selectedPeriod}. Vill du ta bort det och skapa ett nytt?`,
        confirmText: "Ta bort och skapa nytt",
        confirmButtonTheme: "secondary",
        onConfirm: () => doGenerate(),
      });
      return;
    }
    doGenerate();
  };

  const doGenerate = async () => {
    if (!clubId) return;
    setGenerating(true);
    const result = await generateLokReport(clubId, selectedPeriod);
    setGenerating(false);
    if (result.success) {
      if (result.empty) {
        setModal({
          visible: true,
          title: "Inga aktiviteter att rapportera",
          message:
            result.info ??
            `Inga LOK-berättigade avklarade aktiviteter hittades för ${selectedPeriod}. Markera aktiviteter som LOK-berättigade och se till att de är avklarade med närvaro registrerad.`,
          confirmText: "OK",
          onConfirm: undefined,
        });
        return;
      }
      await loadReports();
      setModal({
        visible: true,
        title: "Rapport skapad",
        message: `${result.summary?.totalActivities ?? 0} aktiviteter, ${result.summary?.totalParticipants ?? 0} deltagare.`,
        confirmText: "OK",
        onConfirm: undefined,
      });
    } else {
      setModal({
        visible: true,
        title: "Fel",
        message: result.error ?? "Kunde inte skapa rapport.",
        confirmText: "OK",
        onConfirm: undefined,
      });
    }
  };

  // ─── Delete report ───────────────────────────────────────────

  const handleDelete = (reportId: string) => {
    setModal({
      visible: true,
      title: "Ta bort rapport",
      message: "Vill du ta bort detta utkast? Åtgärden kan inte ångras.",
      confirmText: "Ta bort",
      confirmButtonTheme: "secondary",
      onConfirm: async () => {
        const result = await deleteLokReport(reportId);
        if (result.success) {
          setExpandedReportId(null);
          setReportDetail(null);
          await loadReports();
        } else {
          setModal({
            visible: true,
            title: "Fel",
            message: result.error ?? "Kunde inte ta bort rapport.",
            confirmText: "OK",
            onConfirm: undefined,
          });
        }
      },
    });
  };

  // ─── Submit report ───────────────────────────────────────────

  const handleSubmit = (reportId: string, hasConflicts: boolean) => {
    if (hasConflicts) {
      setModal({
        visible: true,
        title: "Olösta konflikter",
        message:
          "Rapporten har olösta konflikter. Lös dem innan du skickar in.",
        confirmText: "OK",
        onConfirm: undefined,
      });
      return;
    }
    setModal({
      visible: true,
      title: "Skicka rapport",
      message: "Vill du skicka in rapporten till RF?",
      confirmText: "Skicka",
      confirmButtonTheme: "primary",
      onConfirm: async () => {
        const result = await submitLokReportToRf(reportId);
        if (result.success) {
          await loadReports();
          setExpandedReportId(null);
          setReportDetail(null);
        } else {
          setModal({
            visible: true,
            title: "Fel",
            message: result.error ?? "Kunde inte skicka rapport.",
            confirmText: "OK",
            onConfirm: undefined,
          });
        }
      },
    });
  };

  // ─── Expand / load detail ────────────────────────────────────

  const handleExpand = async (reportId: string) => {
    if (expandedReportId === reportId) {
      setExpandedReportId(null);
      setReportDetail(null);
      return;
    }
    setExpandedReportId(reportId);
    setLoadingDetail(true);
    const result = await getLokReport(reportId);
    setLoadingDetail(false);
    if (result.success) setReportDetail(result.report);
  };

  // ─── Resolve conflict ────────────────────────────────────────

  const handleResolveConflict = async (
    reportId: string,
    conflictIndex: number,
    resolution: "keep_first" | "keep_second" | "exclude_both",
  ) => {
    const result = await resolveReportConflict(
      reportId,
      conflictIndex,
      resolution,
    );
    if (result.success) {
      // Reload detail
      const updated = await getLokReport(reportId);
      if (updated.success) setReportDetail(updated.report);
    } else {
      setModal({
        visible: true,
        title: "Fel",
        message: result.error ?? "Kunde inte lösa konflikt.",
        confirmText: "OK",
        onConfirm: undefined,
      });
    }
  };

  // ─── Render ──────────────────────────────────────────────────

  const handleExport = async (reportPeriod: string, reportId: string) => {
    setExportingId(reportId);
    try {
      const result = await generateKommunExport(
        clubId,
        reportPeriod,
        exportFormat,
      );
      if (result.success && result.content) {
        if (Platform.OS === "web") {
          downloadKommunExport(
            result.content,
            result.filename!,
            result.mimeType!,
          );
        } else {
          setModal({
            visible: true,
            title: "Export genererad",
            message:
              "Nedladdning av filer stöds enbart i webbläsaren. Öppna appen på webben för att ladda ner.",
            confirmText: "OK",
            onConfirm: undefined,
          });
        }
      } else {
        setModal({
          visible: true,
          title: "Fel vid export",
          message: result.error ?? "Kunde inte generera export.",
          confirmText: "OK",
          onConfirm: undefined,
        });
      }
    } finally {
      setExportingId(null);
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="auto" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ── Generate section ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Generera rapport</Text>
          <Text style={styles.sectionDesc}>
            Välj period och generera ett nytt rapportutkast.
          </Text>

          {/* Period selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.periodScroll}
          >
            {PERIOD_OPTIONS.slice(0, 6).map((p) => (
              <TouchableOpacity
                key={p}
                style={[
                  styles.periodChip,
                  selectedPeriod === p && styles.periodChipActive,
                ]}
                onPress={() => setSelectedPeriod(p)}
              >
                <Text
                  style={[
                    styles.periodChipText,
                    selectedPeriod === p && styles.periodChipTextActive,
                  ]}
                >
                  {periodLabel(p)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Export format selector */}
          <Text style={[styles.sectionDesc, { marginBottom: 6, marginTop: 4 }]}>
            Exportformat för kommunrapport:
          </Text>
          <View style={styles.exportFormatRow}>
            {(["csv", "xml", "json"] as const).map((fmt) => (
              <TouchableOpacity
                key={fmt}
                style={[
                  styles.exportFormatChip,
                  exportFormat === fmt && styles.exportFormatChipActive,
                ]}
                onPress={() => setExportFormat(fmt)}
              >
                <Text
                  style={[
                    styles.exportFormatText,
                    exportFormat === fmt && styles.exportFormatTextActive,
                  ]}
                >
                  {fmt.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.generateBtn, generating && styles.btnDisabled]}
            onPress={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons
                  name="add-circle-outline"
                  size={20}
                  color="#fff"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.generateBtnText}>Generera rapport</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Reports list ── */}
        <Text style={styles.listHeader}>Rapporter</Text>

        {loading ? (
          <ActivityIndicator
            size="large"
            color={theme.colors.primary}
            style={{ marginTop: 32 }}
          />
        ) : reports.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="document-outline"
              size={48}
              color={theme.colors.textSecondary}
            />
            <Text style={styles.emptyText}>Inga rapporter ännu</Text>
          </View>
        ) : (
          reports.map((report) => {
            const isExpanded = expandedReportId === report.id;
            return (
              <View key={report.id} style={styles.reportCard}>
                {/* Summary row */}
                <TouchableOpacity
                  style={styles.reportRow}
                  onPress={() => handleExpand(report.id)}
                >
                  <View style={styles.reportInfo}>
                    <Text style={styles.reportPeriod}>{report.period}</Text>
                    <Text style={styles.reportMeta}>
                      {report.totalActivities} akt · {report.totalParticipants}{" "}
                      del
                    </Text>
                  </View>
                  <View style={styles.reportRight}>
                    <StatusBadge status={report.status} />
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={theme.colors.textSecondary}
                      style={{ marginLeft: 8 }}
                    />
                  </View>
                </TouchableOpacity>

                {/* Detail panel */}
                {isExpanded && (
                  <View style={styles.detailPanel}>
                    {loadingDetail ? (
                      <ActivityIndicator
                        size="small"
                        color={theme.colors.primary}
                        style={{ margin: 16 }}
                      />
                    ) : reportDetail ? (
                      <>
                        {/* Stats */}
                        <View style={styles.statsRow}>
                          <View style={styles.statItem}>
                            <Text style={styles.statValue}>
                              {reportDetail.totalParticipants}
                            </Text>
                            <Text style={styles.statLabel}>Deltagare</Text>
                          </View>
                          <View style={styles.statItem}>
                            <Text style={styles.statValue}>
                              {reportDetail.totalLeaders}
                            </Text>
                            <Text style={styles.statLabel}>Ledare</Text>
                          </View>
                          <View style={styles.statItem}>
                            <Text style={styles.statValue}>
                              {reportDetail.activities?.length ?? 0}
                            </Text>
                            <Text style={styles.statLabel}>Aktiviteter</Text>
                          </View>
                        </View>

                        {/* Conflicts */}
                        {reportDetail.conflicts?.length > 0 && (
                          <View style={styles.conflictsSection}>
                            <Text style={styles.conflictsSectionTitle}>
                              Konflikter ({reportDetail.conflicts.length})
                            </Text>
                            {Platform.OS === "web" ? (
                              // Web: table layout
                              <View style={styles.conflictTable}>
                                <View style={styles.conflictTableHeader}>
                                  <Text
                                    style={[
                                      styles.conflictTableCell,
                                      styles.conflictTableHeaderText,
                                      { flex: 2 },
                                    ]}
                                  >
                                    Typ
                                  </Text>
                                  <Text
                                    style={[
                                      styles.conflictTableCell,
                                      styles.conflictTableHeaderText,
                                      { flex: 1 },
                                    ]}
                                  >
                                    Berörda
                                  </Text>
                                  <Text
                                    style={[
                                      styles.conflictTableCell,
                                      styles.conflictTableHeaderText,
                                      { flex: 2 },
                                    ]}
                                  >
                                    Status
                                  </Text>
                                  <Text
                                    style={[
                                      styles.conflictTableCell,
                                      styles.conflictTableHeaderText,
                                      { flex: 3 },
                                    ]}
                                  >
                                    Åtgärd
                                  </Text>
                                </View>
                                {reportDetail.conflicts.map(
                                  (c: any, idx: number) => (
                                    <View
                                      key={idx}
                                      style={[
                                        styles.conflictTableRow,
                                        idx % 2 === 0 &&
                                          styles.conflictTableRowAlt,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.conflictTableCell,
                                          { flex: 2 },
                                        ]}
                                      >
                                        {c.type === "TIME_OVERLAP"
                                          ? "Tidsöverlapp"
                                          : "Samma dag/idrott"}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.conflictTableCell,
                                          { flex: 1 },
                                        ]}
                                      >
                                        {c.affectedUserIds?.length ?? 0}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.conflictTableCell,
                                          { flex: 2 },
                                          c.resolved && { color: "#4CAF50" },
                                        ]}
                                      >
                                        {c.resolved
                                          ? `Löst: ${c.resolution}`
                                          : "Olöst"}
                                      </Text>
                                      {!c.resolved &&
                                      report.status === "draft" ? (
                                        <View
                                          style={[
                                            styles.conflictTableCell,
                                            {
                                              flex: 3,
                                              flexDirection: "row",
                                              gap: 4,
                                            },
                                          ]}
                                        >
                                          {(
                                            [
                                              "keep_first",
                                              "keep_second",
                                              "exclude_both",
                                            ] as const
                                          ).map((res) => (
                                            <TouchableOpacity
                                              key={res}
                                              style={styles.tableBtn}
                                              onPress={() =>
                                                handleResolveConflict(
                                                  report.id,
                                                  idx,
                                                  res,
                                                )
                                              }
                                            >
                                              <Text style={styles.tableBtnText}>
                                                {res === "keep_first"
                                                  ? "Behåll 1"
                                                  : res === "keep_second"
                                                    ? "Behåll 2"
                                                    : "Uteslut"}
                                              </Text>
                                            </TouchableOpacity>
                                          ))}
                                        </View>
                                      ) : (
                                        <View
                                          style={[
                                            styles.conflictTableCell,
                                            { flex: 3 },
                                          ]}
                                        />
                                      )}
                                    </View>
                                  ),
                                )}
                              </View>
                            ) : (
                              // Mobile: accordion cards
                              reportDetail.conflicts.map(
                                (c: any, idx: number) => (
                                  <ConflictRow
                                    key={idx}
                                    conflict={c}
                                    index={idx}
                                    onResolve={(i, res) =>
                                      report.status === "draft"
                                        ? handleResolveConflict(
                                            report.id,
                                            i,
                                            res,
                                          )
                                        : undefined
                                    }
                                  />
                                ),
                              )
                            )}
                          </View>
                        )}

                        {/* Export button — available for draft and submitted */}
                        {(report.status === "draft" ||
                          report.status === "submitted") && (
                          <TouchableOpacity
                            style={[
                              styles.exportBtn,
                              exportingId === report.id && styles.btnDisabled,
                            ]}
                            onPress={() =>
                              handleExport(report.period, report.id)
                            }
                            disabled={exportingId === report.id}
                          >
                            {exportingId === report.id ? (
                              <ActivityIndicator
                                size="small"
                                color={theme.colors.primary}
                              />
                            ) : (
                              <>
                                <Ionicons
                                  name="download-outline"
                                  size={16}
                                  color={theme.colors.primary}
                                  style={{ marginRight: 6 }}
                                />
                                <Text style={styles.exportBtnText}>
                                  Ladda ner {exportFormat.toUpperCase()}-export
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}

                        {/* Action buttons */}
                        {report.status === "draft" && (
                          <View style={styles.actionRow}>
                            <TouchableOpacity
                              style={[styles.actionBtn, styles.submitBtn]}
                              onPress={() =>
                                handleSubmit(
                                  report.id,
                                  reportDetail.hasUnresolvedConflicts,
                                )
                              }
                            >
                              <Ionicons
                                name="cloud-upload-outline"
                                size={18}
                                color="#fff"
                                style={{ marginRight: 6 }}
                              />
                              <Text style={styles.actionBtnText}>
                                Skicka till RF
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, styles.deleteBtn]}
                              onPress={() => handleDelete(report.id)}
                            >
                              <Ionicons
                                name="trash-outline"
                                size={18}
                                color={theme.colors.error}
                                style={{ marginRight: 6 }}
                              />
                              <Text
                                style={[
                                  styles.actionBtnText,
                                  { color: theme.colors.error },
                                ]}
                              >
                                Ta bort
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {report.status === "submitted" && (
                          <View style={styles.submittedBanner}>
                            <Ionicons
                              name="checkmark-circle"
                              size={18}
                              color="#4CAF50"
                              style={{ marginRight: 6 }}
                            />
                            <Text style={styles.submittedText}>
                              Inskickad till RF
                              {reportDetail.rfReceiptId
                                ? ` · Kvitto: ${reportDetail.rfReceiptId}`
                                : ""}
                            </Text>
                          </View>
                        )}
                      </>
                    ) : null}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Confirmation modal — never Alert */}
      <ConfirmationModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        confirmText={modal.confirmText ?? "OK"}
        confirmButtonTheme={modal.confirmButtonTheme ?? "primary"}
        onConfirm={() => {
          setModal((m) => ({ ...m, visible: false }));
          modal.onConfirm?.();
        }}
        onCancel={() => setModal((m) => ({ ...m, visible: false }))}
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  card: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },

  periodScroll: { marginBottom: 12 },
  periodChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 8,
    backgroundColor: theme.colors.background,
  },
  periodChipActive: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  periodChipText: { fontSize: 13, color: theme.colors.text },
  periodChipTextActive: { color: "#fff", fontWeight: "600" },

  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
  },
  generateBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  btnDisabled: { opacity: 0.6 },

  listHeader: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 12,
  },

  emptyState: { alignItems: "center", paddingVertical: 48 },
  emptyText: {
    marginTop: 12,
    fontSize: 15,
    color: theme.colors.textSecondary,
  },

  reportCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  reportRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  reportInfo: { flex: 1 },
  reportPeriod: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.text,
  },
  reportMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  reportRight: { flexDirection: "row", alignItems: "center" },

  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },

  detailPanel: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    padding: 16,
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  statItem: { alignItems: "center" },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  statLabel: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },

  conflictsSection: { marginBottom: 16 },
  conflictsSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 8,
  },

  // Conflict accordion (mobile)
  conflictRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 8,
    overflow: "hidden",
  },
  conflictResolved: { backgroundColor: "#F1F8F1" },
  conflictResolvedText: {
    fontSize: 13,
    color: "#4CAF50",
    padding: 12,
  },
  conflictHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  conflictTitle: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.text,
    fontWeight: "500",
  },
  conflictActions: { padding: 12, paddingTop: 0 },
  conflictHint: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  conflictButtons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  conflictBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  conflictBtnDanger: { borderColor: theme.colors.error + "88" },
  conflictBtnText: { fontSize: 13, color: theme.colors.text },

  // Conflict table (web)
  conflictTable: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    overflow: "hidden",
  },
  conflictTableHeader: {
    flexDirection: "row",
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  conflictTableHeaderText: { fontWeight: "600", color: theme.colors.text },
  conflictTableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  conflictTableRowAlt: { backgroundColor: theme.colors.background + "88" },
  conflictTableCell: {
    padding: 10,
    fontSize: 13,
    color: theme.colors.text,
  },
  tableBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 4,
  },
  tableBtnText: {
    fontSize: 11,
    color: theme.colors.primary,
    fontWeight: "500",
  },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    borderRadius: 10,
  },
  submitBtn: { backgroundColor: theme.colors.primary },
  deleteBtn: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.error + "66",
  },
  actionBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },

  submittedBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    padding: 10,
    backgroundColor: "#F1F8F1",
    borderRadius: 8,
  },
  submittedText: { fontSize: 13, color: "#4CAF50", flex: 1 },

  // Export format chips (in generate card)
  exportFormatRow: {
    flexDirection: "row",
    marginBottom: 12,
    gap: 8,
  },
  exportFormatChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  exportFormatChipActive: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  exportFormatText: {
    fontSize: 13,
    color: theme.colors.text,
    fontWeight: "500",
  },
  exportFormatTextActive: { color: "#fff", fontWeight: "700" },

  // Export download button (in detail panel)
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary + "55",
    backgroundColor: theme.colors.primary + "0D",
  },
  exportBtnText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: "600",
  },
});
