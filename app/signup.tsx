import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import Input from "@/components/Input";
import { LEGAL_URLS } from "@/constants/legal";
import { theme } from "@/constants/theme";
import { functions } from "@/services/core/firebase";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { httpsCallable } from "firebase/functions";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    KeyboardAvoidingView,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { signUpUser } from "../services/auth/authService";
import { legalService } from "../services/legal/legalService";
import { addRegularMemberToGroupService } from "../services/orchestration/addRegularMemberToGroup";

export default function SignupScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const { invite, verified, action } = useLocalSearchParams<{
    invite?: string;
    verified?: string;
    action?: string;
  }>();

  console.log("🔍 SignupScreen mounted with params:", {
    invite,
    verified,
    action,
  });
  console.log("🎫 Invitation token type:", typeof invite, "value:", invite);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [invitationInfo, setInvitationInfo] = useState<{
    groupName: string;
    inviterName: string;
    invitationType?: string;
  } | null>(null);
  const [youthData, setYouthData] = useState<{
    childName: string;
    dateOfBirth: string;
    relationship: string;
  } | null>(null);

  // Store the expected invitation email to enforce it during signup
  const [invitationEmail, setInvitationEmail] = useState<string | null>(null);

  // Error states
  const [fullNameError, setFullNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");

  // Modal states
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [invitationProcessed, setInvitationProcessed] = useState(false);

  // Legal acceptance state
  const [hasAcceptedLegal, setHasAcceptedLegal] = useState(false);
  const [legalVersions, setLegalVersions] = useState<{
    termsVersion: string;
    privacyVersion: string;
  } | null>(null);

  // Load legal versions on mount
  useEffect(() => {
    const loadLegalVersions = async () => {
      const acceptance = await legalService.getLegalAcceptanceForSignup();
      setLegalVersions({
        termsVersion: acceptance.termsVersion,
        privacyVersion: acceptance.privacyVersion,
      });
    };
    loadLegalVersions();
  }, []);

  // Load invitation info if invite token is present
  useEffect(() => {
    if (invite) {
      loadInvitationDetails(invite);
    }
  }, [invite]);

  const loadInvitationDetails = async (inviteToken: string) => {
    try {
      // Call validateInvitationToken to get invitation details without processing
      const validateTokenFn = httpsCallable(
        functions,
        "validateInvitationToken",
      );
      const result = await validateTokenFn({ invitationToken: inviteToken });
      const validation = result.data as any;

      if (validation.success && validation.invitationData) {
        const invData = validation.invitationData;
        setInvitationInfo({
          groupName: invData.groupName || "the group",
          inviterName: invData.inviterName || "a team member",
          invitationType: invData.invitationType,
        });

        // Pre-fill email for ALL invitation types
        if (invData.email) {
          setEmail(invData.email);
          setInvitationEmail(invData.email); // Store for validation
          console.log("📧 Email pre-filled from invitation:", invData.email);
        }

        // If this is a youth invitation, store the youth data
        if (invData.invitationType === "youth_member" && invData.youthData) {
          setYouthData(invData.youthData);
          console.log("👶 Youth invitation detected:", invData.youthData);
        }
      } else {
        // Fallback to generic info if validation fails
        setInvitationInfo({
          groupName: "the group",
          inviterName: "a team member",
        });
      }
    } catch (error) {
      console.error("Error loading invitation details:", error);
      // Fallback to generic info
      setInvitationInfo({
        groupName: "the group",
        inviterName: "a team member",
      });
    }
  };

  // Handle email verification status
  useEffect(() => {
    if (verified === "success") {
      setModalMessage(
        "✅ Email verified successfully!\n\nYour account is now activated. You can now sign in to your Clubnizer account.",
      );
      setSuccessModalVisible(true);
    } else if (verified === "already") {
      setModalMessage(
        "✅ Email already verified!\n\nYour account is already activated. You can sign in to your Clubnizer account.",
      );
      setSuccessModalVisible(true);
    }
  }, [verified]);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = () => {
    let isValid = true;

    // Reset errors
    setFullNameError("");
    setEmailError("");
    setPasswordError("");
    setConfirmPasswordError("");

    // Validate full name
    if (!fullName.trim()) {
      setFullNameError(t("screens:signup.nameRequired"));
      isValid = false;
    } else if (fullName.trim().length < 2) {
      setFullNameError(t("screens:signup.nameRequired"));
      isValid = false;
    }

    // Validate email
    if (!email.trim()) {
      setEmailError(t("common:validation.requiredField"));
      isValid = false;
    } else if (!validateEmail(email)) {
      setEmailError(t("common:validation.invalidEmail"));
      isValid = false;
    } else if (
      invite &&
      invitationEmail &&
      email.toLowerCase().trim() !== invitationEmail.toLowerCase().trim()
    ) {
      // For invited users, verify email matches invitation
      setEmailError("Email must match the invitation email address");
      isValid = false;
    }

    // Validate password
    if (!password.trim()) {
      setPasswordError(t("common:validation.requiredField"));
      isValid = false;
    } else if (password.length < 6) {
      setPasswordError(t("screens:signup.passwordRequirements"));
      isValid = false;
    }

    // Validate confirm password
    if (!confirmPassword.trim()) {
      setConfirmPasswordError(t("common:validation.requiredField"));
      isValid = false;
    } else if (password !== confirmPassword) {
      setConfirmPasswordError(t("screens:signup.passwordsDoNotMatch"));
      isValid = false;
    }

    // Validate legal acceptance
    if (!hasAcceptedLegal) {
      setModalMessage(t("screens:signup.legalAcceptanceRequired"));
      setErrorModalVisible(true);
      isValid = false;
    }

    return isValid;
  };

  const handleSignUp = async () => {
    if (!validateForm()) return;

    setLoading(true);

    try {
      console.log("🚀 Starting signup process with invitation token:", invite);

      // Prepare legal acceptance data
      const legalAcceptanceData = legalVersions
        ? {
            termsVersion: legalVersions.termsVersion,
            privacyVersion: legalVersions.privacyVersion,
            acceptanceMethod: "signup" as const,
            clientInfo: {
              platform: legalService.getCurrentPlatform(),
              appVersion: legalService.getAppVersion(),
            },
          }
        : undefined;

      console.log("📋 Legal acceptance data:", legalAcceptanceData);

      // Pass invitation token and legal acceptance to signUpUser
      const result = await signUpUser(
        email.trim(),
        password,
        fullName.trim(),
        invite || undefined,
        legalAcceptanceData,
      );

      console.log("📊 Signup result:", result);

      if (result.success && result.user) {
        if (invite && !result.requiresEmailVerification) {
          // Invited user account created, now process membership via unified orchestration service
          try {
            console.log("✅ Account created. Processing invitation...");

            // YOUTH INVITATION: Orchestration handles youth doc creation after claiming invitation
            if (
              invitationInfo?.invitationType === "youth_member" &&
              youthData
            ) {
              console.log(
                "👶 Processing new youth invitation (orchestration will create youth doc)...",
              );

              const invitationResult =
                await addRegularMemberToGroupService.processInvitationAfterUserResponse(
                  invite, // invitationToken
                  result.user.uid, // guardian's userId (orchestration will create youth and override)
                  "accept",
                  {
                    guardianUid: result.user.uid,
                    guardianEmail: result.user.email || email.trim(),
                    guardianName: fullName.trim(),
                    relationship: youthData.relationship,
                  },
                  {
                    childName: youthData.childName,
                    dateOfBirth: youthData.dateOfBirth,
                    relationship: youthData.relationship,
                  },
                );

              if (!invitationResult.success) {
                throw new Error(
                  invitationResult.error || "Failed to process invitation",
                );
              }

              console.log("✅ Youth invitation processed successfully!");

              setModalMessage(
                t("screens:signup.success.welcomeYouthAdded", {
                  childName: youthData.childName,
                  groupName: invitationInfo.groupName,
                }),
              );
              setInvitationProcessed(true);
              setSuccessModalVisible(true);
            } else {
              // REGULAR INVITATION: Standard flow
              console.log(
                "✅ Processing regular invitation via orchestration service...",
              );

              const invitationResult =
                await addRegularMemberToGroupService.processInvitationAfterUserResponse(
                  invite, // invitationToken
                  result.user.uid, // userId
                  "accept", // action
                );

              if (!invitationResult.success) {
                throw new Error(
                  invitationResult.error || "Failed to process invitation",
                );
              }

              console.log(
                "✅ Invitation processed successfully via orchestration service!",
              );

              // Get invitation info for welcome message
              const validateTokenFn = httpsCallable(
                functions,
                "validateInvitationToken",
              );
              const validationResult = await validateTokenFn({
                invitationToken: invite,
              });
              const validation = validationResult.data as any;
              const groupName =
                validation?.invitationData?.groupName || t("common:theGroup");

              setModalMessage(
                t("screens:signup.success.welcomeJoinedGroup", {
                  groupName: groupName,
                }),
              );
              setInvitationProcessed(true);
              setSuccessModalVisible(true);
            }
          } catch (invitationError) {
            console.error("❌ Error processing invitation:", invitationError);
            // User account was created successfully, but membership failed
            const errorContext = youthData
              ? t(
                  "screens:signup.success.invitationProcessingErrorAddingChild",
                  { childName: youthData.childName },
                )
              : t("screens:signup.success.invitationProcessingErrorAddingYou");
            setModalMessage(
              t("screens:signup.success.invitationProcessingError", {
                errorContext: errorContext,
                inviterName:
                  invitationInfo?.inviterName || t("common:theGroupAdmin"),
              }),
            );
            setSuccessModalVisible(true);
          }

          return; // Exit early - don't show regular signup message
        }

        // Regular signup flow
        let successMessage = result.requiresEmailVerification
          ? t("screens:signup.success.accountCreatedVerifyEmail")
          : t("screens:signup.success.accountCreatedActivated");

        // If this is club creation flow, update the message
        if (action === "createClub" && result.requiresEmailVerification) {
          successMessage += t("screens:signup.success.afterVerifyCreateClub");
        }

        // If there is an invitation token and regular email verification is required, inform user
        if (invite && result.requiresEmailVerification) {
          // Update message to mention invitation will be processed after verification
          successMessage += t("screens:signup.success.afterVerifyInvitation", {
            groupName: invitationInfo?.groupName || t("common:theGroup"),
          });
        }

        setModalMessage(successMessage);
        setSuccessModalVisible(true);
      } else {
        // Show error
        let errorMessage = t("screens:signup.errors.generic");

        switch (result.error?.code) {
          case "auth/email-already-in-use":
            errorMessage = t("screens:signup.errors.emailAlreadyInUse");
            break;
          case "auth/invalid-email":
            errorMessage = t("screens:signup.errors.invalidEmail");
            break;
          case "auth/weak-password":
            errorMessage = t("screens:signup.errors.weakPassword");
            break;
          case "auth/network-request-failed":
            errorMessage = t("screens:login.errors.networkRequestFailed");
            break;
          default:
            errorMessage = result.error?.message || errorMessage;
        }

        setModalMessage(errorMessage);
        setErrorModalVisible(true);
      }
    } catch (error) {
      console.error("Signup error:", error);
      setModalMessage(t("screens:signup.errors.generic"));
      setErrorModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    router.replace("/login");
  };

  const handleSuccessModalConfirm = () => {
    setSuccessModalVisible(false);

    // If this is email verification success or invited user success, redirect to login
    if (
      verified === "success" ||
      verified === "already" ||
      (invite && invitationProcessed)
    ) {
      router.replace("/login");
    } else if (action === "createClub") {
      // Store the club creation intent in the modal message so user knows what to do next
      // After email verification, they should log in and will be redirected to create club
      router.replace("/login");
    } else {
      // For regular signup success (pending email verification), stay on signup screen
      router.replace("/signup");
    }
  };

  const handleErrorModalClose = () => {
    setErrorModalVisible(false);
    setModalMessage("");
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>
              {t("screens:signup.createAccount")}
            </Text>
            <Text style={styles.appName}>Clubnizer</Text>
            {invitationInfo ? (
              <>
                <Text style={styles.subtitle}>
                  {youthData
                    ? `You have been invited to add ${youthData.childName} to ${invitationInfo.groupName} by ${invitationInfo.inviterName}`
                    : `You have been invited to join ${invitationInfo.groupName} by ${invitationInfo.inviterName}`}
                </Text>
                {youthData && (
                  <Text style={styles.guardianNote}>
                    Please create your own guardian account below to manage{" "}
                    {youthData.childName}&apos;s participation.
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.subtitle}>
                {t("screens:signup.joinClubnizerToday")}
              </Text>
            )}
          </View>

          <View style={styles.form}>
            <Input
              label={t("common:fullName")}
              value={fullName}
              onChangeText={setFullName}
              placeholder={t("screens:signup.fullNamePlaceholder")}
              autoCapitalize="words"
              error={fullNameError}
            />

            <Input
              label={t("common:email")}
              value={email}
              onChangeText={setEmail}
              placeholder={t("screens:signup.emailPlaceholder")}
              keyboardType="email-address"
              autoCapitalize="none"
              error={emailError}
              editable={!invitationEmail}
              helperText={
                invitationEmail
                  ? "Email is pre-filled from your invitation"
                  : undefined
              }
            />

            <Input
              label={t("common:password")}
              value={password}
              onChangeText={setPassword}
              placeholder={t("screens:signup.passwordPlaceholder")}
              secureTextEntry
              autoCapitalize="none"
              error={passwordError}
            />

            <Input
              label={t("common:confirmPassword")}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t("screens:signup.confirmPasswordPlaceholder")}
              secureTextEntry
              autoCapitalize="none"
              error={confirmPasswordError}
            />

            {/* Legal Acceptance Checkbox */}
            <Pressable
              style={styles.legalContainer}
              onPress={() => setHasAcceptedLegal(!hasAcceptedLegal)}
            >
              <View
                style={[
                  styles.checkbox,
                  hasAcceptedLegal && styles.checkboxChecked,
                ]}
              >
                {hasAcceptedLegal && (
                  <Ionicons
                    name="checkmark"
                    size={16}
                    color={theme.colors.primary}
                  />
                )}
              </View>
              <Text style={styles.legalText}>
                {t("screens:signup.legalAgreementPrefix")}{" "}
                <Text
                  style={styles.legalLink}
                  onPress={(e) => {
                    e.stopPropagation();
                    Linking.openURL(LEGAL_URLS.termsOfService);
                  }}
                >
                  {t("screens:signup.termsOfService")}
                </Text>{" "}
                {t("screens:signup.and")}{" "}
                <Text
                  style={styles.legalLink}
                  onPress={(e) => {
                    e.stopPropagation();
                    Linking.openURL(LEGAL_URLS.privacyPolicy);
                  }}
                >
                  {t("screens:signup.privacyPolicy")}
                </Text>
              </Text>
            </Pressable>

            <View style={styles.buttonContainer}>
              <Button
                label={t("screens:signup.createAccount")}
                onPress={handleSignUp}
                theme="primary"
                loading={loading}
                disabled={loading}
              />

              <Button
                label={t("screens:signup.signInLink")}
                onPress={handleBackToLogin}
                theme="secondary"
                disabled={loading}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmationModal
        visible={successModalVisible}
        title={t("common:success")}
        message={modalMessage}
        confirmText={t("common:continue")}
        cancelText=""
        onConfirm={handleSuccessModalConfirm}
        onCancel={handleSuccessModalConfirm}
        confirmButtonTheme="primary"
      />

      <ConfirmationModal
        visible={errorModalVisible}
        title={t("screens:signup.signUpFailed")}
        message={modalMessage}
        confirmText={t("common:ok")}
        cancelText=""
        onConfirm={handleErrorModalClose}
        onCancel={handleErrorModalClose}
        confirmButtonTheme="primary"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: theme.layout.containerPadding,
  },
  header: {
    alignItems: "center",
    marginBottom: theme.spacing.xxl,
  },
  title: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.normal,
  },
  appName: {
    fontSize: theme.typography.fontSize.xxlarge,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.bold,
    marginVertical: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginTop: theme.spacing.sm,
  },
  guardianNote: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    textAlign: "center",
    marginTop: theme.spacing.md,
    fontStyle: "italic",
    paddingHorizontal: theme.spacing.md,
  },
  form: {
    width: "100%",
  },
  buttonContainer: {
    marginTop: theme.spacing.lg,
  },
  legalContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.inputBorder,
    marginRight: theme.spacing.sm,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  legalText: {
    flex: 1,
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  legalLink: {
    color: theme.colors.accent,
    textDecorationLine: "underline",
  },
});
