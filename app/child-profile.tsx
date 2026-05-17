// /app/child-profile.tsx — Guardian view of a dependent's profile
// Accessible via "Mina barn" list in the parent's profile screen.
// Allows guardian to: view child details, manage their personnummer,
// and see their club/group memberships.

import { FontAwesome, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { doc, getDoc } from "firebase/firestore";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import PersonnummerModal from "../components/PersonnummerModal";
import { theme } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";
import { db as firestoreDb } from "../services/core/firebase";
import {
  getPersonnummerDisplayText,
  getPersonnummerStatusForDependent,
  PersonnummerStatus,
} from "../services/lok/personnummerService";

export default function ChildProfileScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { userId, childName } = useLocalSearchParams<{
    userId: string;
    childName: string;
  }>();

  const [childProfile, setChildProfile] = useState<any>(null);
  const [personnummerStatus, setPersonnummerStatus] =
    useState<PersonnummerStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPersonnummerModal, setShowPersonnummerModal] = useState(false);

  const decodedChildName = childName
    ? decodeURIComponent(childName as string)
    : "";

  useEffect(() => {
    if (!userId) return;

    const loadData = async () => {
      try {
        const [profileSnap, pStatus] = await Promise.all([
          getDoc(doc(firestoreDb, "users", userId as string)),
          getPersonnummerStatusForDependent(userId as string),
        ]);

        if (profileSnap.exists()) {
          setChildProfile(profileSnap.data());
        }
        setPersonnummerStatus(pStatus);
      } catch (err) {
        console.error("Error loading child profile:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [userId]);

  const refreshPersonnummerStatus = async () => {
    if (!userId) return;
    try {
      const status = await getPersonnummerStatusForDependent(userId as string);
      setPersonnummerStatus(status);
    } catch (_) {}
  };

  const getInitials = (name: string) =>
    name?.charAt(0)?.toUpperCase() || "?";

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color={theme.colors.secondary} />
      </View>
    );
  }

  const clubAccess: any[] = childProfile?.clubAccess || [];
  const groups: { clubName: string; groupName: string; roles: string[] }[] = [];
  for (const ca of clubAccess) {
    for (const ga of ca.groupAccess || []) {
      groups.push({
        clubName: ca.clubName,
        groupName: ga.groupName,
        roles: ga.roles,
      });
    }
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Avatar ---- */}
        <View style={styles.avatarSection}>
          {childProfile?.photoURL ? (
            <Image
              source={{ uri: childProfile.photoURL }}
              style={styles.avatarImage}
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>
                {getInitials(decodedChildName || childProfile?.displayName || "")}
              </Text>
            </View>
          )}
          <Text style={styles.avatarName}>
            {childProfile?.displayName || decodedChildName}
          </Text>
        </View>

        {/* ---- Info ---- */}
        <View style={styles.infoSection}>
          <View style={styles.fieldRow}>
            <View style={styles.fieldIconContainer}>
              <FontAwesome name="user" size={16} color={theme.colors.secondary} />
            </View>
            <View style={styles.fieldContent}>
              <Text style={styles.fieldLabel}>{t("screens:profile.name")}</Text>
              <Text style={styles.fieldValue}>
                {childProfile?.displayName || decodedChildName}
              </Text>
            </View>
          </View>

          {childProfile?.dateOfBirth && (
            <View style={styles.fieldRow}>
              <View style={styles.fieldIconContainer}>
                <FontAwesome
                  name="birthday-cake"
                  size={14}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.fieldContent}>
                <Text style={styles.fieldLabel}>
                  {t("screens:profile.dateOfBirth")}
                </Text>
                <Text style={styles.fieldValue}>
                  {new Date(childProfile.dateOfBirth).toLocaleDateString()}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ---- Personnummer (LOK-stöd) ---- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t("screens:profile.personnummer")}
          </Text>
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => setShowPersonnummerModal(true)}
          >
            <View style={styles.actionIcon}>
              <Ionicons
                name="shield-checkmark-outline"
                size={16}
                color={theme.colors.secondary}
              />
            </View>
            <View style={{ flex: 1 }}>
              {personnummerStatus?.hasPersonnummer &&
              personnummerStatus.birthDate ? (
                <Text style={styles.fieldValue}>
                  {getPersonnummerDisplayText(
                    decodedChildName || childProfile?.displayName || "",
                    personnummerStatus.birthDate,
                  )}
                </Text>
              ) : (
                <Text style={[styles.fieldValue, styles.fieldEmpty]}>
                  {t("screens:profile.personnummerMissing")}
                </Text>
              )}
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* ---- Clubs ---- */}
        {clubAccess.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("screens:profile.clubs")}</Text>
            {clubAccess.map((ca: any, i: number) => (
              <View key={i} style={styles.membershipCard}>
                <View style={styles.membershipCardHeader}>
                  <FontAwesome
                    name="shield"
                    size={16}
                    color={theme.colors.secondary}
                  />
                  <Text style={styles.membershipName}>{ca.clubName}</Text>
                </View>
                <View style={styles.rolesRow}>
                  <View style={styles.roleTag}>
                    <Text style={styles.roleTagText}>
                      {ca.role || "member"}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ---- Groups ---- */}
        {groups.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t("screens:profile.groups")}
            </Text>
            {groups.map((g, i) => (
              <View key={i} style={styles.membershipCard}>
                <View style={styles.membershipCardHeader}>
                  <FontAwesome
                    name="users"
                    size={14}
                    color={theme.colors.secondary}
                  />
                  <Text style={styles.membershipName}>{g.groupName}</Text>
                  <Text style={styles.clubNameSubtext}>{g.clubName}</Text>
                </View>
                <View style={styles.rolesRow}>
                  {g.roles?.map((role, ri) => (
                    <View key={ri} style={styles.roleTag}>
                      <Text style={styles.roleTagText}>{role}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Personnummer Modal */}
      <PersonnummerModal
        visible={showPersonnummerModal}
        onClose={() => {
          setShowPersonnummerModal(false);
          refreshPersonnummerStatus();
        }}
        mode="child"
        targetUserId={userId as string}
        childName={decodedChildName}
        userName={decodedChildName || childProfile?.displayName || ""}
      />
    </View>
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
    backgroundColor: theme.colors.primary,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  avatarSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: 10,
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: `${theme.colors.secondary}20`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  avatarInitials: {
    fontSize: 32,
    fontWeight: "700",
    color: theme.colors.secondary,
  },
  avatarName: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text,
  },
  infoSection: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.medium,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  section: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.medium,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 0,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  fieldIconContainer: {
    width: 32,
    alignItems: "center",
    marginRight: 12,
  },
  fieldContent: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 15,
    color: theme.colors.text,
    fontWeight: "400",
  },
  fieldEmpty: {
    color: theme.colors.textSecondary,
    fontStyle: "italic",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  actionIcon: {
    width: 32,
    alignItems: "center",
    marginRight: 12,
  },
  membershipCard: {
    padding: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  membershipCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  membershipName: {
    fontSize: 15,
    fontWeight: "500",
    color: theme.colors.text,
    flex: 1,
  },
  clubNameSubtext: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  rolesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginLeft: 24,
  },
  roleTag: {
    backgroundColor: `${theme.colors.secondary}15`,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  roleTagText: {
    fontSize: 12,
    color: theme.colors.secondary,
    fontWeight: "500",
    textTransform: "capitalize",
  },
});
