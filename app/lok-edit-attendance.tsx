// LOK-stöd Edit Attendance Screen
// Full-screen view for reviewing and adjusting attendance on a single eligible event.
// Shows event metadata, live LOK-eligibility criteria panel, and grouped attendee lists.

import { theme } from "@/constants/theme";
import {
  type LokEligibleEvent,
  reEditAttendance,
} from "@/services/lok/rfService";
import { LOK_RULES } from "@/services/lok/lokValidationService";
import { useAuth } from "@/contexts/AuthContext";
import Ionicons from "@react-native-vector-icons/ionicons/static";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── Helpers ──────────────────────────────────────────────────

function formatDateTime(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return d.toLocaleDateString("sv-SE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

function eventTypeLabel(type: string): string {
  if (type === "match") return "Match";
  if (type === "camp") return "Läger";
  if (type === "course") return "Kurs";
  return "Träning";
}

// ─── Eligibility criterion row ─────────────────────────────────

function CriterionRow({
  label,
  detail,
  met,
}: {
  label: string;
  detail: string;
  met: boolean;
}) {
  return (
    <View style={styles.criterionRow}>
      <Ionicons
        name={met ? "checkmark-circle" : "close-circle"}
        size={18}
        color={met ? "#4CAF50" : theme.colors.error}
        style={{ marginRight: 10 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.criterionLabel}>{label}</Text>
        <Text style={[styles.criterionDetail, { color: met ? "#4CAF50" : theme.colors.error }]}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

// ─── Attendee row ──────────────────────────────────────────────

function AttendeeRow({
  name,
  attended,
  onToggle,
}: {
  name: string;
  attended: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity style={styles.attendeeRow} onPress={onToggle} activeOpacity={0.7}>
      <View style={[styles.checkbox, attended && styles.checkboxActive]}>
        {attended && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
      <Text style={[styles.attendeeName, !attended && styles.attendeeNameInactive]}>
        {name}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ───────────────────────────────────────────────

export default function LokEditAttendanceScreen() {
  const params = useLocalSearchParams<{ event: string; clubId: string }>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Parse event from serialised route param
  const event: LokEligibleEvent | null = React.useMemo(() => {
    try {
      return params.event ? JSON.parse(params.event) : null;
    } catch {
      return null;
    }
  }, [params.event]);

  const clubId = params.clubId ?? "";

  type AttendanceRecord = {
    userId: string;
    userName: string;
    attended: boolean;
    lokRole: "participant" | "leader";
  };

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Populate records from event responses
  useEffect(() => {
    if (event) {
      setRecords(
        event.responses.map((r) => ({
          userId: r.userId,
          userName: r.userName,
          attended: r.actualAttendance,
          lokRole: r.lokRole,
        })),
      );
    }
  }, [event]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: event?.title ?? "Redigera närvaro" });
  }, [navigation, event?.title]);

  // ── Derived counts ─────────────────────────────────────────

  const leaders = records.filter((r) => r.lokRole === "leader");
  const participants = records.filter((r) => r.lokRole === "participant");
  const attendedLeaders = leaders.filter((r) => r.attended).length;
  const attendedParticipants = participants.filter((r) => r.attended).length;
  const durationMinutes = event?.lok.durationMinutes ?? 0;

  const meetsDuration = durationMinutes >= LOK_RULES.MIN_DURATION_MINUTES;
  const meetsParticipants = attendedParticipants >= LOK_RULES.MIN_PARTICIPANTS;
  const meetsLeaders = attendedLeaders >= LOK_RULES.MIN_LEADERS;
  const isEligible = meetsDuration && meetsParticipants && meetsLeaders;

  // ── Toggle ─────────────────────────────────────────────────

  const toggle = (userId: string) => {
    setRecords((prev) =>
      prev.map((r) => (r.userId === userId ? { ...r, attended: !r.attended } : r)),
    );
  };

  // ── Save ───────────────────────────────────────────────────

  const handleSave = async () => {
    if (!event || !user) return;
    setSaving(true);
    setSaveError(null);
    const result = await reEditAttendance(
      event.id,
      clubId,
      records.map((r) => ({ userId: r.userId, attended: r.attended })),
      user.uid,
    );
    setSaving(false);
    if (result.success) {
      router.back();
    } else {
      setSaveError(result.error ?? "Kunde inte spara ändringar.");
    }
  };

  if (!event) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Kunde inte ladda aktivitetsdata.</Text>
      </View>
    );
  }

  const startTime = formatTime(event.startDate);
  const endTime = formatTime(event.endDate);
  const timeRange = startTime && endTime ? `${startTime}–${endTime}` : startTime;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="auto" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Event metadata ── */}
        <View style={styles.metaCard}>
          <Text style={styles.metaDate}>{formatDateTime(event.startDate)}</Text>
          {timeRange ? <Text style={styles.metaTime}>{timeRange}</Text> : null}
          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>{eventTypeLabel(event.eventType)}</Text>
            </View>
            {durationMinutes > 0 && (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>{durationMinutes} min</Text>
              </View>
            )}
            {event.groupName ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>{event.groupName}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── LOK eligibility panel ── */}
        <View style={[styles.eligibilityCard, isEligible ? styles.eligibleBorder : styles.ineligibleBorder]}>
          <View style={styles.eligibilityHeader}>
            <Ionicons
              name={isEligible ? "shield-checkmark" : "shield-outline"}
              size={20}
              color={isEligible ? "#4CAF50" : theme.colors.error}
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.eligibilityTitle, { color: isEligible ? "#4CAF50" : theme.colors.error }]}>
              {isEligible ? "Berättigad för LOK-stöd" : "Ej berättigad för LOK-stöd"}
            </Text>
          </View>

          <CriterionRow
            label="Aktivitetslängd"
            detail={
              durationMinutes > 0
                ? `${durationMinutes} min (krav: ≥${LOK_RULES.MIN_DURATION_MINUTES} min)`
                : "Okänd längd"
            }
            met={meetsDuration}
          />
          <CriterionRow
            label="Deltagare med närvaro"
            detail={`${attendedParticipants} av ${participants.length} (krav: ≥${LOK_RULES.MIN_PARTICIPANTS})`}
            met={meetsParticipants}
          />
          <CriterionRow
            label="Ledare med närvaro"
            detail={`${attendedLeaders} av ${leaders.length} (krav: ≥${LOK_RULES.MIN_LEADERS})`}
            met={meetsLeaders}
          />
        </View>

        {/* ── Leaders section ── */}
        {leaders.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Ledare</Text>
              <Text style={styles.sectionCount}>
                {attendedLeaders} / {leaders.length} närvarande
              </Text>
            </View>
            {leaders.map((r) => (
              <AttendeeRow
                key={r.userId}
                name={r.userName}
                attended={r.attended}
                onToggle={() => toggle(r.userId)}
              />
            ))}
          </View>
        )}

        {/* ── Participants section ── */}
        {participants.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Deltagare</Text>
              <Text style={styles.sectionCount}>
                {attendedParticipants} / {participants.length} närvarande
              </Text>
            </View>
            {participants.map((r) => (
              <AttendeeRow
                key={r.userId}
                name={r.userName}
                attended={r.attended}
                onToggle={() => toggle(r.userId)}
              />
            ))}
          </View>
        )}

        {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── Sticky save button ── */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Spara ändringar</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 15,
    textAlign: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 0,
  },

  // Event meta card
  metaCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  metaDate: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 2,
    textTransform: "capitalize",
  },
  metaTime: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  metaChip: {
    backgroundColor: theme.colors.secondary + "33",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  metaChipText: {
    fontSize: 12,
    color: theme.colors.secondary,
    fontWeight: "500",
  },

  // Eligibility panel
  eligibilityCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
  },
  eligibleBorder: {
    borderLeftColor: "#4CAF50",
  },
  ineligibleBorder: {
    borderLeftColor: theme.colors.error,
  },
  eligibilityHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  eligibilityTitle: {
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  criterionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  criterionLabel: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: "500",
  },
  criterionDetail: {
    fontSize: 12,
    marginTop: 1,
  },

  // Attendee sections
  section: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
  },
  sectionCount: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  attendeeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.border,
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  checkboxActive: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  attendeeName: {
    fontSize: 15,
    color: theme.colors.text,
    flex: 1,
  },
  attendeeNameInactive: {
    color: theme.colors.textSecondary,
  },

  // Save error
  saveError: {
    color: theme.colors.error,
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    marginHorizontal: 16,
  },

  // Footer save button
  footer: {
    backgroundColor: theme.colors.background,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  saveBtn: {
    backgroundColor: theme.colors.secondary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
