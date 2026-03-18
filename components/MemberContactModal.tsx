/**
 * MemberContactModal - Display member contact details in a modal
 * Follows profile.tsx UI styling for consistency
 * For youth members, displays guardian contact information
 * Guardians can upload photos for their children and edit their own contact info
 */

import { getDefaultProfilePicture } from "@/constants/profilePictures";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import {
    GetMemberContactDetailsResponse,
    GuardianContactDetails,
    MemberContactDetails,
    memberService,
} from "@/services/member";
import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { httpsCallable } from "firebase/functions";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { functions } from "../services/core/firebase";
import ProfilePictureUpload from "./ProfilePictureUpload";

interface MemberContactModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  clubId: string;
  groupId?: string;
  initialName?: string;
  initialPhotoURL?: string;
  isYouth?: boolean;
  /** True when the current user is the guardian of this member */
  isGuardianViewing?: boolean;
  /** True when the current user is a club-admin or group admin */
  isAdminViewing?: boolean;
  /** True when the member is inactive (soft-deleted, no roles) */
  isInactive?: boolean;
  /** Firestore timestamp — when the member data will be permanently deleted */
  scheduledForDeletion?: any;
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
  isGuardianViewing = false,
  isAdminViewing = false,
  isInactive = false,
  scheduledForDeletion,
}: MemberContactModalProps) {
  const { t } = useTranslation(["components", "common"]);
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<MemberContactDetails | null>(null);
  const [guardians, setGuardians] = useState<GuardianContactDetails[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Photo upload state (for guardians)
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);

  // Guardian contact editing state
  const [editingGuardianContact, setEditingGuardianContact] = useState(false);
  const [editPhone, setEditPhone] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  // Admin editing state — name & DOB for youth members
  const [editingYouthProfile, setEditingYouthProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDob, setEditDob] = useState("");
  const [savingYouthProfile, setSavingYouthProfile] = useState(false);

  // Admin editing guardian phone (for a specific guardian)
  const [editingAdminGuardianUid, setEditingAdminGuardianUid] = useState<
    string | null
  >(null);
  const [adminEditPhone, setAdminEditPhone] = useState("");

  useEffect(() => {
    if (visible && userId) {
      loadMemberDetails();
    } else if (!visible) {
      // Reset editing states when modal closes
      setEditingYouthProfile(false);
      setEditingAdminGuardianUid(null);
      setEditingGuardianContact(false);
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

  const handlePhotoUploadSuccess = (newImageUrl: string) => {
    // Update the member state with the new photo URL
    if (member) {
      setMember({ ...member, photoURL: newImageUrl });
    }
    setShowPhotoUpload(false);
  };

  // Find the current user's guardian entry and start editing
  const startEditingOwnContact = () => {
    const myEntry = guardians.find((g) => g.guardianUid === user?.uid);
    if (myEntry) {
      setEditPhone(myEntry.phoneNumber || "");
      setEditingGuardianContact(true);
    }
  };

  const cancelEditingContact = () => {
    setEditingGuardianContact(false);
    setEditPhone("");
  };

  const saveGuardianContact = async () => {
    if (!user?.uid) return;
    setSavingContact(true);
    try {
      const updateFn = httpsCallable(functions, "updateGuardianContactInfo");
      const result = await updateFn({
        youthUid: userId,
        phoneNumber: editPhone.trim() || null,
      });
      const data = result.data as { success: boolean; error?: string };
      if (data.success) {
        // Update local state
        setGuardians((prev) =>
          prev.map((g) =>
            g.guardianUid === user.uid
              ? { ...g, phoneNumber: editPhone.trim() || null }
              : g,
          ),
        );
        setEditingGuardianContact(false);
      } else {
        setError(data.error || "Failed to update contact info");
      }
    } catch (err: any) {
      console.error("Error saving guardian contact:", err);
      setError(err.message || "Failed to update contact info");
    } finally {
      setSavingContact(false);
    }
  };

  // ── Admin: Youth profile editing (name & DOB) ──────────────────────
  const startEditingYouthProfile = () => {
    setEditName(member?.displayName || initialName || "");
    setEditDob(member?.dateOfBirth || "");
    setEditingYouthProfile(true);
  };

  const cancelEditingYouthProfile = () => {
    setEditingYouthProfile(false);
    setEditName("");
    setEditDob("");
  };

  const saveYouthProfile = async () => {
    if (!editName.trim()) return;
    setSavingYouthProfile(true);
    try {
      const updateFn = httpsCallable(functions, "updateYouthProfile");
      const result = await updateFn({
        youthUid: userId,
        clubId,
        groupId,
        displayName: editName.trim(),
        dateOfBirth: editDob.trim() || undefined,
      });
      const data = result.data as { success: boolean; error?: string };
      if (data.success) {
        // Update local state
        if (member) {
          setMember({
            ...member,
            displayName: editName.trim(),
            dateOfBirth: editDob.trim() || member.dateOfBirth,
          });
        }
        setEditingYouthProfile(false);
      } else {
        setError(data.error || t("components:memberContactModal.updateFailed"));
      }
    } catch (err: any) {
      console.error("Error saving youth profile:", err);
      setError(err.message || t("components:memberContactModal.updateFailed"));
    } finally {
      setSavingYouthProfile(false);
    }
  };

  // ── Admin: Guardian phone editing ──────────────────────────────────
  const startEditingAdminGuardianPhone = (guardian: GuardianContactDetails) => {
    setEditingAdminGuardianUid(guardian.guardianUid);
    setAdminEditPhone(guardian.phoneNumber || "");
  };

  const cancelEditingAdminGuardianPhone = () => {
    setEditingAdminGuardianUid(null);
    setAdminEditPhone("");
  };

  const saveAdminGuardianPhone = async () => {
    if (!editingAdminGuardianUid) return;
    setSavingContact(true);
    try {
      const updateFn = httpsCallable(functions, "updateGuardianContactInfo");
      const result = await updateFn({
        youthUid: userId,
        guardianUid: editingAdminGuardianUid,
        clubId,
        groupId,
        phoneNumber: adminEditPhone.trim() || null,
      });
      const data = result.data as { success: boolean; error?: string };
      if (data.success) {
        setGuardians((prev) =>
          prev.map((g) =>
            g.guardianUid === editingAdminGuardianUid
              ? { ...g, phoneNumber: adminEditPhone.trim() || null }
              : g,
          ),
        );
        setEditingAdminGuardianUid(null);
      } else {
        setError(data.error || t("components:memberContactModal.updateFailed"));
      }
    } catch (err: any) {
      console.error("Error saving admin guardian phone:", err);
      setError(err.message || t("components:memberContactModal.updateFailed"));
    } finally {
      setSavingContact(false);
    }
  };

  const formatDateOfBirth = (dateStr: string | null): string => {
    if (!dateStr) return t("components:memberContactModal.notAvailable");
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime()))
        return t("components:memberContactModal.notAvailable");
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return t("components:memberContactModal.notAvailable");
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
          {value || t("components:memberContactModal.notAvailable")}
        </Text>
      </View>
    </View>
  );

  const renderGuardianCard = (guardian: GuardianContactDetails) => {
    const isOwnEntry = isGuardianViewing && guardian.guardianUid === user?.uid;
    const isAdminEditingThis = editingAdminGuardianUid === guardian.guardianUid;

    // If editing own contact info (guardian self-edit), show editable fields
    if (isOwnEntry && editingGuardianContact) {
      return (
        <View key={guardian.guardianUid} style={styles.guardianCard}>
          <View style={styles.guardianHeader}>
            <Text style={styles.guardianName}>{guardian.displayName}</Text>
            <View style={styles.relationshipBadge}>
              <Text style={styles.relationshipText}>
                {guardian.relationship}
              </Text>
            </View>
          </View>

          <View style={styles.editFieldContainer}>
            <Text style={styles.editFieldLabel}>Phone</Text>
            <TextInput
              style={styles.editFieldInput}
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="Phone number"
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.editButtonRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={cancelEditingContact}
              disabled={savingContact}
            >
              <Text style={styles.cancelButtonText}>{t("common:cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={saveGuardianContact}
              disabled={savingContact}
            >
              {savingContact ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Text style={styles.saveButtonText}>{t("common:save")}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // Admin editing a guardian's phone
    if (isAdminViewing && isAdminEditingThis) {
      return (
        <View key={guardian.guardianUid} style={styles.guardianCard}>
          <View style={styles.guardianHeader}>
            <Text style={styles.guardianName}>{guardian.displayName}</Text>
            <View style={styles.relationshipBadge}>
              <Text style={styles.relationshipText}>
                {guardian.relationship}
              </Text>
            </View>
          </View>

          <View style={styles.editFieldContainer}>
            <Text style={styles.editFieldLabel}>
              {t("components:memberContactModal.phone")}
            </Text>
            <TextInput
              style={styles.editFieldInput}
              value={adminEditPhone}
              onChangeText={setAdminEditPhone}
              placeholder={t("components:memberContactModal.phone")}
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.editButtonRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={cancelEditingAdminGuardianPhone}
              disabled={savingContact}
            >
              <Text style={styles.cancelButtonText}>{t("common:cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={saveAdminGuardianPhone}
              disabled={savingContact}
            >
              {savingContact ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Text style={styles.saveButtonText}>{t("common:save")}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View key={guardian.guardianUid} style={styles.guardianCard}>
        <View style={styles.guardianHeader}>
          <Text style={styles.guardianName}>{guardian.displayName}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={styles.relationshipBadge}>
              <Text style={styles.relationshipText}>
                {guardian.relationship}
              </Text>
            </View>
            {/* Guardian self-edit pencil */}
            {isOwnEntry && (
              <TouchableOpacity onPress={startEditingOwnContact}>
                <Ionicons
                  name="pencil"
                  size={18}
                  color={theme.colors.secondary}
                />
              </TouchableOpacity>
            )}
            {/* Admin edit pencil (for any guardian) */}
            {isAdminViewing && !isOwnEntry && (
              <TouchableOpacity
                onPress={() => startEditingAdminGuardianPhone(guardian)}
              >
                <Ionicons
                  name="pencil"
                  size={18}
                  color={theme.colors.secondary}
                />
              </TouchableOpacity>
            )}
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
  };

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
            <Text style={styles.headerTitle}>
              {t("components:memberContactModal.contactDetails")}
            </Text>
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
                <Text style={styles.loadingText}>
                  {t("components:memberContactModal.loadingDetails")}
                </Text>
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
                  <View>
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
                          {getInitials(
                            member.displayName || initialName || "?",
                          )}
                        </Text>
                      </View>
                    )}
                    {/* Camera icon overlay for guardians and admins */}
                    {(isGuardianViewing || isAdminViewing) && (
                      <TouchableOpacity
                        style={styles.cameraOverlay}
                        onPress={() => setShowPhotoUpload(true)}
                      >
                        <Ionicons
                          name="camera"
                          size={16}
                          color={theme.colors.white}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.memberName}>
                    {member.displayName || initialName}
                  </Text>
                  {member.isYouth && (
                    <View style={styles.youthBadge}>
                      <Text style={styles.youthBadgeText}>
                        {t("components:memberContactModal.youthPlayer")}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Admin Edit Youth Profile Section */}
                {isAdminViewing && member.isYouth && (
                  <View style={styles.adminEditSection}>
                    {editingYouthProfile ? (
                      <View>
                        <Text style={styles.adminEditLabel}>
                          {t("components:memberContactModal.editName")}
                        </Text>
                        <TextInput
                          style={styles.editInput}
                          value={editName}
                          onChangeText={setEditName}
                          placeholder={t(
                            "components:memberContactModal.editName",
                          )}
                          placeholderTextColor={theme.colors.textSecondary}
                        />
                        <Text
                          style={[styles.adminEditLabel, { marginTop: 12 }]}
                        >
                          {t("components:memberContactModal.editDateOfBirth")}
                        </Text>
                        <TextInput
                          style={styles.editInput}
                          value={editDob}
                          onChangeText={setEditDob}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={theme.colors.textSecondary}
                        />
                        <View style={styles.editButtonRow}>
                          <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={cancelEditingYouthProfile}
                          >
                            <Text style={styles.cancelButtonText}>
                              {t("common:cancel")}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.saveButton,
                              savingYouthProfile && styles.saveButtonDisabled,
                            ]}
                            onPress={saveYouthProfile}
                            disabled={savingYouthProfile}
                          >
                            {savingYouthProfile ? (
                              <ActivityIndicator
                                size="small"
                                color={theme.colors.white}
                              />
                            ) : (
                              <Text style={styles.saveButtonText}>
                                {t("common:save")}
                              </Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.editProfileButton}
                        onPress={startEditingYouthProfile}
                      >
                        <Ionicons
                          name="pencil"
                          size={16}
                          color={theme.colors.secondary}
                        />
                        <Text style={styles.editProfileButtonText}>
                          {t("components:memberContactModal.editProfile")}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Inactive / Deletion Warning Banner */}
                {isInactive && (
                  <View style={styles.inactiveBanner}>
                    <Ionicons
                      name="warning"
                      size={20}
                      color={theme.colors.error}
                    />
                    <View style={styles.inactiveBannerTextContainer}>
                      <Text style={styles.inactiveBannerTitle}>
                        {t("components:memberContactModal.inactiveMember")}
                      </Text>
                      {scheduledForDeletion && (
                        <Text style={styles.inactiveBannerDate}>
                          {t(
                            "components:memberContactModal.scheduledDeletion",
                            {
                              date: (() => {
                                const d = scheduledForDeletion?.toDate
                                  ? scheduledForDeletion.toDate()
                                  : scheduledForDeletion?.seconds
                                    ? new Date(
                                        scheduledForDeletion.seconds * 1000,
                                      )
                                    : new Date(scheduledForDeletion);
                                return d.toLocaleDateString(undefined, {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                });
                              })(),
                            },
                          )}
                        </Text>
                      )}
                    </View>
                  </View>
                )}

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
                      t("components:memberContactModal.email"),
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
                      t("components:memberContactModal.phone"),
                      member.phoneNumber,
                    )}

                  {/* Date of Birth */}
                  {renderFieldRow(
                    <FontAwesome
                      name="birthday-cake"
                      size={14}
                      color={theme.colors.secondary}
                    />,
                    t("components:memberContactModal.dateOfBirth"),
                    formatDateOfBirth(member.dateOfBirth),
                  )}
                </View>

                {/* Guardian Section - Only for youth */}
                {member.isYouth && guardians.length > 0 && (
                  <View style={styles.guardiansSection}>
                    <Text style={styles.sectionTitle}>
                      {t("components:memberContactModal.guardianContacts")}
                    </Text>
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
                      {t("components:memberContactModal.noGuardianInfo")}
                    </Text>
                  </View>
                )}
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>

      {/* Profile Picture Upload Modal (for guardians and admins) */}
      {(isGuardianViewing || isAdminViewing) && (
        <ProfilePictureUpload
          visible={showPhotoUpload}
          onClose={() => setShowPhotoUpload(false)}
          onSuccess={handlePhotoUploadSuccess}
          currentImageUrl={member?.photoURL || initialPhotoURL}
          targetUserId={userId}
          clubId={clubId}
          groupId={groupId}
          isForMember={true}
        />
      )}
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
  // Camera overlay on avatar for guardians
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: theme.colors.secondary,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  // Edit field styles for guardian contact editing
  editFieldContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  editFieldLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  editFieldInput: {
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  editButtonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 12,
    gap: 10,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  cancelButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  saveButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.secondary,
    minWidth: 70,
    alignItems: "center",
  },
  saveButtonText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  // Admin edit youth profile section
  adminEditSection: {
    marginBottom: 16,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    padding: 16,
  },
  adminEditLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  editInput: {
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  editProfileButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
  },
  editProfileButtonText: {
    color: theme.colors.secondary,
    fontSize: 14,
    fontWeight: "600",
  },
  // Inactive member / deletion warning banner
  inactiveBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: theme.colors.error + "15",
    borderWidth: 1,
    borderColor: theme.colors.error + "40",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  inactiveBannerTextContainer: {
    flex: 1,
  },
  inactiveBannerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.error,
    marginBottom: 4,
  },
  inactiveBannerDate: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
});
