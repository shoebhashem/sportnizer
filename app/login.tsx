import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import Input from "@/components/Input";
import InvitationModal from "@/components/InvitationModal";
import { theme } from "@/constants/theme";
import { useUser } from "@/contexts/UserContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
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
// ✅ Using functional auth service per ARCHITECTURE.md
import {
    resendVerificationEmail,
    signInUser,
} from "../services/auth/authService";

export default function LoginScreen() {
  const { invite } = useLocalSearchParams<{ invite?: string }>();
  const { refreshUserProfile, firebaseUser } = useUser();

  // Clean up expired invitations on component mount
  useEffect(() => {
    const cleanupExpiredInvitations = async () => {
      try {
        const storedInvitationString =
          await AsyncStorage.getItem("pendingInvitation");
        console.log(
          "🧹 Cleanup check - AsyncStorage value:",
          storedInvitationString,
        );

        if (storedInvitationString) {
          try {
            const storedInvitation = JSON.parse(storedInvitationString);
            if (
              storedInvitation.expiresAt &&
              Date.now() > storedInvitation.expiresAt
            ) {
              console.log(
                "🧹 Cleaning up expired invitation token on app start",
              );
              await AsyncStorage.removeItem("pendingInvitation");
            } else {
              console.log("🧹 Found valid stored invitation on app start");
            }
          } catch {
            // If parsing fails, it's probably an old format token, leave it for now
            console.log("🧹 Found legacy invitation format on app start");
          }
        } else {
          console.log("🧹 No stored invitation found during cleanup");
        }
      } catch (error) {
        console.error("❌ Error during invitation cleanup:", error);
      }
    };

    cleanupExpiredInvitations();
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [resendSuccessModalVisible, setResendSuccessModalVisible] =
    useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [showResendButton, setShowResendButton] = useState(false);
  const [invitationModalVisible, setInvitationModalVisible] = useState(false);
  const [invitationLoading, setInvitationLoading] = useState(false);
  const [invitationInfo, setInvitationInfo] = useState<{
    groupName: string;
    clubName?: string;
    inviterName: string;
    role?: string;
    invitationType?: string;
  } | null>(null);
  const [currentInviteToken, setCurrentInviteToken] = useState<string | null>(
    null,
  );

  // Load invitation info if invite token is present
  useEffect(() => {
    const loadInvitationInfo = async () => {
      // Check URL parameter first, then AsyncStorage as fallback
      let inviteToken = invite;

      if (!inviteToken) {
        // Check AsyncStorage for pending invitation
        console.log("🔍 No URL invite parameter, checking AsyncStorage...");
        try {
          const storedInvitationString =
            await AsyncStorage.getItem("pendingInvitation");
          console.log("🔍 AsyncStorage raw value:", storedInvitationString);

          if (storedInvitationString) {
            // Try to parse as JSON (new format with expiration)
            try {
              const storedInvitation = JSON.parse(storedInvitationString);
              console.log("🔍 Parsed stored invitation:", storedInvitation);

              // Check if token has expired
              if (
                storedInvitation.expiresAt &&
                Date.now() > storedInvitation.expiresAt
              ) {
                console.log(
                  "⚠️ Stored invitation token has expired, removing it",
                );
                await AsyncStorage.removeItem("pendingInvitation");
              } else {
                console.log("🔍 Found valid stored invitation token");
                // Decode the base64 encoded token
                try {
                  const decodedToken = atob(storedInvitation.token);
                  console.log(
                    "🔍 Decoded token:",
                    decodedToken.substring(0, 10) + "...",
                  );
                  inviteToken = decodedToken;
                } catch {
                  // If decoding fails, use token as-is (backward compatibility)
                  console.log("🔍 Using token as-is (no base64)");
                  inviteToken = storedInvitation.token;
                }
              }
            } catch {
              // Handle old format (plain string) for backward compatibility
              console.log(
                "🔍 Found legacy stored invitation token:",
                storedInvitationString,
              );
              inviteToken = storedInvitationString;
            }
          } else {
            console.log("ℹ️ No stored invitation found in AsyncStorage");
          }
        } catch (error) {
          console.error("❌ Error reading stored invitation:", error);
        }
      } else {
        console.log("🔍 Using URL invite parameter:", invite);
      }

      if (inviteToken) {
        // Basic validation - invitation tokens should be non-empty strings
        if (typeof inviteToken === "string" && inviteToken.trim().length > 0) {
          console.log(
            "🔍 Login screen processing invitation token:",
            inviteToken.substring(0, 10) + "...",
          );
          try {
            console.log("Loading invitation details for token");

            // Fetch actual invitation details
            const response = await fetch(
              `${process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL}/getInvitationDetails?token=${encodeURIComponent(inviteToken)}`,
              {
                method: "GET",
                headers: {
                  "Content-Type": "application/json",
                },
              },
            );

            console.log("✅ Invitation API response status:", response.status);
            const result = await response.json();
            console.log("✅ Invitation API response data:", result);

            if (result.success && result.invitation) {
              const invitationData = {
                groupName: result.invitation.groupName || "the group",
                clubName: result.invitation.clubName,
                inviterName: result.invitation.inviterName || "a team member",
                role: result.invitation.role, // Include role from invitation
                invitationType:
                  result.invitation.invitationType || result.invitation.type, // Include invitation type
              };
              console.log("✅ Setting invitation info:", invitationData);
              setInvitationInfo(invitationData);

              // Store the current invitation token for processing
              setCurrentInviteToken(inviteToken);
            } else {
              // Fallback to placeholder data if API fails
              console.warn(
                "⚠️ Failed to fetch invitation details, using fallback",
              );
              const fallbackData = {
                groupName: "the group",
                inviterName: "a team member",
              };
              setInvitationInfo(fallbackData);
              setCurrentInviteToken(inviteToken);
            }
          } catch (error) {
            console.error("❌ Error loading invitation info:", error);
            // Fallback to placeholder data if API fails
            const fallbackData = {
              groupName: "the group",
              inviterName: "a team member",
            };
            setInvitationInfo(fallbackData);
            setCurrentInviteToken(inviteToken);
          }
        } else {
          console.log("⚠️ Invalid invitation token format");
        }
      } else {
        console.log("ℹ️ No invitation token found in login screen");
      }
    };

    loadInvitationInfo();
  }, [invite]);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = () => {
    let isValid = true;

    // Reset errors
    setEmailError("");
    setPasswordError("");

    // Validate email
    if (!email.trim()) {
      setEmailError("Email is required");
      isValid = false;
    } else if (!validateEmail(email)) {
      setEmailError("Please enter a valid email address");
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

    return isValid;
  };

  const handleSignIn = async () => {
    if (!validateForm()) return;

    setLoading(true);

    try {
      const result = await signInUser(email.trim(), password);

      console.log("🔍 Sign in result:", {
        success: result.success,
        errorCode: result.error?.code,
        errorMessage: result.error?.message,
      });

      if (result.success) {
        // Reset resend button state on successful sign in
        setShowResendButton(false);

        console.log("🔍 Login successful. Checking invitation state:", {
          hasInvite: !!invite,
          hasCurrentInviteToken: !!currentInviteToken,
          hasInvitationInfo: !!invitationInfo,
          invite,
          currentInviteToken,
          invitationInfo,
        });

        // ✅ CRITICAL FIX: Refresh user profile to get fresh data from Firestore
        // This ensures newly added club memberships are loaded before navigation
        console.log("🔄 Refreshing user profile before navigation...");
        await refreshUserProfile();
        console.log("✅ User profile refreshed");

        // If there's an invitation token, show the invitation modal
        if ((invite || currentInviteToken) && invitationInfo) {
          console.log(
            "✅ Showing invitation modal for:",
            invitationInfo.groupName,
          );
          // Longer delay to ensure user context is fully loaded with firebaseUser
          setTimeout(() => {
            console.log(
              "🔍 Setting invitation modal visible. Current firebaseUser:",
              firebaseUser ? "exists" : "null",
            );
            setInvitationModalVisible(true);
          }, 1500);
        } else {
          console.log(
            "➡️ No invitation found, navigating to tabs or create club",
          );
          // Navigate to main app (tabs) - the tabs layout will redirect to welcome/create-club if no clubs
          router.replace("/(tabs)");
        }
      } else {
        // Show error
        let errorMessage = "An error occurred. Please try again.";

        switch (result.error?.code) {
          case "auth/user-not-found":
            errorMessage = "No account found with this email address.";
            break;
          case "auth/wrong-password":
            errorMessage = "Incorrect password. Please try again.";
            break;
          case "auth/invalid-email":
            errorMessage = "Invalid email address.";
            break;
          case "auth/email-not-verified":
            errorMessage =
              "Please verify your email address before signing in.\n\nCheck your email inbox and click the verification link to activate your account. If you don't see the email, check your spam folder.";
            setShowResendButton(true);
            break;
          case "auth/too-many-requests":
            errorMessage = "Too many failed attempts. Please try again later.";
            break;
          case "auth/network-request-failed":
            errorMessage = "Network error. Please check your connection.";
            break;
          default:
            errorMessage = result.error?.message || errorMessage;
        }

        setErrorMessage(errorMessage);
        setErrorModalVisible(true);
      }
    } catch (error) {
      console.error("Login error:", error);
      setErrorMessage("An unexpected error occurred. Please try again.");
      setErrorModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const handleInvitationAccept = async () => {
    const tokenToUse = invite || currentInviteToken;
    if (!tokenToUse || !invitationInfo) return;

    setInvitationLoading(true);

    // Wait for firebaseUser to be available (with timeout)
    let userUid = firebaseUser?.uid;
    let attempts = 0;
    const maxAttempts = 10; // 5 seconds total

    while (!userUid && attempts < maxAttempts) {
      console.log(`🔍 Waiting for firebaseUser... attempt ${attempts + 1}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      userUid = firebaseUser?.uid;
      attempts++;
    }

    console.log("🔍 Debug invitation accept:", {
      tokenToUse: tokenToUse.substring(0, 10) + "...",
      firebaseUser: firebaseUser ? "exists" : "null",
      userUid,
      attempts,
      invitationInfo,
    });

    if (!userUid) {
      setErrorMessage(
        "Unable to get user information. Please try signing in again.",
      );
      setInvitationModalVisible(false);
      setErrorModalVisible(true);
      setInvitationLoading(false);
      return;
    }

    try {
      console.log("Accepting invitation for user UID:", userUid);
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL}/respondToInvitation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            invitationToken: tokenToUse,
            uid: userUid,
            action: "accept",
          }),
        },
      );

      console.log("Response status:", response.status);
      const result = await response.json();
      console.log("Invitation acceptance result:", result);

      if (result.success) {
        console.log("Successfully joined group!");

        // Clear stored invitation after successful acceptance
        try {
          await AsyncStorage.removeItem("pendingInvitation");
          console.log("✅ Cleared stored invitation token");
        } catch (error) {
          console.error("Error clearing stored invitation:", error);
        }

        // Refresh user profile to update the groups list
        await refreshUserProfile();

        setInvitationModalVisible(false);
        // Show success message before navigating
        setErrorMessage(`Successfully joined the group! Welcome!`);
        setErrorModalVisible(true);
        // Navigate after user closes the success message
      } else {
        console.error("Failed to accept invitation:", result.error);
        setErrorMessage(
          result.error || "Failed to join group. Please try again.",
        );
        setInvitationModalVisible(false);
        setErrorModalVisible(true);
      }
    } catch (error) {
      console.error("Error accepting invitation:", error);
      setErrorMessage(
        "An error occurred while joining the group. Please try again.",
      );
      setInvitationModalVisible(false);
      setErrorModalVisible(true);
    } finally {
      setInvitationLoading(false);
    }
  };

  const handleInvitationReject = async () => {
    // Clear stored invitation when rejecting
    try {
      await AsyncStorage.removeItem("pendingInvitation");
      console.log("✅ Cleared stored invitation token after rejection");
    } catch (error) {
      console.error("Error clearing stored invitation:", error);
    }

    setInvitationModalVisible(false);
    // Navigate to main app without processing invitation
    router.replace("/(tabs)");
  };

  const handleCreateAccount = () => {
    // Reset resend button state when navigating to signup
    setShowResendButton(false);
    if (invite) {
      router.push(`/signup?invite=${encodeURIComponent(invite)}` as any);
    } else {
      router.push("/signup" as any);
    }
  };

  const handleResendVerification = async () => {
    if (!email.trim()) {
      setErrorMessage(
        "Please enter your email address to resend verification.",
      );
      setErrorModalVisible(true);
      return;
    }

    setResendLoading(true);

    try {
      const result = await resendVerificationEmail(email.trim());

      if (result.success) {
        // Show success modal instead of error modal
        setShowResendButton(false); // Hide resend button after successful send
        setResendSuccessModalVisible(true);
      } else {
        setErrorMessage(
          `❌ Failed to resend verification email.\n\n${result.error?.message || "Please try again."}`,
        );
        setErrorModalVisible(true);
      }
    } catch (error) {
      console.error("Resend error:", error);
      setErrorMessage("❌ An unexpected error occurred. Please try again.");
      setErrorModalVisible(true);
    } finally {
      setResendLoading(false);
    }
  };

  const handleCloseErrorModal = () => {
    setErrorModalVisible(false);
    // Only reset resend button state if it's a success message (verification email sent)
    if (errorMessage.includes("sent successfully")) {
      setShowResendButton(false);
    }
    // If it's a success message (contains "Successfully"), navigate to tabs
    if (errorMessage.includes("Successfully")) {
      router.replace("/(tabs)");
    }
    setErrorMessage("");
  };

  const handleCloseResendSuccessModal = () => {
    setResendSuccessModalVisible(false);
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
            <Text style={styles.title}>Welcome to</Text>
            <Text style={styles.appName}>Sportnizer</Text>
            <Text style={styles.subtitle}>
              Sign in to manage your sports groups
            </Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Email Address"
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              error={emailError}
            />

            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              secureTextEntry
              autoCapitalize="none"
              error={passwordError}
            />

            <View style={styles.buttonContainer}>
              <Button
                label="Sign In"
                onPress={handleSignIn}
                theme="primary"
                loading={loading}
                disabled={loading}
              />

              {showResendButton && (
                <Button
                  label="Resend Verification Email"
                  onPress={handleResendVerification}
                  theme="secondary"
                  loading={resendLoading}
                  disabled={loading || resendLoading || !email.trim()}
                />
              )}

              <Button
                label="Create New Account"
                onPress={handleCreateAccount}
                theme="secondary"
                disabled={loading}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmationModal
        visible={errorModalVisible}
        title="Sign In Error"
        message={errorMessage}
        confirmText="OK"
        cancelText=""
        onConfirm={handleCloseErrorModal}
        onCancel={handleCloseErrorModal}
        confirmButtonTheme="primary"
      />

      <ConfirmationModal
        visible={resendSuccessModalVisible}
        title="Verification Email Sent!"
        message={`📧 A new verification link has been sent to your email inbox.\n\nPlease check your email and click the verification link to activate your account.\n\nDon't forget to check your spam folder if you don't see the email.`}
        confirmText="OK"
        cancelText=""
        onConfirm={handleCloseResendSuccessModal}
        onCancel={handleCloseResendSuccessModal}
        confirmButtonTheme="primary"
      />

      {invitationInfo && (
        <InvitationModal
          visible={invitationModalVisible}
          groupName={invitationInfo.groupName}
          clubName={invitationInfo.clubName}
          inviterName={invitationInfo.inviterName}
          role={invitationInfo.role}
          invitationType={invitationInfo.invitationType}
          onAccept={handleInvitationAccept}
          onReject={handleInvitationReject}
          loading={invitationLoading}
        />
      )}
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
  form: {
    width: "100%",
  },
  buttonContainer: {
    marginTop: theme.spacing.lg,
  },
});
