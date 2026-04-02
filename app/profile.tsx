// /app/profile.tsx — User Profile Screen
// View mode: displays avatar, name, email, phone, DOB, clubs, groups, sign-out
// Edit mode: toggle via header ✏️ icon — name, phone, DOB become editable

import { FontAwesome, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import React, { useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ConfirmationModal from "../components/ConfirmationModal";
import DropdownInput from "../components/DropdownInput";
import LegalSettingsSection from "../components/LegalSettingsSection";
import ProfilePictureUpload from "../components/ProfilePictureUpload";
import { getDefaultProfilePicture } from "../constants/profilePictures";
import { theme } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";
import {
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
  useLanguage,
} from "../contexts/LanguageContext";
import { useUser } from "../contexts/UserContext";
import {
  changePassword,
  requestEmailChange,
  signOutUser,
  updateUserProfile,
} from "../services/auth/authService";
import { memberService } from "../services/member";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { userProfile } = useUser();
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation(["screens", "common"]);

  // View / Edit mode
  const [isEditing, setIsEditing] = useState(false);

  // Editable form state
  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");

  // UI state
  const [saving, setSaving] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [currentPhotoURL, setCurrentPhotoURL] = useState("");
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Delete account state
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Security modals state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [newEmailInput, setNewEmailInput] = useState("");
  const [securityLoading, setSecurityLoading] = useState(false);

  // Generic alert modal state (replaces Alert.alert for cross-platform)
  const [alertModal, setAlertModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({ visible: false, title: "", message: "" });

  const showAlert = (title: string, message: string, onConfirm?: () => void) =>
    setAlertModal({ visible: true, title, message, onConfirm });
  const hideAlert = () => {
    alertModal.onConfirm?.();
    setAlertModal({ visible: false, title: "", message: "" });
  };

  // Initialize form state from profile
  const initFormFromProfile = React.useCallback(() => {
    setDisplayName(userProfile?.displayName || "");
    setPhoneNumber(userProfile?.phoneNumber || "");
    setDateOfBirth(
      userProfile?.dateOfBirth
        ? new Date(userProfile.dateOfBirth).toLocaleDateString()
        : "",
    );
  }, [userProfile]);

  // Set currentPhotoURL from profile on mount / profile change
  React.useEffect(() => {
    setCurrentPhotoURL(
      userProfile?.photoURL ||
        user?.photoURL ||
        getDefaultProfilePicture(false),
    );
    initFormFromProfile();
  }, [userProfile, user, initFormFromProfile]);

  // Clubs & groups from profile
  const userClubs = userProfile?.clubAccess || [];
  const userGroups = useMemo(() => {
    if (!userProfile?.clubAccess) return [];
    const groups: {
      clubName: string;
      groupName: string;
      roles: string[];
    }[] = [];
    for (const ca of userProfile.clubAccess) {
      if (ca.groupAccess) {
        for (const ga of ca.groupAccess) {
          groups.push({
            clubName: ca.clubName,
            groupName: ga.groupName,
            roles: ga.roles,
          });
        }
      }
    }
    return groups;
  }, [userProfile?.clubAccess]);

  // Language dropdown options
  const languageOptions = useMemo(
    () =>
      (
        SUPPORTED_LANGUAGES as readonly {
          code: string;
          label: string;
          nativeLabel: string;
          flag: string;
        }[]
      ).map((lang) => ({
        id: lang.code,
        name: `${lang.flag}  ${lang.nativeLabel || lang.label}`,
      })),
    [],
  );

  // Display name helper (same logic as old UserAvatar)
  const getDisplayName = () => {
    if (userProfile?.displayName) return userProfile.displayName;
    if (user?.displayName) {
      if (user.displayName.includes(".") || user.displayName.includes("_")) {
        return user.displayName
          .replace(/[._]/g, " ")
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" ");
      }
      return user.displayName;
    }
    const emailName = user?.email?.split("@")[0] || "User";
    return emailName.charAt(0).toUpperCase() + emailName.slice(1).toLowerCase();
  };

  const getInitials = (email: string) => {
    return email.split("@")[0]?.charAt(0).toUpperCase() || "U";
  };

  // ----- Header icons -----
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        isEditing ? (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity
              onPress={handleCancelEdit}
              style={{ marginRight: 12, padding: 8 }}
            >
              <Ionicons
                name="close-outline"
                size={26}
                color={theme.colors.white}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={{ marginRight: 8, padding: 8 }}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <Ionicons
                  name="checkmark-outline"
                  size={26}
                  color={theme.colors.secondary}
                />
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleStartEdit}
            style={{ marginRight: 8, padding: 8 }}
          >
            <Ionicons
              name="create-outline"
              size={24}
              color={theme.colors.white}
            />
          </TouchableOpacity>
        ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, saving, displayName, phoneNumber, dateOfBirth, navigation]);

  // ----- Actions -----
  const handleStartEdit = () => {
    initFormFromProfile();
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    initFormFromProfile();
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      showAlert(
        t("common:validation.validationError"),
        t("screens:profile.displayNameEmpty"),
      );
      return;
    }

    setSaving(true);
    try {
      const profileData: {
        displayName?: string;
        phoneNumber?: string | null;
        dateOfBirth?: Date | null;
      } = {};

      // Only include changed fields
      if (displayName.trim() !== (userProfile?.displayName || "")) {
        profileData.displayName = displayName.trim();
      }
      const newPhone = phoneNumber.trim() || null;
      if (newPhone !== (userProfile?.phoneNumber || null)) {
        profileData.phoneNumber = newPhone;
      }
      // Parse DOB
      if (dateOfBirth.trim()) {
        const parsed = new Date(dateOfBirth.trim());
        if (!isNaN(parsed.getTime())) {
          const existingDOB = userProfile?.dateOfBirth
            ? new Date(userProfile.dateOfBirth).toLocaleDateString()
            : "";
          if (dateOfBirth.trim() !== existingDOB) {
            profileData.dateOfBirth = parsed;
          }
        }
      } else if (userProfile?.dateOfBirth) {
        profileData.dateOfBirth = null; // cleared
      }

      if (Object.keys(profileData).length === 0) {
        setIsEditing(false);
        return; // nothing changed
      }

      const result = await updateUserProfile(profileData);
      if (result.success) {
        // User doc listener in UserContext picks up profile changes automatically
        setIsEditing(false);
        showAlert(t("common:success"), t("screens:profile.profileUpdated"));
      } else {
        showAlert(
          t("common:error"),
          result.error?.message || t("screens:profile.failedToUpdateProfile"),
        );
      }
    } catch (error: any) {
      console.error("Error saving profile:", error);
      showAlert(t("common:error"), t("common:unexpectedError"));
    } finally {
      setSaving(false);
    }
  };

  const handleImageUploadSuccess = (newImageUrl: string) => {
    setCurrentPhotoURL(newImageUrl);
    // User doc listener in UserContext picks up the new photoURL automatically
    showAlert(t("common:success"), t("screens:profile.profilePictureUploaded"));
  };

  // ----- Security: Change Password -----
  const handleOpenPasswordModal = () => {
    setCurrentPasswordInput("");
    setNewPasswordInput("");
    setConfirmPasswordInput("");
    setShowPasswordModal(true);
  };

  const handleChangePassword = async () => {
    if (newPasswordInput.length < 6) {
      showAlert(t("common:error"), t("screens:profile.passwordTooShort"));
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      showAlert(t("common:error"), t("screens:profile.passwordMismatch"));
      return;
    }

    setSecurityLoading(true);
    try {
      const result = await changePassword(
        currentPasswordInput,
        newPasswordInput,
      );
      if (result.success) {
        setShowPasswordModal(false);
        showAlert(
          t("common:success"),
          t("screens:profile.passwordChanged"),
          async () => {
            await signOutUser();
            router.replace("/login");
          },
        );
      } else {
        showAlert(
          t("common:error"),
          result.error?.message || t("screens:profile.failedToChangePassword"),
        );
      }
    } catch (error: any) {
      console.error("Password change error:", error);
      showAlert(t("common:error"), t("common:unexpectedError"));
    } finally {
      setSecurityLoading(false);
    }
  };

  // ----- Security: Change Email -----
  const handleOpenEmailModal = () => {
    setNewEmailInput("");
    setShowEmailModal(true);
  };

  const handleRequestEmailChange = async () => {
    const trimmed = newEmailInput.trim();
    if (!trimmed || !trimmed.includes("@")) {
      showAlert(t("common:error"), t("screens:profile.passwordTooShort")); // reuse generic validation
      return;
    }

    setSecurityLoading(true);
    try {
      const result = await requestEmailChange(trimmed);
      if (result.success) {
        setShowEmailModal(false);
        showAlert(
          t("common:success"),
          t("screens:profile.emailChangeRequested"),
          async () => {
            await signOutUser();
            router.replace("/login");
          },
        );
      } else {
        showAlert(
          t("common:error"),
          result.error?.message ||
            t("screens:profile.failedToRequestEmailChange"),
        );
      }
    } catch (error: any) {
      console.error("Email change request error:", error);
      showAlert(t("common:error"), t("common:unexpectedError"));
    } finally {
      setSecurityLoading(false);
    }
  };

  // ----- Sign Out -----
  const handleSignOutPress = () => setShowSignOutModal(true);

  // ----- Delete Account -----
  const handleDeleteAccountPress = () => setShowDeleteAccountModal(true);

  const handleDeleteAccountConfirm = async () => {
    setIsDeletingAccount(true);
    try {
      const result = await memberService.deleteUserAccount();
      if (result.success) {
        setShowDeleteAccountModal(false);
        // Account deleted — redirect to login
        router.replace("/login");
      } else {
        setShowDeleteAccountModal(false);
        // Show specific message based on reason
        if (result.reason === "has_groups") {
          const groupList =
            result.activeGroups
              ?.map((g) => `${g.groupName} (${g.clubName})`)
              .join(", ") || "";
          showAlert(
            t("screens:profile.deleteAccountBlocked"),
            t("screens:profile.deleteAccountHasGroups", { groups: groupList }),
          );
        } else if (result.reason === "is_club_admin") {
          const clubList = result.activeClubAdminClubs?.join(", ") || "";
          showAlert(
            t("screens:profile.deleteAccountBlocked"),
            t("screens:profile.deleteAccountIsClubAdmin", { clubs: clubList }),
          );
        } else if (result.reason === "has_dependents") {
          showAlert(
            t("screens:profile.deleteAccountBlocked"),
            t("screens:profile.deleteAccountHasDependents"),
          );
        } else {
          showAlert(
            t("common:error"),
            result.message || t("screens:profile.deleteAccountFailed"),
          );
        }
      }
    } catch (error) {
      console.error("Delete account error:", error);
      setShowDeleteAccountModal(false);
      showAlert(t("common:error"), t("screens:profile.deleteAccountFailed"));
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleSignOutConfirm = async () => {
    setIsSigningOut(true);
    setShowSignOutModal(false);
    try {
      const result = await signOutUser();
      if (result.success) {
        router.replace("/login");
      } else {
        showAlert("Error", "Failed to sign out. Please try again.");
      }
    } catch (error) {
      console.error("Sign out error:", error);
      showAlert("Error", "An error occurred while signing out.");
    } finally {
      setIsSigningOut(false);
    }
  };

  if (!user || !userProfile) {
    return (
      <View style={[styles.loadingContainer, { paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color={theme.colors.secondary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ---- Avatar Section ---- */}
          <View style={styles.avatarSection}>
            <TouchableOpacity
              onPress={() => setShowImagePicker(true)}
              style={styles.avatarContainer}
              activeOpacity={0.8}
            >
              {currentPhotoURL ? (
                <Image
                  source={{ uri: currentPhotoURL }}
                  style={styles.avatarImage}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitials}>
                    {getInitials(user.email || "U")}
                  </Text>
                </View>
              )}
              <View style={styles.cameraIconBadge}>
                <MaterialIcons
                  name="photo-camera"
                  size={18}
                  color={theme.colors.white}
                />
              </View>
            </TouchableOpacity>
            <Text style={styles.tapToChangeText}>
              {t("screens:profile.tapToChangePicture")}
            </Text>
          </View>

          {/* ---- Info Section ---- */}
          <View style={styles.infoSection}>
            {/* Display Name */}
            <View style={styles.fieldRow}>
              <View style={styles.fieldIconContainer}>
                <FontAwesome
                  name="user"
                  size={16}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.fieldContent}>
                <Text style={styles.fieldLabel}>
                  {t("screens:profile.name")}
                </Text>
                {isEditing ? (
                  <TextInput
                    style={styles.fieldInput}
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder={t("screens:profile.enterYourName")}
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                ) : (
                  <Text style={styles.fieldValue}>{getDisplayName()}</Text>
                )}
              </View>
            </View>

            {/* Email (always read-only) */}
            <View style={styles.fieldRow}>
              <View style={styles.fieldIconContainer}>
                <FontAwesome
                  name="envelope"
                  size={14}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.fieldContent}>
                <Text style={styles.fieldLabel}>
                  {t("screens:profile.email")}
                </Text>
                <Text style={styles.fieldValue}>
                  {userProfile?.email || user.email}
                </Text>
              </View>
            </View>

            {/* Phone */}
            <View style={styles.fieldRow}>
              <View style={styles.fieldIconContainer}>
                <FontAwesome
                  name="phone"
                  size={16}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.fieldContent}>
                <Text style={styles.fieldLabel}>
                  {t("screens:profile.phone")}
                </Text>
                {isEditing ? (
                  <TextInput
                    style={styles.fieldInput}
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    placeholder={t("screens:profile.enterPhoneNumber")}
                    placeholderTextColor={theme.colors.textSecondary}
                    keyboardType="phone-pad"
                  />
                ) : (
                  <Text
                    style={[
                      styles.fieldValue,
                      !userProfile?.phoneNumber && styles.fieldEmpty,
                    ]}
                  >
                    {userProfile?.phoneNumber || t("screens:profile.notSet")}
                  </Text>
                )}
              </View>
            </View>

            {/* Date of Birth */}
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
                {isEditing ? (
                  <TextInput
                    style={styles.fieldInput}
                    value={dateOfBirth}
                    onChangeText={setDateOfBirth}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                ) : (
                  <Text
                    style={[
                      styles.fieldValue,
                      !userProfile?.dateOfBirth && styles.fieldEmpty,
                    ]}
                  >
                    {userProfile?.dateOfBirth
                      ? new Date(userProfile.dateOfBirth).toLocaleDateString()
                      : t("screens:profile.notSet")}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* ---- Clubs Section ---- */}
          {userClubs.length > 0 && (
            <View style={styles.membershipSection}>
              <Text style={styles.sectionTitle}>
                {t("screens:profile.clubs")}
              </Text>
              {userClubs.map((club, index) => (
                <View key={`club-${index}`} style={styles.membershipCard}>
                  <View style={styles.membershipCardHeader}>
                    <FontAwesome
                      name="shield"
                      size={16}
                      color={theme.colors.secondary}
                    />
                    <Text style={styles.membershipName}>{club.clubName}</Text>
                  </View>
                  <View style={styles.rolesRow}>
                    <View style={styles.roleTag}>
                      <Text style={styles.roleTagText}>
                        {club.role || "member"}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ---- Groups Section ---- */}
          {userGroups.length > 0 && (
            <View style={styles.membershipSection}>
              <Text style={styles.sectionTitle}>
                {t("screens:profile.groups")}
              </Text>
              {userGroups.map((group, index) => (
                <View key={`group-${index}`} style={styles.membershipCard}>
                  <View style={styles.membershipCardHeader}>
                    <FontAwesome
                      name="users"
                      size={14}
                      color={theme.colors.secondary}
                    />
                    <Text style={styles.membershipName}>{group.groupName}</Text>
                    <Text style={styles.clubNameSubtext}>{group.clubName}</Text>
                  </View>
                  <View style={styles.rolesRow}>
                    {group.roles?.map((role, ri) => (
                      <View key={`role-${ri}`} style={styles.roleTag}>
                        <Text style={styles.roleTagText}>{role}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ---- Legal Settings ---- */}
          <LegalSettingsSection showAcceptanceStatus={true} />

          {/* ---- Security Section ---- */}
          {!isEditing && (
            <View style={styles.securitySection}>
              <Text style={styles.sectionTitle}>
                {t("screens:profile.security")}
              </Text>

              <TouchableOpacity
                style={styles.securityButton}
                onPress={handleOpenPasswordModal}
              >
                <View style={styles.securityButtonIcon}>
                  <FontAwesome
                    name="lock"
                    size={16}
                    color={theme.colors.secondary}
                  />
                </View>
                <Text style={styles.securityButtonText}>
                  {t("screens:profile.changePassword")}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.securityButton}
                onPress={handleOpenEmailModal}
              >
                <View style={styles.securityButtonIcon}>
                  <FontAwesome
                    name="envelope"
                    size={14}
                    color={theme.colors.secondary}
                  />
                </View>
                <Text style={styles.securityButtonText}>
                  {t("screens:profile.changeEmail")}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>

              {/* Delete Account - danger button */}
              <TouchableOpacity
                style={[styles.securityButton, styles.deleteAccountButton]}
                onPress={handleDeleteAccountPress}
              >
                <View style={styles.securityButtonIcon}>
                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color={theme.colors.error}
                  />
                </View>
                <Text
                  style={[styles.securityButtonText, styles.deleteAccountText]}
                >
                  {t("screens:profile.deleteAccount")}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={theme.colors.error}
                />
              </TouchableOpacity>
            </View>
          )}

          {/* ---- Language Selector ---- */}
          <View style={styles.languageSection}>
            <DropdownInput
              label={t("screens:profile.language")}
              value={language}
              onValueChange={(value) => setLanguage(value as SupportedLanguage)}
              options={languageOptions}
              placeholder={t("screens:profile.selectLanguage")}
            />
          </View>

          {/* ---- Create a Club (only if not already a club-admin) ---- */}
          {!isEditing &&
            !userProfile?.clubAccess?.some(
              (ca) => ca.role === "club-admin" && ca.isActive !== false,
            ) && (
              <View style={styles.securitySection}>
                <TouchableOpacity
                  style={styles.securityButton}
                  onPress={() => router.push("/create-club-form")}
                >
                  <View style={styles.securityButtonIcon}>
                    <Ionicons
                      name="add-circle-outline"
                      size={16}
                      color={theme.colors.secondary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.securityButtonText}>
                      {t("screens:profile.createClub")}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.textSecondary,
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      {t("screens:profile.createClubDesc")}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            )}

          {/* ---- Sign Out ---- */}
          <View style={styles.signOutSection}>
            <TouchableOpacity
              style={styles.signOutButton}
              onPress={handleSignOutPress}
              disabled={isSigningOut}
            >
              <FontAwesome
                name="sign-out"
                size={16}
                color={theme.colors.error}
              />
              <Text style={styles.signOutText}>
                {isSigningOut
                  ? t("screens:profile.signingOut")
                  : t("screens:profile.signOut")}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Profile Picture Upload Modal */}
      <ProfilePictureUpload
        visible={showImagePicker}
        onClose={() => setShowImagePicker(false)}
        onSuccess={handleImageUploadSuccess}
        currentImageUrl={currentPhotoURL}
        userId={user.uid}
      />

      {/* Sign Out Confirmation Modal */}
      <ConfirmationModal
        visible={showSignOutModal}
        title={t("screens:profile.signOut")}
        message={t("screens:profile.signOutConfirmation")}
        confirmText={t("screens:profile.signOut")}
        cancelText={t("common:cancel")}
        onConfirm={handleSignOutConfirm}
        onCancel={() => setShowSignOutModal(false)}
        confirmButtonTheme="primary"
      />

      {/* Delete Account Confirmation Modal */}
      <ConfirmationModal
        visible={showDeleteAccountModal}
        title={t("screens:profile.deleteAccount")}
        message={t("screens:profile.deleteAccountConfirm")}
        confirmText={
          isDeletingAccount
            ? t("screens:profile.deletingAccount")
            : t("screens:profile.deleteAccountButton")
        }
        cancelText={t("common:cancel")}
        onConfirm={handleDeleteAccountConfirm}
        onCancel={() => !isDeletingAccount && setShowDeleteAccountModal(false)}
        confirmButtonTheme="primary"
      />

      {/* Generic Alert Modal (cross-platform replacement for Alert.alert) */}
      <ConfirmationModal
        visible={alertModal.visible}
        title={alertModal.title}
        message={alertModal.message}
        confirmText={t("common:ok")}
        onConfirm={hideAlert}
        onCancel={hideAlert}
      />

      {/* ---- Change Password Modal ---- */}
      <Modal
        visible={showPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => !securityLoading && setShowPasswordModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !securityLoading && setShowPasswordModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalKeyboardView}
          >
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>
                {t("screens:profile.changePassword")}
              </Text>

              <Text style={styles.modalInputLabel}>
                {t("screens:profile.currentPassword")}
              </Text>
              <TextInput
                style={styles.modalInput}
                value={currentPasswordInput}
                onChangeText={setCurrentPasswordInput}
                placeholder={t("screens:profile.enterCurrentPassword")}
                placeholderTextColor={theme.colors.textSecondary}
                secureTextEntry
                autoCapitalize="none"
                editable={!securityLoading}
              />

              <Text style={styles.modalInputLabel}>
                {t("screens:profile.newPassword")}
              </Text>
              <TextInput
                style={styles.modalInput}
                value={newPasswordInput}
                onChangeText={setNewPasswordInput}
                placeholder={t("screens:profile.enterNewPassword")}
                placeholderTextColor={theme.colors.textSecondary}
                secureTextEntry
                autoCapitalize="none"
                editable={!securityLoading}
              />

              <Text style={styles.modalInputLabel}>
                {t("screens:profile.confirmNewPassword")}
              </Text>
              <TextInput
                style={styles.modalInput}
                value={confirmPasswordInput}
                onChangeText={setConfirmPasswordInput}
                placeholder={t("screens:profile.confirmPassword")}
                placeholderTextColor={theme.colors.textSecondary}
                secureTextEntry
                autoCapitalize="none"
                editable={!securityLoading}
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setShowPasswordModal(false)}
                  disabled={securityLoading}
                >
                  <Text style={styles.modalCancelText}>
                    {t("common:cancel")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalConfirmButton,
                    securityLoading && styles.modalButtonDisabled,
                  ]}
                  onPress={handleChangePassword}
                  disabled={securityLoading}
                >
                  {securityLoading ? (
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.primary}
                    />
                  ) : (
                    <Text style={styles.modalConfirmText}>
                      {t("screens:profile.changePassword")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* ---- Change Email Modal ---- */}
      <Modal
        visible={showEmailModal}
        transparent
        animationType="fade"
        onRequestClose={() => !securityLoading && setShowEmailModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !securityLoading && setShowEmailModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalKeyboardView}
          >
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>
                {t("screens:profile.changeEmail")}
              </Text>

              <Text style={styles.modalInputLabel}>
                {t("screens:profile.currentEmail")}
              </Text>
              <Text style={styles.modalCurrentValue}>
                {userProfile?.email || user?.email}
              </Text>

              <Text style={styles.modalInputLabel}>
                {t("screens:profile.newEmail")}
              </Text>
              <TextInput
                style={styles.modalInput}
                value={newEmailInput}
                onChangeText={setNewEmailInput}
                placeholder={t("screens:profile.enterNewEmail")}
                placeholderTextColor={theme.colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!securityLoading}
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setShowEmailModal(false)}
                  disabled={securityLoading}
                >
                  <Text style={styles.modalCancelText}>
                    {t("common:cancel")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalConfirmButton,
                    securityLoading && styles.modalButtonDisabled,
                  ]}
                  onPress={handleRequestEmailChange}
                  disabled={securityLoading}
                >
                  {securityLoading ? (
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.primary}
                    />
                  ) : (
                    <Text style={styles.modalConfirmText}>
                      {t("screens:profile.changeEmail")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
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
    backgroundColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  // ---- Avatar ----
  avatarSection: {
    alignItems: "center",
    marginBottom: 28,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 8,
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: theme.colors.secondary,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.secondary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: theme.colors.inputBorder,
  },
  avatarInitials: {
    color: theme.colors.primary,
    fontSize: 36,
    fontWeight: "bold",
  },
  cameraIconBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    backgroundColor: theme.colors.secondary,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  tapToChangeText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  // ---- Info Fields ----
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
  fieldInput: {
    fontSize: 16,
    color: theme.colors.text,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.secondary,
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  // ---- Membership Sections ----
  membershipSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  membershipCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.secondary,
  },
  membershipCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  membershipName: {
    fontSize: 15,
    fontWeight: "600",
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
  },
  roleTag: {
    backgroundColor: theme.colors.secondary,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  roleTagText: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  // ---- Language Selector ----
  languageSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
  },
  // ---- Security Section ----
  securitySection: {
    marginTop: 24,
  },
  securityButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    padding: 14,
    marginBottom: 8,
  },
  securityButtonIcon: {
    width: 28,
    alignItems: "center",
  },
  securityButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: theme.colors.text,
    marginLeft: 12,
  },
  deleteAccountButton: {
    borderColor: theme.colors.error + "30",
    backgroundColor: theme.colors.error + "08",
  },
  deleteAccountText: {
    color: theme.colors.error,
  },
  // ---- Custom Form Modals ----
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalKeyboardView: {
    width: "100%",
    alignItems: "center",
  },
  modalCard: {
    width: "90%",
    maxWidth: 400,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.large,
    padding: 24,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: 20,
  },
  modalInputLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 12,
  },
  modalInput: {
    fontSize: 15,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.primary,
  },
  modalCurrentValue: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    paddingVertical: 4,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.secondary,
    alignItems: "center",
  },
  modalConfirmText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
  // ---- Sign Out ----
  signOutSection: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
    paddingTop: 20,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: theme.colors.error + "10",
    borderWidth: 1,
    borderColor: theme.colors.error + "30",
  },
  signOutText: {
    color: theme.colors.error,
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
});
