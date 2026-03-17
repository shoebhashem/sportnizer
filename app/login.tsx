import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import Input from "@/components/Input";
import { theme } from "@/constants/theme";
import { router } from "expo-router";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation(["screens", "common"]);

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
      setEmailError(t("common:validation.requiredField"));
      isValid = false;
    } else if (!validateEmail(email)) {
      setEmailError(t("common:validation.invalidEmail"));
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

        // Navigate to main app (tabs) - the tabs layout will redirect to welcome/create-club if no clubs
        router.replace("/(tabs)");
      } else {
        // Show error
        let errorMessage = t("screens:login.errors.generic");

        switch (result.error?.code) {
          case "auth/user-not-found":
            errorMessage = t("screens:login.errors.userNotFound");
            break;
          case "auth/wrong-password":
            errorMessage = t("screens:login.errors.wrongPassword");
            break;
          case "auth/invalid-email":
            errorMessage = t("common:validation.invalidEmail");
            break;
          case "auth/email-not-verified":
            errorMessage = t("screens:login.emailNotVerifiedMessage");
            setShowResendButton(true);
            break;
          case "auth/too-many-requests":
            errorMessage = t("screens:login.errors.tooManyRequests");
            break;
          case "auth/network-request-failed":
            errorMessage = t("screens:login.errors.networkRequestFailed");
            break;
          default:
            errorMessage = result.error?.message || errorMessage;
        }

        setErrorMessage(errorMessage);
        setErrorModalVisible(true);
      }
    } catch (error) {
      console.error("Login error:", error);
      setErrorMessage(t("screens:login.errors.generic"));
      setErrorModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = () => {
    // Reset resend button state when navigating to signup
    setShowResendButton(false);
    router.push("/signup" as any);
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
            <Text style={styles.title}>{t("screens:login.welcomeBack")}</Text>
            <Text style={styles.appName}>Clubnizer</Text>
            <Text style={styles.subtitle}>
              {t("screens:login.signInToContinue")}
            </Text>
          </View>

          <View style={styles.form}>
            <Input
              label={t("common:email")}
              value={email}
              onChangeText={setEmail}
              placeholder={t("screens:login.emailPlaceholder")}
              keyboardType="email-address"
              autoCapitalize="none"
              error={emailError}
            />

            <Input
              label={t("common:password")}
              value={password}
              onChangeText={setPassword}
              placeholder={t("screens:login.passwordPlaceholder")}
              secureTextEntry
              autoCapitalize="none"
              error={passwordError}
            />

            <View style={styles.buttonContainer}>
              <Button
                label={t("common:signIn")}
                onPress={handleSignIn}
                theme="primary"
                loading={loading}
                disabled={loading}
              />

              {showResendButton && (
                <Button
                  label={t("screens:login.resendVerification")}
                  onPress={handleResendVerification}
                  theme="secondary"
                  loading={resendLoading}
                  disabled={loading || resendLoading || !email.trim()}
                />
              )}

              <Button
                label={t("common:signUp")}
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
        title={t("screens:login.signInFailed")}
        message={errorMessage}
        confirmText={t("common:ok")}
        cancelText=""
        onConfirm={handleCloseErrorModal}
        onCancel={handleCloseErrorModal}
        confirmButtonTheme="primary"
      />

      <ConfirmationModal
        visible={resendSuccessModalVisible}
        title={t("common:success")}
        message={t("screens:login.verificationResent")}
        confirmText={t("common:ok")}
        cancelText=""
        onConfirm={handleCloseResendSuccessModal}
        onCancel={handleCloseResendSuccessModal}
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
  form: {
    width: "100%",
  },
  buttonContainer: {
    marginTop: theme.spacing.lg,
  },
});
