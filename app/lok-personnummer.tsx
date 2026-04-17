/**
 * LOK Personnummer Collection Screen
 *
 * Dedicated screen for collecting Swedish personnummer for LOK-stöd reporting.
 * Follows GDPR requirements with explicit inline consent.
 *
 * This screen is accessed from the club context (not profile) because:
 * - Personnummer is collected for LOK-stöd, not general profile data
 * - The purpose must be clear and specific (GDPR)
 * - Consent is tied to the LOK reporting feature
 *
 * Flow:
 * 1. User sees explanation of why personnummer is needed
 * 2. User enters personnummer (or sees masked existing one)
 * 3. User checks consent checkbox
 * 4. Submit → encrypted server-side, only last4 returned
 * 5. User can also remove personnummer (GDPR right to erasure)
 */

import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import PersonnummerInput from "@/components/PersonnummerInput";
import { CURRENT_LOK_CONSENT_VERSION, LEGAL_URLS } from "@/constants/legal";
import { theme } from "@/constants/theme";
import { useUser } from "@/contexts/UserContext";
import {
    personnummerService,
    type PersonnummerStatus,
} from "@/services/lok/personnummerService";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Linking,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

export default function LokPersonnummerScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const { firebaseUser, userProfile } = useUser();
  const { clubId, clubName } = useLocalSearchParams<{
    clubId: string;
    clubName: string;
  }>();

  // State
  const [personnummerValue, setPersonnummerValue] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [existingStatus, setExistingStatus] =
    useState<PersonnummerStatus | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  // Alert modal state (cross-platform replacement for Alert.alert)
  const [alertModal, setAlertModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: "", message: "" });

  const showAlert = (title: string, message: string) =>
    setAlertModal({ visible: true, title, message });
  const hideAlert = () =>
    setAlertModal({ visible: false, title: "", message: "" });

  // Fetch existing personnummer status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const status = await personnummerService.getPersonnummerStatus();
        setExistingStatus(status);
      } catch (err) {
        console.error("Error fetching personnummer status:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatus();
  }, []);

  // Handle submit
  const handleSubmit = useCallback(async () => {
    if (!consentGiven) {
      setError(t("screens:lokPersonnummer.errors.consentRequired"));
      return;
    }

    const validation =
      personnummerService.validatePersonnummerFormat(personnummerValue);
    if (!validation.valid) {
      setError(t(`screens:lokPersonnummer.errors.${validation.error}`));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await personnummerService.storePersonnummer(
        personnummerValue,
        CURRENT_LOK_CONSENT_VERSION,
      );

      if (result.success) {
        // Update local state
        setExistingStatus({
          hasPersonnummer: true,
          lastFour: result.lastFour || null,
          consentVersion: CURRENT_LOK_CONSENT_VERSION,
        });
        setPersonnummerValue("");
        setConsentGiven(false);
        setIsReplacing(false);

        showAlert(
          t("screens:lokPersonnummer.successTitle"),
          t("screens:lokPersonnummer.successMessage"),
        );
      } else {
        setError(result.error || t("common:somethingWentWrong"));
      }
    } catch (err: any) {
      setError(err.message || t("common:somethingWentWrong"));
    } finally {
      setIsSubmitting(false);
    }
  }, [personnummerValue, consentGiven, t]);

  // Handle remove
  const handleRemove = useCallback(async () => {
    setIsRemoving(true);

    try {
      const result = await personnummerService.removePersonnummer();

      if (result.success) {
        setExistingStatus({
          hasPersonnummer: false,
          lastFour: null,
          consentVersion: null,
        });
        setShowRemoveModal(false);

        showAlert(
          t("screens:lokPersonnummer.removedTitle"),
          t("screens:lokPersonnummer.removedMessage"),
        );
      } else {
        showAlert(
          t("common:error"),
          result.error || t("common:somethingWentWrong"),
        );
      }
    } catch (err: any) {
      showAlert(
        t("common:error"),
        err.message || t("common:somethingWentWrong"),
      );
    } finally {
      setIsRemoving(false);
    }
  }, [t]);

  // Open privacy policy
  const openPrivacyPolicy = useCallback(() => {
    Linking.openURL(LEGAL_URLS.lokConsent);
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  const canSubmit =
    consentGiven &&
    personnummerValue.length >= 10 &&
    personnummerService.validatePersonnummerFormat(personnummerValue).valid &&
    !isSubmitting;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.headerSection}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="shield-checkmark"
                size={40}
                color={theme.colors.primary}
              />
            </View>
            <Text style={styles.title}>
              {t("screens:lokPersonnummer.title")}
            </Text>
            <Text style={styles.subtitle}>
              {t("screens:lokPersonnummer.subtitle", {
                clubName: clubName || "",
              })}
            </Text>
          </View>

          {/* Why we need it */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons
                name="information-circle"
                size={20}
                color={theme.colors.accent}
              />
              <Text style={styles.infoTitle}>
                {t("screens:lokPersonnummer.whyNeededTitle")}
              </Text>
            </View>
            <Text style={styles.infoText}>
              {t("screens:lokPersonnummer.whyNeededText")}
            </Text>

            <View style={styles.bulletPoints}>
              <View style={styles.bulletRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  {t("screens:lokPersonnummer.bullet1")}
                </Text>
              </View>
              <View style={styles.bulletRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  {t("screens:lokPersonnummer.bullet2")}
                </Text>
              </View>
              <View style={styles.bulletRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  {t("screens:lokPersonnummer.bullet3")}
                </Text>
              </View>
            </View>
          </View>

          {/* Security info */}
          <View style={styles.securityCard}>
            <View style={styles.infoRow}>
              <Ionicons
                name="lock-closed"
                size={20}
                color={theme.colors.success}
              />
              <Text style={styles.securityTitle}>
                {t("screens:lokPersonnummer.securityTitle")}
              </Text>
            </View>
            <Text style={styles.securityText}>
              {t("screens:lokPersonnummer.securityText")}
            </Text>
          </View>

          {/* Personnummer Input */}
          <View style={styles.inputSection}>
            <PersonnummerInput
              value={personnummerValue}
              onChangeText={setPersonnummerValue}
              consentGiven={consentGiven}
              onConsentChange={setConsentGiven}
              existingLastFour={existingStatus?.lastFour}
              isReplacing={isReplacing}
              onStartReplace={() => setIsReplacing(true)}
              onCancelReplace={() => {
                setIsReplacing(false);
                setPersonnummerValue("");
                setConsentGiven(false);
                setError(null);
              }}
              error={error || undefined}
              disabled={isSubmitting}
            />
          </View>

          {/* Privacy Policy Link */}
          <Text style={styles.privacyLink} onPress={openPrivacyPolicy}>
            {t("screens:lokPersonnummer.readPrivacyPolicy")}
          </Text>

          {/* Submit Button (only show when entering new personnummer) */}
          {(!existingStatus?.hasPersonnummer || isReplacing) && (
            <View style={styles.submitSection}>
              <Button
                label={
                  isSubmitting
                    ? t("common:processing")
                    : isReplacing
                      ? t("screens:lokPersonnummer.updateButton")
                      : t("screens:lokPersonnummer.saveButton")
                }
                onPress={handleSubmit}
                disabled={!canSubmit}
              />
            </View>
          )}

          {/* Remove Personnummer (GDPR right to erasure) */}
          {existingStatus?.hasPersonnummer && !isReplacing && (
            <View style={styles.removeSection}>
              <Text style={styles.removeSectionTitle}>
                {t("screens:lokPersonnummer.dataManagement")}
              </Text>
              <Button
                label={t("screens:lokPersonnummer.removeButton")}
                onPress={() => setShowRemoveModal(true)}
                theme="secondary"
              />
              <Text style={styles.removeHelperText}>
                {t("screens:lokPersonnummer.removeHelperText")}
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Remove Confirmation Modal */}
      <ConfirmationModal
        visible={showRemoveModal}
        title={t("screens:lokPersonnummer.removeModalTitle")}
        message={t("screens:lokPersonnummer.removeModalMessage")}
        confirmText={t("common:delete")}
        cancelText={t("common:cancel")}
        onConfirm={handleRemove}
        onCancel={() => setShowRemoveModal(false)}
        confirmButtonTheme="primary"
      />

      {/* Alert Modal (cross-platform replacement for Alert.alert) */}
      <ConfirmationModal
        visible={alertModal.visible}
        title={alertModal.title}
        message={alertModal.message}
        confirmText={t("common:ok")}
        onConfirm={hideAlert}
        onCancel={hideAlert}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  // Header
  headerSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${theme.colors.primary}15`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  // Info card
  infoCard: {
    backgroundColor: `${theme.colors.accent}10`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: `${theme.colors.accent}30`,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.text,
  },
  infoText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 19,
  },
  bulletPoints: {
    marginTop: 8,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 4,
  },
  bullet: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 19,
  },
  // Security card
  securityCard: {
    backgroundColor: `${theme.colors.success}10`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: `${theme.colors.success}30`,
  },
  securityTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.text,
  },
  securityText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 19,
  },
  // Input section
  inputSection: {
    marginBottom: 8,
  },
  // Privacy link
  privacyLink: {
    fontSize: 13,
    color: theme.colors.primary,
    textDecorationLine: "underline",
    textAlign: "center",
    marginBottom: 20,
  },
  // Submit
  submitSection: {
    marginBottom: 32,
  },
  // Remove
  removeSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  removeSectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 12,
  },
  removeHelperText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 8,
    lineHeight: 16,
  },
});
