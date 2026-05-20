// LOK-stöd Report Management Screen
// Swedish clubs only. Club admins can:
//  1. Review all eligible events per period (with group filter + search)
//  2. Edit attendees on any completed event (re-edit attendance)
//  3. Confirm a period — generates/replaces the LOK report snapshot
//  4. Resolve conflicts and submit/export the confirmed report

import ConfirmationModal from "@/components/ConfirmationModal";
import { theme } from "@/constants/theme";
import {
    type LokEligibleEvent,
    type LokReportSummary,
    deleteLokReport,
    downloadKommunExport,
    generateKommunExport,
    generateLokReport,
    getLokReport,
    listEligibleEvents,
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
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
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

function periodLabel(period: string): string {
  const m = period.match(/^(\d{4})-H([12])$/);
  if (!m) return period;
  const [, year, half] = m;
  return half === "1" ? `H1 ${year} (jan–jun)` : `H2 ${year} (jul–dec)`;
}

function formatDate(ts: any): string {
  if (!ts) return "–";
  const d: Date = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
          : status === "stale"
            ? theme.colors.warning
            : theme.colors.textSecondary;
  const label =
    status === "submitted"
      ? "Inskickad"
      : status === "accepted"
        ? "Godkänd"
        : status === "rejected"
          ? "Avvisad"
          : status === "stale"
            ? "Inaktuell"
            : "Utkast";
  return (
    <View style={[styles.badge, { backgroundColor: color + "22" }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Conflict row (mobile accordion) ──────────────────────────

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
            {(["keep_first", "keep_second", "exclude_both"] as const).map(
              (res) => (
                <TouchableOpacity
                  key={res}
                  style={[
                    styles.conflictBtn,
                    res === "exclude_both" && styles.conflictBtnDanger,
                  ]}
                  onPress={() => onResolve(index, res)}
                >
                  <Text
                    style={[
                      styles.conflictBtnText,
                      res === "exclude_both" && { color: theme.colors.error },
                    ]}
                  >
                    {res === "keep_first"
                      ? "Behåll första"
                      : res === "keep_second"
                        ? "Behåll andra"
                        : "Uteslut båda"}
                  </Text>
                </TouchableOpacity>
              ),
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Export Format Modal ───────────────────────────────────────

interface ExportModalProps {
  visible: boolean;
  clubId: string;
  reports: LokReportSummary[];
  onClose: () => void;
}

function ExportModal({ visible, clubId, reports, onClose }: ExportModalProps) {
  const [format, setFormat] = useState<"csv" | "xml" | "json">("csv");
  const [selectedReport, setSelectedReport] = useState<LokReportSummary | null>(
    null,
  );
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportableReports = reports.filter((r) =>
    ["draft", "stale", "submitted", "accepted"].includes(r.status),
  );

  useEffect(() => {
    if (visible && !selectedReport && exportableReports.length > 0) {
      setSelectedReport(exportableReports[0]);
    }
    if (!visible) setError(null);
  }, [visible]);

  const handleExport = async () => {
    if (!selectedReport) return;
    setExporting(true);
    setError(null);
    try {
      const result = await generateKommunExport(
        clubId,
        selectedReport.period,
        format,
      );
      if (result.success && result.content) {
        if (Platform.OS === "web") {
          downloadKommunExport(
            result.content,
            result.filename!,
            result.mimeType!,
          );
          onClose();
        } else {
          setError("Nedladdning stöds enbart i webbläsaren.");
        }
      } else {
        setError(result.error ?? "Kunde inte generera export.");
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { maxHeight: 480 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Exportera rapport</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <Text style={styles.exportModalLabel}>Välj rapport</Text>
          {exportableReports.length === 0 ? (
            <Text style={styles.sectionDesc}>
              Inga bekräftade rapporter att exportera.
            </Text>
          ) : (
            <ScrollView
              style={{ maxHeight: 160 }}
              showsVerticalScrollIndicator={false}
            >
              {exportableReports.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={[
                    styles.exportReportRow,
                    selectedReport?.id === r.id && styles.exportReportRowActive,
                  ]}
                  onPress={() => setSelectedReport(r)}
                >
                  <Text
                    style={[
                      styles.exportReportLabel,
                      selectedReport?.id === r.id && { color: "#fff" },
                    ]}
                  >
                    {periodLabel(r.period)}
                  </Text>
                  <StatusBadge status={r.status} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <Text style={[styles.exportModalLabel, { marginTop: 16 }]}>
            Format
          </Text>
          <View style={styles.exportFormatRow}>
            {(["csv", "xml", "json"] as const).map((fmt) => (
              <TouchableOpacity
                key={fmt}
                style={[
                  styles.exportFormatChip,
                  format === fmt && styles.exportFormatChipActive,
                ]}
                onPress={() => setFormat(fmt)}
              >
                <Text
                  style={[
                    styles.exportFormatText,
                    format === fmt && styles.exportFormatTextActive,
                  ]}
                >
                  {fmt.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <TouchableOpacity
            style={[
              styles.saveBtn,
              (exporting || !selectedReport) && styles.btnDisabled,
            ]}
            onPress={handleExport}
            disabled={exporting || !selectedReport}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons
                  name="download-outline"
                  size={18}
                  color="#fff"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.saveBtnText}>
                  Ladda ner {format.toUpperCase()}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ───────────────────────────────────────────────

export default function LokReportsScreen() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // ── Tab state ────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"events" | "reports">("events");

  // ── Eligible events state ────────────────────────────────────
  const [selectedPeriod, setSelectedPeriod] = useState(PERIOD_OPTIONS[0]);
  const [eligibleEvents, setEligibleEvents] = useState<LokEligibleEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Confirm period state ─────────────────────────────────────
  const [confirming, setConfirming] = useState(false);

  // ── Reports state ────────────────────────────────────────────
  const [reports, setReports] = useState<LokReportSummary[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [reportDetail, setReportDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // ── Export modal ─────────────────────────────────────────────
  const [exportModalVisible, setExportModalVisible] = useState(false);

  // ── Confirmation modal ───────────────────────────────────────
  const [modal, setModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmText?: string;
    confirmButtonTheme?: "primary" | "secondary";
    onConfirm?: () => void;
  }>({ visible: false, title: "", message: "" });

  // ── Header ───────────────────────────────────────────────────
  useLayoutEffect(() => {
    navigation.setOptions({
      title: "LOK-stöd",
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            onPress={() => setExportModalVisible(true)}
            style={{ marginRight: 4, padding: 4 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="download-outline"
              size={22}
              color={theme.colors.secondary}
            />
          </TouchableOpacity>
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
        </View>
      ),
    });
  }, [navigation, clubId]);

  // ── Data loaders ─────────────────────────────────────────────

  const loadEvents = useCallback(async () => {
    if (!clubId) return;
    setLoadingEvents(true);
    const result = await listEligibleEvents(clubId, selectedPeriod);
    if (result.success) setEligibleEvents(result.events);
    setLoadingEvents(false);
  }, [clubId, selectedPeriod]);

  const loadReports = useCallback(async () => {
    if (!clubId) return;
    const result = await listLokReports(clubId);
    if (result.success) setReports(result.reports);
  }, [clubId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    setLoadingReports(true);
    loadReports().finally(() => setLoadingReports(false));
  }, [loadReports]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadEvents(), loadReports()]);
    setRefreshing(false);
  }, [loadEvents, loadReports]);

  // ── Derived data ─────────────────────────────────────────────

  const groups = Array.from(
    new Map(
      eligibleEvents
        .filter((e) => e.groupId && e.groupName)
        .map((e) => [e.groupId!, e.groupName!]),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));

  const filteredEvents = eligibleEvents.filter((e) => {
    if (selectedGroup && e.groupId !== selectedGroup) return false;
    if (
      searchQuery &&
      !e.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !(e.groupName ?? "").toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const periodReport = reports.find((r) => r.period === selectedPeriod);
  const isConfirmed =
    periodReport &&
    ["draft", "submitted", "accepted"].includes(periodReport.status);
  const isStale = periodReport?.status === "stale";

  // ── Confirm period ────────────────────────────────────────────

  const handleConfirmPeriod = () => {
    const hasConflicts = filteredEvents.some(
      (e) => e.lok.conflictStatus === "conflict",
    );
    let message = `Bekräfta alla ${filteredEvents.length} LOK-berättigade aktiviteter för ${periodLabel(selectedPeriod)}. En rapport skapas och aktiviteterna låses för denna period.`;
    if (isConfirmed || isStale) {
      message = `Det finns redan en rapport för ${periodLabel(selectedPeriod)}. En ny version skapas och ersätter den befintliga.`;
    }
    if (hasConflicts) {
      message +=
        "\n\n⚠️ Observera: vissa aktiviteter har konflikter som behöver lösas i rapporten.";
    }
    setModal({
      visible: true,
      title: `Bekräfta ${periodLabel(selectedPeriod)}`,
      message,
      confirmText: "Bekräfta",
      confirmButtonTheme: "primary",
      onConfirm: doConfirmPeriod,
    });
  };

  const doConfirmPeriod = async () => {
    if (!clubId) return;
    setConfirming(true);
    const result = await generateLokReport(clubId, selectedPeriod, true);
    setConfirming(false);
    if (result.success) {
      if (result.empty) {
        setModal({
          visible: true,
          title: "Inga aktiviteter",
          message:
            result.info ??
            "Inga LOK-berättigade aktiviteter hittades för perioden.",
          confirmText: "OK",
          onConfirm: undefined,
        });
        return;
      }
      await Promise.all([loadEvents(), loadReports()]);
      setActiveTab("reports");
      setModal({
        visible: true,
        title: "Period bekräftad",
        message: `${result.summary?.totalActivities ?? 0} aktiviteter bekräftade, ${result.summary?.totalParticipants ?? 0} unika deltagare.${(result.summary?.conflicts ?? 0) > 0 ? `\n\n${result.summary?.conflicts} konflikt(er) behöver lösas.` : ""}`,
        confirmText: "OK",
        onConfirm: undefined,
      });
    } else {
      setModal({
        visible: true,
        title: "Fel",
        message: result.error ?? "Kunde inte bekräfta perioden.",
        confirmText: "OK",
        onConfirm: undefined,
      });
    }
  };

  // ── Report actions ────────────────────────────────────────────

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
          await Promise.all([loadReports(), loadEvents()]);
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

  // ── Render ────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="auto" />

      {/* ── Tab bar ── */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "events" && styles.tabBtnActive]}
          onPress={() => setActiveTab("events")}
        >
          <Text
            style={[
              styles.tabLabel,
              activeTab === "events" && styles.tabLabelActive,
            ]}
          >
            Aktiviteter
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabBtn,
            activeTab === "reports" && styles.tabBtnActive,
          ]}
          onPress={() => setActiveTab("reports")}
        >
          <Text
            style={[
              styles.tabLabel,
              activeTab === "reports" && styles.tabLabelActive,
            ]}
          >
            Rapporter
          </Text>
          {reports.some((r) => r.status === "stale") && (
            <View style={styles.tabWarningDot} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ══════════════════════════════════════════════════════
            AKTIVITETER TAB
           ══════════════════════════════════════════════════════ */}
        {activeTab === "events" && (
          <>
            {/* ── Period selector ── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.periodScroll}
              contentContainerStyle={{ paddingBottom: 4 }}
            >
              {PERIOD_OPTIONS.slice(0, 6).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.periodChip,
                    selectedPeriod === p && styles.periodChipActive,
                  ]}
                  onPress={() => {
                    setSelectedPeriod(p);
                    setSelectedGroup(null);
                    setSearchQuery("");
                  }}
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

            {/* ── Group filter ── */}
            {groups.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.groupScroll}
                contentContainerStyle={{ paddingBottom: 4 }}
              >
                <TouchableOpacity
                  style={[
                    styles.groupChip,
                    !selectedGroup && styles.groupChipActive,
                  ]}
                  onPress={() => setSelectedGroup(null)}
                >
                  <Text
                    style={[
                      styles.groupChipText,
                      !selectedGroup && styles.groupChipTextActive,
                    ]}
                  >
                    Alla
                  </Text>
                </TouchableOpacity>
                {groups.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    style={[
                      styles.groupChip,
                      selectedGroup === g.id && styles.groupChipActive,
                    ]}
                    onPress={() => setSelectedGroup(g.id)}
                  >
                    <Text
                      style={[
                        styles.groupChipText,
                        selectedGroup === g.id && styles.groupChipTextActive,
                      ]}
                    >
                      {g.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* ── Search ── */}
            <View style={styles.searchRow}>
              <Ionicons
                name="search-outline"
                size={16}
                color={theme.colors.textSecondary}
                style={{ marginRight: 8 }}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Sök aktivitet eller grupp..."
                placeholderTextColor={theme.colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Ionicons
                    name="close-circle"
                    size={16}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* ── Stale warning ── */}
            {isStale && (
              <View style={styles.staleBanner}>
                <Ionicons
                  name="warning-outline"
                  size={16}
                  color={theme.colors.warning}
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.staleBannerText}>
                  En aktivitet ändrades efter att rapporten bekräftades.
                  Bekräfta perioden igen för att uppdatera rapporten.
                </Text>
              </View>
            )}

            {/* ── Events list ── */}
            {loadingEvents ? (
              <ActivityIndicator
                size="large"
                color={theme.colors.primary}
                style={{ marginTop: 32 }}
              />
            ) : filteredEvents.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons
                  name="calendar-outline"
                  size={48}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.emptyText}>
                  Inga LOK-berättigade aktiviteter för{" "}
                  {periodLabel(selectedPeriod)}
                </Text>
                <Text style={styles.emptyHint}>
                  Aktiviteter markeras som LOK-berättigade när närvaro är
                  registrerad och de uppfyller RF:s krav.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.eventsCount}>
                  {filteredEvents.length} aktivitet
                  {filteredEvents.length !== 1 ? "er" : ""}
                </Text>
                {filteredEvents.map((event) => {
                  const isConflict = event.lok.conflictStatus === "conflict";
                  const isClean = event.lok.conflictStatus === "clean";
                  const isConfirmedEvent =
                    event.lok.confirmedForPeriod === selectedPeriod;
                  return (
                    <View key={event.id} style={styles.eventCard}>
                      <View style={styles.eventCardLeft}>
                        {isConflict ? (
                          <Ionicons
                            name="warning"
                            size={16}
                            color={theme.colors.warning}
                          />
                        ) : isClean ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={16}
                            color="#4CAF50"
                          />
                        ) : (
                          <Ionicons
                            name="ellipse-outline"
                            size={16}
                            color={theme.colors.textSecondary}
                          />
                        )}
                      </View>
                      <View style={styles.eventCardBody}>
                        <View style={styles.eventCardRow}>
                          <Text style={styles.eventTitle} numberOfLines={1}>
                            {event.title}
                          </Text>
                          {isConfirmedEvent && (
                            <View style={styles.confirmedBadge}>
                              <Text style={styles.confirmedBadgeText}>
                                Bekräftad
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.eventMeta}>
                          {formatDate(event.startDate)}
                          {event.groupName ? ` · ${event.groupName}` : ""}
                        </Text>
                        <Text style={styles.eventStats}>
                          {event.attendedCount} del
                          {event.lok.durationMinutes
                            ? ` · ${event.lok.durationMinutes} min`
                            : ""}
                          {isConflict ? " · ⚠️ Konflikt" : ""}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() =>
                          router.push({
                            pathname: "/lok-edit-attendance",
                            params: {
                              clubId: clubId ?? "",
                              event: JSON.stringify(event),
                            },
                          } as any)
                        }
                      >
                        <Text style={styles.editBtnText}>Redigera</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </>
            )}

            {/* ── Confirm period button ── */}
            {filteredEvents.length > 0 && (
              <TouchableOpacity
                style={[styles.confirmBtn, confirming && styles.btnDisabled]}
                onPress={handleConfirmPeriod}
                disabled={confirming}
              >
                {confirming ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-done-outline"
                      size={20}
                      color="#fff"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.confirmBtnText}>
                      {isConfirmed || isStale
                        ? `Bekräfta igen – ${periodLabel(selectedPeriod)}`
                        : `Bekräfta period – ${periodLabel(selectedPeriod)}`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════
            RAPPORTER TAB
           ══════════════════════════════════════════════════════ */}
        {activeTab === "reports" && (
          <>
            {loadingReports ? (
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
                <Text style={styles.emptyHint}>
                  Bekräfta en period på fliken Aktiviteter för att skapa en
                  rapport.
                </Text>
              </View>
            ) : (
              reports.map((report) => {
                const isExpanded = expandedReportId === report.id;
                return (
                  <View key={report.id} style={styles.reportCard}>
                    <TouchableOpacity
                      style={styles.reportRow}
                      onPress={() => handleExpand(report.id)}
                    >
                      <View style={styles.reportInfo}>
                        <Text style={styles.reportPeriod}>
                          {periodLabel(report.period)}
                        </Text>
                        <Text style={styles.reportMeta}>
                          {report.totalActivities} akt ·{" "}
                          {report.totalParticipants} del
                        </Text>
                        {report.status === "stale" && (
                          <Text style={styles.staleHint}>
                            En aktivitet ändrades — bekräfta igen
                          </Text>
                        )}
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
                            <View style={styles.statsRow}>
                              {[
                                {
                                  value: reportDetail.totalParticipants,
                                  label: "Deltagare",
                                },
                                {
                                  value: reportDetail.totalLeaders,
                                  label: "Ledare",
                                },
                                {
                                  value: reportDetail.activities?.length ?? 0,
                                  label: "Aktiviteter",
                                },
                              ].map((s) => (
                                <View key={s.label} style={styles.statItem}>
                                  <Text style={styles.statValue}>
                                    {s.value}
                                  </Text>
                                  <Text style={styles.statLabel}>
                                    {s.label}
                                  </Text>
                                </View>
                              ))}
                            </View>

                            {reportDetail.conflicts?.length > 0 && (
                              <View style={styles.conflictsSection}>
                                <Text style={styles.conflictsSectionTitle}>
                                  Konflikter ({reportDetail.conflicts.length})
                                </Text>
                                {Platform.OS === "web" ? (
                                  <View style={styles.conflictTable}>
                                    <View style={styles.conflictTableHeader}>
                                      {[
                                        "Typ",
                                        "Berörda",
                                        "Status",
                                        "Åtgärd",
                                      ].map((h, i) => (
                                        <Text
                                          key={h}
                                          style={[
                                            styles.conflictTableCell,
                                            styles.conflictTableHeaderText,
                                            { flex: [2, 1, 2, 3][i] },
                                          ]}
                                        >
                                          {h}
                                        </Text>
                                      ))}
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
                                              c.resolved && {
                                                color: "#4CAF50",
                                              },
                                            ]}
                                          >
                                            {c.resolved
                                              ? `Löst: ${c.resolution}`
                                              : "Olöst"}
                                          </Text>
                                          {!c.resolved &&
                                          ["draft", "stale"].includes(
                                            report.status,
                                          ) ? (
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
                                                  <Text
                                                    style={styles.tableBtnText}
                                                  >
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
                                  reportDetail.conflicts.map(
                                    (c: any, idx: number) => (
                                      <ConflictRow
                                        key={idx}
                                        conflict={c}
                                        index={idx}
                                        onResolve={(i, res) =>
                                          ["draft", "stale"].includes(
                                            report.status,
                                          )
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

                            {["draft", "stale"].includes(report.status) && (
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
          </>
        )}
      </ScrollView>

      {/* ── Modals ── */}
      <ExportModal
        visible={exportModalVisible}
        clubId={clubId ?? ""}
        reports={reports}
        onClose={() => setExportModalVisible(false)}
      />

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

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.primary,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  tabBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.secondary,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  tabLabelActive: { color: theme.colors.secondary, fontWeight: "700" },
  tabWarningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.warning,
    marginLeft: 6,
  },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48 },

  periodScroll: { marginBottom: 10 },
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

  groupScroll: { marginBottom: 10 },
  groupChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 8,
    backgroundColor: theme.colors.background,
  },
  groupChipActive: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  groupChipText: { fontSize: 12, color: theme.colors.textSecondary },
  groupChipTextActive: { color: "#fff", fontWeight: "600" },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text },

  staleBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: theme.colors.warningBackground,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  staleBannerText: { flex: 1, fontSize: 13, color: theme.colors.warning },

  eventsCount: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },

  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  eventCardLeft: { marginRight: 8 },
  eventCardBody: { flex: 1 },
  eventCardRow: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  eventTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
  },
  eventMeta: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  eventStats: { fontSize: 12, color: theme.colors.textSecondary },
  confirmedBadge: {
    backgroundColor: "#4CAF5022",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  confirmedBadgeText: { fontSize: 10, color: "#4CAF50", fontWeight: "600" },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.secondary + "22",
    marginLeft: 8,
  },
  editBtnText: {
    fontSize: 12,
    color: theme.colors.secondary,
    fontWeight: "600",
  },

  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.secondary,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
  },
  confirmBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  emptyState: { alignItems: "center", paddingVertical: 48 },
  emptyText: {
    marginTop: 12,
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  emptyHint: {
    marginTop: 6,
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 24,
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
  reportRow: { flexDirection: "row", alignItems: "center", padding: 16 },
  reportInfo: { flex: 1 },
  reportPeriod: { fontSize: 15, fontWeight: "600", color: theme.colors.text },
  reportMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  staleHint: { fontSize: 11, color: theme.colors.warning, marginTop: 2 },
  reportRight: { flexDirection: "row", alignItems: "center" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
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
  statValue: { fontSize: 22, fontWeight: "700", color: theme.colors.primary },
  statLabel: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },

  conflictsSection: { marginBottom: 16 },
  conflictsSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 8,
  },
  conflictRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 8,
    overflow: "hidden",
  },
  conflictResolved: { backgroundColor: "#F1F8F1" },
  conflictResolvedText: { fontSize: 13, color: "#4CAF50", padding: 12 },
  conflictHeader: { flexDirection: "row", alignItems: "center", padding: 12 },
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
  conflictTableCell: { padding: 10, fontSize: 13, color: theme.colors.text },
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

  actionRow: { flexDirection: "row", gap: 10, marginTop: 8 },
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

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: theme.colors.primary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.colors.text,
    flex: 1,
    marginRight: 12,
  },
  modalSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  modalAttendedCount: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: "600",
    marginBottom: 12,
  },
  modalList: { flex: 1, marginBottom: 12 },
  attendeeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  attendeeCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  attendeeCheckboxActive: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  attendeeName: { fontSize: 14, color: theme.colors.text, fontWeight: "500" },
  attendeeRole: { fontSize: 12, color: theme.colors.textSecondary },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.secondary,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  errorText: {
    fontSize: 13,
    color: theme.colors.error,
    marginTop: 8,
    textAlign: "center",
  },

  exportModalLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  sectionDesc: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  exportReportRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 6,
  },
  exportReportRowActive: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  exportReportLabel: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: "500",
  },
  exportFormatRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
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

  btnDisabled: { opacity: 0.6 },
});
