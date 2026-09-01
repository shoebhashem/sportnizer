import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import Input from "@/components/Input";
import { getFunctionsUrl } from "@/constants/config";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/services/core/firebase";
import Ionicons from "@react-native-vector-icons/ionicons/static";
import { router, useLocalSearchParams } from "expo-router";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface GroupInvitationDetails {
  invitationType: "email" | "shareable";
  groupId: string;
  groupName: string;
  inviterName: string;
  createdAt: any;

  // Email invitation specific
  email?: string;

  // Shareable invitation specific
  expiresAt?: any;
  maxUses?: number | null;
  currentUses?: number;
  invitationSubType?: string;

  // Group info
  groupInfo?: {
    sportType: string;
    description?: string;
    memberCount: number;
    isActive: boolean;
  };
}

export default function JoinScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const { token } = useLocalSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [invitationDetails, setInvitationDetails] =
    useState<GroupInvitationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalConfirmText, setModalConfirmText] = useState("OK");
  const [modalCancelText, setModalCancelText] = useState("");
  const [modalOnConfirm, setModalOnConfirm] = useState<() => void>(
    () => () => {},
  );

  // Form state for authentication
  const [isExistingUser, setIsExistingUser] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");

  // Helper function to show modal
  const showModal = (
    title: string,
    message: string,
    confirmText = "OK",
    cancelText = "",
    onConfirm: () => void = () => {},
  ) => {
    setModalTitle(title);
    setModalMessage(message);
    setModalConfirmText(confirmText);
    setModalCancelText(cancelText);
    setModalOnConfirm(() => onConfirm);
    setModalVisible(true);
  };

  const hideModal = () => {
    setModalVisible(false);
  };

  const fetchInvitationDetails = useCallback(async () => {
    if (!token) {
      setError(t("screens:join.invalidInvitationLink"));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const functionsUrl = getFunctionsUrl();
      const response = await fetch(
        `${functionsUrl}/getInvitationDetails?token=${token}`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch invitation details");
      }

      const data = await response.json();

      if (!data.success) {
        setError(data.error || t("screens:join.failedToLoadInvitation"));
      } else if (data.invitation) {
        setInvitationDetails(data.invitation);

        // Pre-fill email for email invitations
        if (
          data.invitation.invitationType === "email" &&
          data.invitation.email
        ) {
          setEmail(data.invitation.email);
        }
      } else {
        setError("Invalid invitation data");
      }
    } catch (error: any) {
      console.error("Error fetching invitation details:", error);
      setError(t("screens:join.failedToLoadInvitation"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchInvitationDetails();
  }, [fetchInvitationDetails]);

  const handleJoinGroup = async () => {
    if (!invitationDetails || !user) return;

    setProcessing(true);

    try {
      const functionsUrl = getFunctionsUrl();
      const response = await fetch(`${functionsUrl}/processInvitation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invitationToken: token,
          userEmail: user.email,
        }),
      });

      const result = await response.json();

      if (result.success) {
        showModal(
          t("screens:join.welcomeSuccess"),
          t("screens:join.joinedSuccessfully", {
            groupName: invitationDetails.groupName,
          }),
          t("screens:join.goToGroups"),
          "",
          () => {
            hideModal();
            router.replace("/(tabs)/groups");
          },
        );
      } else {
        showModal(
          t("common:error"),
          result.error || t("screens:join.errors.failedToJoin"),
        );
      }
    } catch (error: any) {
      console.error("Error joining group:", error);
      showModal(t("common:error"), t("screens:join.errors.failedToJoin"));
    } finally {
      setProcessing(false);
    }
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      showModal(
        t("common:validation.missingInformation"),
        t("screens:join.errors.emailAndPasswordRequired"),
      );
      return;
    }

    setProcessing(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // User will be signed in, and useAuth will update automatically
      // Then we can proceed to join the group
    } catch (error: any) {
      let errorMessage = t("screens:join.errors.generic");

      switch (error.code) {
        case "auth/user-not-found":
        case "auth/wrong-password":
          errorMessage = t("screens:join.errors.invalidCredential");
          break;
        case "auth/invalid-email":
          errorMessage = t("common:validation.invalidEmail");
          break;
        case "auth/too-many-requests":
          errorMessage = t("screens:join.errors.tooManyAttempts");
          break;
      }

      showModal(t("screens:join.signInFailed"), errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  const handleSignUp = async () => {
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      showModal(
        t("common:validation.missingInformation"),
        t("screens:join.errors.allFieldsRequired"),
      );
      return;
    }

    if (password !== confirmPassword) {
      showModal(
        t("common:validation.passwordMismatch"),
        t("screens:join.errors.passwordsDontMatch"),
      );
      return;
    }

    if (password.length < 6) {
      showModal(
        t("common:validation.passwordTooShort"),
        t("screens:join.errors.passwordMinLength"),
      );
      return;
    }

    setProcessing(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );

      // Update the user's display name
      await updateProfile(userCredential.user, {
        displayName: fullName.trim(),
      });

      // User is now signed up and signed in automatically
      // The useAuth hook will update and we can proceed to join the group
    } catch (error: any) {
      let errorMessage = t("screens:join.errors.generic");

      switch (error.code) {
        case "auth/email-already-in-use":
          errorMessage = t("screens:join.errors.emailAlreadyInUse");
          break;
        case "auth/invalid-email":
          errorMessage = t("common:validation.invalidEmail");
          break;
        case "auth/weak-password":
          errorMessage = t("screens:join.errors.weakPassword");
          break;
      }

      showModal(t("screens:join.signUpFailed"), errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  const handleSwitchUser = () => {
    showModal(
      t("screens:join.switchAccount"),
      t("screens:join.switchAccountMessage"),
      t("common:signOut"),
      t("common:cancel"),
      async () => {
        try {
          await auth.signOut();
          hideModal();
        } catch (error) {
          console.error("Error signing out:", error);
          showModal(t("common:error"), t("screens:join.errors.signOutFailed"));
        }
      },
    );
  };

  const formatExpirationDate = (timestamp: any): string => {
    if (!timestamp) return "";

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return (
      date.toLocaleDateString() +
      " at " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  const formatMemberCount = (count: number): string => {
    return t("screens:join.memberCount", { count });
  };

  // Auto-join if user is already signed in and email matches (for email invitations)
  useEffect(() => {
    if (user && invitationDetails && !processing) {
      if (
        invitationDetails.invitationType === "shareable" ||
        (invitationDetails.invitationType === "email" &&
          user.email === invitationDetails.email)
      ) {
        // For shareable invitations or matching email invitations, we can proceed automatically
        // But let's show the group details first and let them confirm
      }
    }
  }, [user, invitationDetails, processing]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>
            {t("screens:join.loadingInvitation")}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color={theme.colors.error} />
          <Text style={styles.errorTitle}>
            {t("screens:join.invitationError")}
          </Text>
          <Text style={styles.errorText}>{error}</Text>
          <Button
            label={t("common:retry")}
            onPress={fetchInvitationDetails}
            theme="primary"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!invitationDetails) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons
            name="document-outline"
            size={64}
            color={theme.colors.textSecondary}
          />
          <Text style={styles.errorTitle}>
            {t("screens:join.noInvitationFound")}
          </Text>
          <Text style={styles.errorText}>
            {t("screens:join.invalidOrExpired")}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Group Information */}
          <View style={styles.groupCard}>
            <View style={styles.groupHeader}>
              <Ionicons
                name="people"
                size={32}
                color={theme.colors.secondary}
              />
              <View style={styles.groupInfo}>
                <Text style={styles.groupName}>
                  {invitationDetails.groupName}
                </Text>
                {invitationDetails.groupInfo && (
                  <>
                    <Text style={styles.groupSport}>
                      {invitationDetails.groupInfo.sportType}
                    </Text>
                    <Text style={styles.memberCount}>
                      {formatMemberCount(
                        invitationDetails.groupInfo.memberCount,
                      )}
                    </Text>
                  </>
                )}
              </View>
            </View>

            {invitationDetails.groupInfo?.description && (
              <Text style={styles.groupDescription}>
                {invitationDetails.groupInfo.description}
              </Text>
            )}

            <View style={styles.inviterInfo}>
              <Ionicons
                name="person"
                size={16}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.inviterText}>
                {t("screens:join.invitedBy", {
                  inviterName: invitationDetails.inviterName,
                })}
              </Text>
            </View>

            {/* Invitation Type Badge */}
            <View style={styles.invitationBadge}>
              <Text style={styles.badgeText}>
                {invitationDetails.invitationType === "email"
                  ? t("screens:join.emailInvitation")
                  : t("screens:join.shareableLink")}
              </Text>
            </View>

            {/* Expiration info for shareable links */}
            {invitationDetails.invitationType === "shareable" &&
              invitationDetails.expiresAt && (
                <View style={styles.expirationInfo}>
                  <Ionicons
                    name="time"
                    size={16}
                    color={theme.colors.textSecondary}
                  />
                  <Text style={styles.expirationText}>
                    {t("screens:join.expires", {
                      date: formatExpirationDate(invitationDetails.expiresAt),
                    })}
                  </Text>
                </View>
              )}
          </View>

          {/* Authentication Section */}
          {!user ? (
            <View style={styles.authSection}>
              <Text style={styles.authTitle}>
                {t("screens:join.joinGroup", {
                  groupName: invitationDetails.groupName,
                })}
              </Text>
              <Text style={styles.authSubtitle}>
                {invitationDetails.invitationType === "email"
                  ? t("screens:join.signInOrCreateAccount")
                  : t("screens:join.signInToAcceptInvitation")}
              </Text>

              {/* Toggle between Sign In and Sign Up */}
              <View style={styles.authToggle}>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    isExistingUser && styles.activeToggle,
                  ]}
                  onPress={() => setIsExistingUser(true)}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      isExistingUser && styles.activeToggleText,
                    ]}
                  >
                    {t("common:signIn")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    !isExistingUser && styles.activeToggle,
                  ]}
                  onPress={() => setIsExistingUser(false)}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      !isExistingUser && styles.activeToggleText,
                    ]}
                  >
                    {t("common:signUp")}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Sign In Form */}
              {isExistingUser ? (
                <View style={styles.authForm}>
                  <Input
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="your@email.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <Input
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    secureTextEntry
                  />
                  <Button
                    label={
                      processing
                        ? t("common:signingIn")
                        : t("screens:join.signInAndJoinGroup")
                    }
                    onPress={handleSignIn}
                    theme="primary"
                    disabled={processing}
                  />
                </View>
              ) : (
                /* Sign Up Form */
                <View style={styles.authForm}>
                  <Input
                    label="Full Name"
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="Enter your full name"
                  />
                  <Input
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="your@email.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <Input
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Create a password (min 6 characters)"
                    secureTextEntry
                  />
                  <Input
                    label="Confirm Password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm your password"
                    secureTextEntry
                  />
                  <Button
                    label={
                      processing
                        ? t("screens:join.creatingAccount")
                        : t("screens:join.signUpAndJoinGroup")
                    }
                    onPress={handleSignUp}
                    theme="primary"
                    disabled={processing}
                  />
                </View>
              )}
            </View>
          ) : (
            /* User is already signed in */
            <View style={styles.joinSection}>
              {invitationDetails.invitationType === "email" &&
              user.email !== invitationDetails.email ? (
                /* Email mismatch - show switch user option */
                <View style={styles.emailMismatchCard}>
                  <Ionicons
                    name="warning"
                    size={24}
                    color={theme.colors.error}
                  />
                  <Text style={styles.mismatchTitle}>
                    {t("screens:join.emailMismatch")}
                  </Text>
                  <Text style={styles.mismatchText}>
                    {t("screens:join.emailMismatchMessage", {
                      email: invitationDetails.email,
                      userEmail: user.email,
                    })}
                  </Text>
                  <Button
                    label={t("screens:join.switchAccount")}
                    onPress={handleSwitchUser}
                    theme="secondary"
                  />
                </View>
              ) : (
                /* Ready to join */
                <View style={styles.readyCard}>
                  <Ionicons
                    name="checkmark-circle"
                    size={48}
                    color={theme.colors.secondary}
                  />
                  <Text style={styles.readyTitle}>
                    {t("screens:join.readyToJoin")}
                  </Text>
                  <Text style={styles.readyText}>
                    {t("screens:join.signedInAs", { email: user.email })}
                  </Text>
                  <Button
                    label={
                      processing
                        ? t("screens:join.joiningGroup")
                        : t("screens:join.joinGroupButton", {
                            groupName: invitationDetails.groupName,
                          })
                    }
                    onPress={handleJoinGroup}
                    theme="primary"
                    disabled={processing}
                  />
                  <TouchableOpacity
                    style={styles.switchButton}
                    onPress={handleSwitchUser}
                  >
                    <Text style={styles.switchText}>
                      {t("screens:join.useDifferentAccount")}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmationModal
        visible={modalVisible}
        title={modalTitle}
        message={modalMessage}
        confirmText={modalConfirmText}
        cancelText={modalCancelText}
        onConfirm={modalOnConfirm}
        onCancel={hideModal}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.layout.containerPadding,
    paddingVertical: theme.spacing.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing.lg,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.layout.containerPadding,
    gap: theme.spacing.lg,
  },
  errorTitle: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: "center",
  },
  errorText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
  groupCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.large,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  groupSport: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
    marginBottom: theme.spacing.xs,
  },
  memberCount: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  groupDescription: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    lineHeight: 22,
    marginBottom: theme.spacing.lg,
  },
  inviterInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  inviterText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  invitationBadge: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.secondary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.small,
    marginBottom: theme.spacing.sm,
  },
  badgeText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  expirationInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  expirationText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  authSection: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.large,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  authTitle: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  authSubtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: theme.spacing.xl,
  },
  authToggle: {
    flexDirection: "row",
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.medium,
    padding: 4,
    marginBottom: theme.spacing.xl,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
    borderRadius: theme.borderRadius.small,
  },
  activeToggle: {
    backgroundColor: theme.colors.secondary,
  },
  toggleText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  activeToggleText: {
    color: theme.colors.primary,
  },
  authForm: {
    gap: theme.spacing.lg,
  },
  joinSection: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.large,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  emailMismatchCard: {
    alignItems: "center",
    gap: theme.spacing.lg,
  },
  mismatchTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  mismatchText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  readyCard: {
    alignItems: "center",
    gap: theme.spacing.lg,
  },
  readyTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  readyText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  switchButton: {
    padding: theme.spacing.md,
  },
  switchText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    textDecorationLine: "underline",
  },
});
