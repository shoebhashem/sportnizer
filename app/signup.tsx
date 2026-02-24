import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import Input from "@/components/Input";
import { theme } from "@/constants/theme";
import { functions } from "@/services/core/firebase";
import { router, useLocalSearchParams } from "expo-router";
import { httpsCallable } from "firebase/functions";
import React, { useEffect, useState } from "react";
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { signUpUser } from "../services/auth/authService";
import { addRegularMemberToGroupService } from "../services/orchestration/addRegularMemberToGroup";

export default function SignupScreen() {
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
        "✅ Email verified successfully!\n\nYour account is now activated. You can now sign in to your Sportnizer account.",
      );
      setSuccessModalVisible(true);
    } else if (verified === "already") {
      setModalMessage(
        "✅ Email already verified!\n\nYour account is already activated. You can sign in to your Sportnizer account.",
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
      setFullNameError("Full name is required");
      isValid = false;
    } else if (fullName.trim().length < 2) {
      setFullNameError("Full name must be at least 2 characters");
      isValid = false;
    }

    // Validate email
    if (!email.trim()) {
      setEmailError("Email is required");
      isValid = false;
    } else if (!validateEmail(email)) {
      setEmailError("Please enter a valid email address");
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
      setPasswordError("Password is required");
      isValid = false;
    } else if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      isValid = false;
    }

    // Validate confirm password
    if (!confirmPassword.trim()) {
      setConfirmPasswordError("Please confirm your password");
      isValid = false;
    } else if (password !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match");
      isValid = false;
    }

    return isValid;
  };

  const handleSignUp = async () => {
    if (!validateForm()) return;

    setLoading(true);

    try {
      console.log("🚀 Starting signup process with invitation token:", invite);
      // Pass invitation token to signUpUser to skip email verification for invited users
      const result = await signUpUser(
        email.trim(),
        password,
        fullName.trim(),
        invite || undefined,
      );

      console.log("📊 Signup result:", result);

      if (result.success && result.user) {
        if (invite && !result.requiresEmailVerification) {
          // Invited user account created, now process membership via unified orchestration service
          try {
            console.log("✅ Account created. Processing invitation...");

            // YOUTH INVITATION: Create youth document first, then process invitation
            if (
              invitationInfo?.invitationType === "youth_member" &&
              youthData
            ) {
              console.log("👶 Creating youth member document...");

              const createYouthFn = httpsCallable(
                functions,
                "createYouthMemberDocument",
              );
              const youthResult = await createYouthFn({
                guardianUid: result.user.uid,
                guardianEmail: result.user.email || email.trim(),
                guardianName: fullName.trim(),
                childName: youthData.childName,
                dateOfBirth: youthData.dateOfBirth,
                relationship: youthData.relationship,
              });

              const youthResponse = youthResult.data as any;
              if (!youthResponse.success) {
                throw new Error(
                  youthResponse.error || "Failed to create youth member",
                );
              }

              console.log(
                "✅ Youth member document created:",
                youthResponse.youthUid,
              );

              // Now process the invitation with the youth's userId and guardian info
              const invitationResult =
                await addRegularMemberToGroupService.processInvitationAfterUserResponse(
                  invite, // invitationToken
                  youthResponse.youthUid, // Use youth's userId, not guardian's
                  "accept", // action
                  {
                    // guardianInfo to avoid permission issues
                    guardianUid: result.user.uid,
                    guardianEmail: result.user.email || email.trim(),
                    guardianName: fullName.trim(),
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
                `🎉 Welcome to Sportnizer!\n\n` +
                  `${youthData.childName} has been added to ${invitationInfo.groupName}.\n\n` +
                  `You can now manage their membership!`,
              );
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
                validation?.invitationData?.groupName || "the group";

              setModalMessage(
                `🎉 Welcome to Sportnizer!\n\n` +
                  `You've been added to ${groupName}.\n\n` +
                  `You can now access all features immediately!`,
              );
              setSuccessModalVisible(true);
            }
          } catch (invitationError) {
            console.error("❌ Error processing invitation:", invitationError);
            // User account was created successfully, but membership failed
            const errorContext = youthData
              ? `adding ${youthData.childName} to the group`
              : "adding you to the group";
            setModalMessage(
              `Account created successfully!\n\n` +
                `However, there was an issue ${errorContext}. ` +
                `Please contact ${invitationInfo?.inviterName || "the group admin"} for assistance.`,
            );
            setSuccessModalVisible(true);
          }

          return; // Exit early - don't show regular signup message
        }

        // Regular signup flow
        let successMessage = result.message || "Account created successfully!";

        // If this is club creation flow, update the message
        if (action === "createClub" && result.requiresEmailVerification) {
          successMessage =
            result.message +
            `\n\nAfter verifying your email and logging in, you'll be able to create your club.`;
        }

        // If there is an invitation token and regular email verification is required, inform user
        if (invite && result.requiresEmailVerification) {
          // Update message to mention invitation will be processed after verification
          successMessage =
            result.message +
            `\n\nAfter verifying your email, your invitation to ${invitationInfo?.groupName || "the group"} will be automatically processed.`;
        }

        setModalMessage(successMessage);
        setSuccessModalVisible(true);
      } else {
        // Show error
        let errorMessage = "An error occurred. Please try again.";

        switch (result.error?.code) {
          case "auth/email-already-in-use":
            errorMessage = "An account with this email already exists.";
            break;
          case "auth/invalid-email":
            errorMessage = "Invalid email address.";
            break;
          case "auth/weak-password":
            errorMessage =
              "Password is too weak. Please choose a stronger password.";
            break;
          case "auth/network-request-failed":
            errorMessage = "Network error. Please check your connection.";
            break;
          default:
            errorMessage = result.error?.message || errorMessage;
        }

        setModalMessage(errorMessage);
        setErrorModalVisible(true);
      }
    } catch (error) {
      console.error("Signup error:", error);
      setModalMessage("An unexpected error occurred. Please try again.");
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
      (invite && modalMessage.includes("🎉 Welcome to Sportnizer"))
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
            <Text style={styles.title}>Join</Text>
            <Text style={styles.appName}>Sportnizer</Text>
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
                Create your account to get started
              </Text>
            )}
          </View>

          <View style={styles.form}>
            <Input
              label="Full Name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Enter your full name"
              autoCapitalize="words"
              error={fullNameError}
            />

            <Input
              label="Email Address"
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
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
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Create a password"
              secureTextEntry
              autoCapitalize="none"
              error={passwordError}
            />

            <Input
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm your password"
              secureTextEntry
              autoCapitalize="none"
              error={confirmPasswordError}
            />

            <View style={styles.buttonContainer}>
              <Button
                label="Create Account"
                onPress={handleSignUp}
                theme="primary"
                loading={loading}
                disabled={loading}
              />

              <Button
                label="Back to Sign In"
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
        title="Account Created!"
        message={modalMessage}
        confirmText="Continue"
        cancelText=""
        onConfirm={handleSuccessModalConfirm}
        onCancel={handleSuccessModalConfirm}
        confirmButtonTheme="primary"
      />

      <ConfirmationModal
        visible={errorModalVisible}
        title="Sign Up Error"
        message={modalMessage}
        confirmText="OK"
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
});
