import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import { theme } from "@/constants/theme";
import { useClubData } from "@/contexts/ClubDataContext";
import { useUser } from "@/contexts/UserContext";
import { db } from "@/services/core/firebase";
import {
    resolveClubPermissions
} from "@/services/types/clubPermissions";
import { isClubAdmin as checkClubAdmin } from "@/utils/permissionHelpers";
import Ionicons from "@react-native-vector-icons/ionicons/static";
import { useLocalSearchParams } from "expo-router";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PermissionRowProps {
  title: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  /** When true the switch is locked on and the row shows an "always on" label */
  locked?: boolean;
}

// ---------------------------------------------------------------------------
// Sub-component: PermissionRow
// ---------------------------------------------------------------------------

function PermissionRow({
  title,
  description,
  value,
  onChange,
  locked,
}: PermissionRowProps) {
  return (
    <View style={styles.permissionRow}>
      <View style={styles.permissionRowContent}>
        <View style={styles.permissionRowTitleRow}>
          <Text style={styles.permissionRowTitle}>{title}</Text>
          {locked && (
            <View style={styles.lockedBadge}>
              <Ionicons
                name="lock-closed"
                size={10}
                color={theme.colors.textSecondary}
                style={{ marginRight: 3 }}
              />
              <Text style={styles.lockedBadgeText}>Always on</Text>
            </View>
          )}
        </View>
        <Text style={styles.permissionRowDesc}>{description}</Text>
      </View>
      <Switch
        value={locked ? true : value}
        onValueChange={locked ? undefined : onChange}
        disabled={locked}
        trackColor={{
          false: theme.colors.border,
          true: locked ? theme.colors.textSecondary : theme.colors.secondary,
        }}
        thumbColor="#fff"
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: SectionLabel
// ---------------------------------------------------------------------------

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

// ---------------------------------------------------------------------------
// Sub-component: ComingSoonSection
// ---------------------------------------------------------------------------

function ComingSoonSection({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={styles.comingSoonCard}>
      <View style={styles.comingSoonIcon}>
        <Ionicons
          name={icon as any}
          size={22}
          color={theme.colors.textSecondary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.comingSoonTitle}>{title}</Text>
        <Text style={styles.comingSoonDesc}>
          Role-based visibility settings for this area are coming soon.
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function RolePermissionsScreen() {
  const insets = useSafeAreaInsets();
  const { clubId } = useLocalSearchParams();
  const { firebaseUser, userProfile } = useUser();
  const { getClubPermissions } = useClubData();

  const isClubAdmin =
    typeof clubId === "string" &&
    !!userProfile &&
    checkClubAdmin(userProfile, clubId);

  // ---- Resolve stored permissions ----
  const resolvedPermissions =
    typeof clubId === "string"
      ? getClubPermissions(clubId)
      : resolveClubPermissions(null);

  // ---- Events visibility state ----
  const [eventsClubAdmin, setEventsClubAdmin] = useState(
    resolvedPermissions.events.visibility.clubAdmin,
  );
  const [eventsGroupAdmin, setEventsGroupAdmin] = useState(
    resolvedPermissions.events.visibility.groupAdmin,
  );
  const [eventsCoach, setEventsCoach] = useState(
    resolvedPermissions.events.visibility.coach,
  );

  // ---- News visibility state (future) ----
  const [newsClubAdmin, setNewsClubAdmin] = useState(
    resolvedPermissions.news.visibility.clubAdmin,
  );
  const [newsGroupAdmin, setNewsGroupAdmin] = useState(
    resolvedPermissions.news.visibility.groupAdmin,
  );
  const [newsCoach, setNewsCoach] = useState(
    resolvedPermissions.news.visibility.coach,
  );

  // ---- Saving / feedback ----
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Sync when context loads fresh data
  useEffect(() => {
    if (typeof clubId !== "string") return;
    const p = getClubPermissions(clubId);
    setEventsClubAdmin(p.events.visibility.clubAdmin);
    setEventsGroupAdmin(p.events.visibility.groupAdmin);
    setEventsCoach(p.events.visibility.coach);
    setNewsClubAdmin(p.news.visibility.clubAdmin);
    setNewsGroupAdmin(p.news.visibility.groupAdmin);
    setNewsCoach(p.news.visibility.coach);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, getClubPermissions]);

  const handleSave = async () => {
    if (typeof clubId !== "string" || !firebaseUser?.uid) return;
    setIsSaving(true);
    try {
      await setDoc(
        doc(db, "clubs", clubId, "settings", "permissions"),
        {
          events: {
            visibility: {
              clubAdmin: eventsClubAdmin,
              groupAdmin: eventsGroupAdmin,
              coach: eventsCoach,
            },
          },
          news: {
            visibility: {
              clubAdmin: newsClubAdmin,
              groupAdmin: newsGroupAdmin,
              coach: newsCoach,
            },
          },
          updatedAt: serverTimestamp(),
          updatedBy: firebaseUser.uid,
        },
        { merge: true },
      );
      setShowSuccess(true);
    } catch (err: any) {
      console.error("Failed to save permissions:", err);
      setErrorMessage(
        err?.message ?? "Failed to save permissions. Please try again.",
      );
      setShowError(true);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isClubAdmin) {
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <Text style={styles.accessDenied}>
          Only club admins can manage role permissions.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Intro ── */}
        <View style={styles.introCard}>
          <Ionicons
            name="eye-outline"
            size={20}
            color={theme.colors.secondary}
            style={{ marginRight: theme.spacing.sm }}
          />
          <Text style={styles.introText}>
            Control which roles can see all content in each area beyond their
            own personal invitations.
          </Text>
        </View>

        {/* ════════════════════════════════════════════════════════
            Events
        ════════════════════════════════════════════════════════ */}
        <View style={styles.domainCard}>
          <View style={styles.domainHeader}>
            <Ionicons
              name="calendar-outline"
              size={20}
              color={theme.colors.secondary}
            />
            <Text style={styles.domainTitle}>Events</Text>
          </View>

          <SectionLabel label="Who can see all events in a group?" />

          <PermissionRow
            title="Club Admins"
            description="See all events across every group in the club"
            value={eventsClubAdmin}
            onChange={setEventsClubAdmin}
          />
          <PermissionRow
            title="Group Admins"
            description="See all events in groups they administer"
            value={eventsGroupAdmin}
            onChange={setEventsGroupAdmin}
          />
          <PermissionRow
            title="Coaches"
            description="See all events in groups they coach"
            value={eventsCoach}
            onChange={setEventsCoach}
          />
        </View>

        {/* ════════════════════════════════════════════════════════
            News  (placeholder — coming soon)
        ════════════════════════════════════════════════════════ */}
        <View style={styles.domainCard}>
          <View style={styles.domainHeader}>
            <Ionicons
              name="newspaper-outline"
              size={20}
              color={theme.colors.secondary}
            />
            <Text style={styles.domainTitle}>News</Text>
          </View>

          <SectionLabel label="Who can see all news posts in a group?" />

          <PermissionRow
            title="Club Admins"
            description="See all news posts across every group in the club"
            value={newsClubAdmin}
            onChange={setNewsClubAdmin}
          />
          <PermissionRow
            title="Group Admins"
            description="See all news posts in groups they administer"
            value={newsGroupAdmin}
            onChange={setNewsGroupAdmin}
          />
          <PermissionRow
            title="Coaches"
            description="See all news posts in groups they coach"
            value={newsCoach}
            onChange={setNewsCoach}
          />
        </View>

        {/* ════════════════════════════════════════════════════════
            Members — coming soon
        ════════════════════════════════════════════════════════ */}
        <View style={styles.domainCard}>
          <View style={styles.domainHeader}>
            <Ionicons
              name="people-outline"
              size={20}
              color={theme.colors.secondary}
            />
            <Text style={styles.domainTitle}>Members</Text>
          </View>
          <ComingSoonSection
            title="Member visibility"
            icon="person-circle-outline"
          />
        </View>

        {/* ════════════════════════════════════════════════════════
            Fees — coming soon
        ════════════════════════════════════════════════════════ */}
        <View style={styles.domainCard}>
          <View style={styles.domainHeader}>
            <Ionicons
              name="cash-outline"
              size={20}
              color={theme.colors.secondary}
            />
            <Text style={styles.domainTitle}>Fees</Text>
          </View>
          <ComingSoonSection title="Fee visibility" icon="card-outline" />
        </View>

        {/* ════════════════════════════════════════════════════════
            Save button
        ════════════════════════════════════════════════════════ */}
        <View style={styles.saveContainer}>
          {isSaving ? (
            <ActivityIndicator color={theme.colors.secondary} />
          ) : (
            <Button
              label="Save Permissions"
              onPress={handleSave}
              theme="secondary"
            />
          )}
        </View>
      </ScrollView>

      <ConfirmationModal
        visible={showSuccess}
        title="Saved"
        message="Role permissions have been updated successfully."
        confirmText="OK"
        onConfirm={() => setShowSuccess(false)}
        onCancel={() => setShowSuccess(false)}
        confirmButtonTheme="primary"
      />

      <ConfirmationModal
        visible={showError}
        title="Error"
        message={errorMessage}
        confirmText="OK"
        onConfirm={() => setShowError(false)}
        onCancel={() => setShowError(false)}
        confirmButtonTheme="primary"
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.layout.containerPadding,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  accessDenied: {
    margin: theme.spacing.xl,
    textAlign: "center",
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.medium,
  },

  // Intro banner
  introCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: theme.colors.secondary + "12",
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
  },
  introText: {
    flex: 1,
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },

  // Domain card
  domainCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  domainHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
    backgroundColor: theme.colors.primary,
  },
  domainTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semiBold,
    color: theme.colors.text,
  },

  // Section label (sub-heading inside a card)
  sectionLabel: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.semiBold,
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: 2,
  },

  // Permission row
  permissionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
  },
  permissionRowContent: {
    flex: 1,
  },
  permissionRowTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  permissionRowTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  permissionRowDesc: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  lockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  lockedBadgeText: {
    fontSize: 10,
    color: theme.colors.textSecondary,
  },

  // Coming soon
  comingSoonCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  comingSoonIcon: {
    marginTop: 2,
  },
  comingSoonTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
  },
  comingSoonDesc: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },

  // Save
  saveContainer: {
    paddingBottom: theme.spacing.lg,
  },
});
