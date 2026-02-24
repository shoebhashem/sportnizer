/**
 * MemberContactModal - Display member contact details in a modal
 * Follows profile.tsx UI styling for consistency
 * For youth members, displays guardian contact information
 */

import { getDefaultProfilePicture } from "@/constants/profilePictures";
import { theme } from "@/constants/theme";
import {
    GetMemberContactDetailsResponse,
    GuardianContactDetails,
    MemberContactDetails,
    memberService,
} from "@/services/member";
import { FontAwesome, Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

interface MemberContactModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  clubId: string;
  groupId?: string; // Optional - if not provided, club-level access (club-admin only)
  // Optional: Pre-fill with basic data while loading full details
  initialName?: string;
  initialPhotoURL?: string;
  isYouth?: boolean;
}

export default function MemberContactModal({
  visible,
  onClose,
  userId,
  clubId,
  groupId,
  initialName,
  initialPhotoURL,
  isYouth = false,
}: MemberContactModalProps) {
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<MemberContactDetails | null>(null);
  const [guardians, setGuardians] = useState<GuardianContactDetails[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && userId) {
      loadMemberDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, userId, clubId, groupId]);

  const loadMemberDetails = async () => {
    setLoading(true);
    setError(null);

    try {
      const result: GetMemberContactDetailsResponse =
        await memberService.getMemberContactDetails(userId, clubId, groupId);

      if (result.success) {
        setMember(result.member);
        setGuardians(result.guardians || []);
      } else {
        setError(result.error || "Failed to load member details");
      }
    } catch (err: any) {
      console.error("Error loading member details:", err);
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const formatDateOfBirth = (dateStr: string | null): string => {
    if (!dateStr) return "Not available";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "Not available";
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return "Not available";
    }
  };

  const getInitials = (name: string): string => {
    return name
      .split(" ")
      .map((n) => n.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const renderFieldRow = (
    icon: React.ReactNode,
    label: string,
    value: string | null,
  ) => (
    <View style={styles.fieldRow}>
      <View style={styles.fieldIconContainer}>{icon}</View>
      <View style={styles.fieldContent}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={[styles.fieldValue, !value && styles.fieldEmpty]}>
          {value || "Not available"}
        </Text>
      </View>
    </View>
  );

  const renderGuardianCard = (guardian: GuardianContactDetails) => (
    <View key={guardian.guardianUid} style={styles.guardianCard}>
      <View style={styles.guardianHeader}>
        <Text style={styles.guardianName}>{guardian.displayName}</Text>
        <View style={styles.relationshipBadge}>
          <Text style={styles.relationshipText}>{guardian.relationship}</Text>
        </View>
      </View>

      {renderFieldRow(
        <FontAwesome
          name="envelope"
          size={14}
          color={theme.colors.secondary}
        />,
        "Email",
        guardian.email,
      )}

      {renderFieldRow(
        <FontAwesome name="phone" size={16} color={theme.colors.secondary} />,
        "Phone",
        guardian.phoneNumber,
      )}
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Contact Details</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.white} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator
                  size="large"
                  color={theme.colors.secondary}
                />
                <Text style={styles.loadingText}>Loading details...</Text>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <Ionicons
                  name="alert-circle-outline"
                  size={48}
                  color={theme.colors.error}
                />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : member ? (
              <>
                {/* Avatar Section */}
                <View style={styles.avatarSection}>
                  {member.photoURL ||
                  initialPhotoURL ||
                  getDefaultProfilePicture(member.isYouth) ? (
                    <Image
                      source={{
                        uri:
                          member.photoURL ||
                          initialPhotoURL ||
                          getDefaultProfilePicture(member.isYouth),
                      }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarInitials}>
                        {getInitials(member.displayName || initialName || "?")}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.memberName}>
                    {member.displayName || initialName}
                  </Text>
                  {member.isYouth && (
                    <View style={styles.youthBadge}>
                      <Text style={styles.youthBadgeText}>Youth Player</Text>
                    </View>
                  )}
                </View>

                {/* Member Info Section */}
                <View style={styles.infoSection}>
                  {/* Email - only show for non-youth or if available */}
                  {!member.isYouth &&
                    renderFieldRow(
                      <FontAwesome
                        name="envelope"
                        size={14}
                        color={theme.colors.secondary}
                      />,
                      "Email",
                      member.email,
                    )}

                  {/* Phone - only show for non-youth */}
                  {!member.isYouth &&
                    renderFieldRow(
                      <FontAwesome
                        name="phone"
                        size={16}
                        color={theme.colors.secondary}
                      />,
                      "Phone",
                      member.phoneNumber,
                    )}

                  {/* Date of Birth */}
                  {renderFieldRow(
                    <FontAwesome
                      name="birthday-cake"
                      size={14}
                      color={theme.colors.secondary}
                    />,
                    "Date of Birth",
                    formatDateOfBirth(member.dateOfBirth),
                  )}
                </View>

                {/* Guardian Section - Only for youth */}
                {member.isYouth && guardians.length > 0 && (
                  <View style={styles.guardiansSection}>
                    <Text style={styles.sectionTitle}>Guardian Contacts</Text>
                    {guardians.map((guardian) => renderGuardianCard(guardian))}
                  </View>
                )}

                {/* No guardians message */}
                {member.isYouth && guardians.length === 0 && (
                  <View style={styles.noGuardiansContainer}>
                    <Ionicons
                      name="people-outline"
                      size={40}
                      color={theme.colors.textSecondary}
                    />
                    <Text style={styles.noGuardiansText}>
                      No guardian information available
                    </Text>
                  </View>
                )}
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: theme.colors.primary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    minHeight: "50%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.text,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  errorContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  errorText: {
    marginTop: 12,
    color: theme.colors.error,
    fontSize: 14,
    textAlign: "center",
  },
  // Avatar Section
  avatarSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: theme.colors.secondary,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.secondary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: theme.colors.inputBorder,
  },
  avatarInitials: {
    color: theme.colors.primary,
    fontSize: 28,
    fontWeight: "bold",
  },
  memberName: {
    fontSize: 20,
    fontWeight: "600",
    color: theme.colors.text,
    marginTop: 12,
  },
  youthBadge: {
    marginTop: 8,
    backgroundColor: theme.colors.badge.child,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  youthBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.white,
  },
  // Info Section - matches profile.tsx styling
  infoSection: {
    marginBottom: 24,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    overflow: "hidden",
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  fieldIconContainer: {
    width: 28,
    alignItems: "center",
  },
  fieldContent: {
    flex: 1,
    marginLeft: 12,
  },
  fieldLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldValue: {
    fontSize: 16,
    color: theme.colors.text,
  },
  fieldEmpty: {
    color: theme.colors.textSecondary,
    fontStyle: "italic",
  },
  // Guardians Section
  guardiansSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  guardianCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    marginBottom: 12,
    overflow: "hidden",
  },
  guardianHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: theme.colors.inputBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  guardianName: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
    flex: 1,
  },
  relationshipBadge: {
    backgroundColor: theme.colors.secondary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  relationshipText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  noGuardiansContainer: {
    alignItems: "center",
    paddingVertical: 30,
  },
  noGuardiansText: {
    marginTop: 12,
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
});
