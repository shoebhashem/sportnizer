/**
 * PersonnummerModal
 *
 * Modal component for collecting and managing a Swedish personnummer.
 * Supports two modes:
 *  - "self"  — the authenticated user stores their own personnummer
 *  - "child" — a legal guardian stores personnummer for a dependent
 *
 * GDPR: the full personnummer is never stored on the client. Only the
 * birth date (YYYYMMDD) is returned for display purposes.
 */

import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import PersonnummerInput from "@/components/PersonnummerInput";
import { CURRENT_LOK_CONSENT_VERSION, LEGAL_URLS } from "@/constants/legal";
import { theme } from "@/constants/theme";
import {
  getPersonnummerDisplayText,
  personnummerService,
  type PersonnummerStatus,
} from "@/services/lok/personnummerService";
import Ionicons from "@react-native-vector-icons/ionicons/static";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface PersonnummerModalProps {
  visible: boolean;
  onClose: () => void;
  /** "self" — user stores own; "child" — guardian stores for dependent */
  mode: "self" | "child";
  /** For mode="child": the dependent's userId */
  targetUserId?: string;
  /** For mode="child": the child's display name */
  childName?: string;
  /** The member's name shown in the confirmation text */
  userName: string;
}

export default function PersonnummerModal({
  visible,
  onClose,
  mode,
  targetUserId,
  childName,
  userName,
}: PersonnummerModalProps) {
  const { t } = useTranslation(["screens", "common"]);
  const insets = useSafeAreaInsets();

  const [personnummerValue, setPersonnummerValue] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [existingStatus, setExistingStatus] =
    useState<PersonnummerStatus | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRemoveModal, setShowRemoveModal] = useState(false);

  const [alertModal, setAlertModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: "", message: "" });
  const showAlert = (title: string, message: string) =>
    setAlertModal({ visible: true, title, message });
  const hideAlert = () =>
    setAlertModal({ visible: false, title: "", message: "" });

  const displayName = mode === "child" ? childName || userName : userName;

  // Load status each time modal opens
  useEffect(() => {
    if (!visible) return;
    setIsLoading(true);
    setPersonnummerValue("");
    setConsentGiven(false);
    setIsReplacing(false);
    setError(null);

    const fetchStatus = async () => {
      try {
        let status: PersonnummerStatus;
        if (mode === "child" && targetUserId) {
          status = await personnummerService.getPersonnummerStatusForDependent(
            targetUserId,
          );
        } else {
          status = await personnummerService.getPersonnummerStatus();
        }
        setExistingStatus(status);
      } catch (err) {
        console.error("Error fetching personnummer status:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatus();
  }, [visible, mode, targetUserId]);

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
      let result;
      if (mode === "child" && targetUserId) {
        result = await personnummerService.storePersonnummerForDependent(
          targetUserId,
          personnummerValue,
          CURRENT_LOK_CONSENT_VERSION,
        );
      } else {
        result = await personnummerService.storePersonnummer(
          personnummerValue,
          CURRENT_LOK_CONSENT_VERSION,
        );
      }

      if (result.success) {
        setExistingStatus({
          hasPersonnummer: true,
          birthDate: result.birthDate || null,
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
  }, [personnummerValue, consentGiven, mode, targetUserId, t]);

  const handleRemove = useCallback(async () => {
    setShowRemoveModal(false);
    try {
      let result;
      if (mode === "child" && targetUserId) {
        result =
          await personnummerService.removePersonnummerForDependent(
            targetUserId,
          );
      } else {
        result = await personnummerService.removePersonnummer();
      }

      if (result.success) {
        setExistingStatus({
          hasPersonnummer: false,
          birthDate: null,
          consentVersion: null,
        });
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
      showAlert(t("common:error"), err.message || t("common:somethingWentWrong"));
    }
  }, [mode, targetUserId, t]);

  const canSubmit =
    consentGiven &&
    personnummerValue.length >= 10 &&
    personnummerService.validatePersonnummerFormat(personnummerValue).valid &&
    !isSubmitting;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          { paddingTop: insets.top || 16, paddingBottom: insets.bottom },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {mode === "child"
              ? t("screens:lokPersonnummer.titleChild", { name: displayName })
              : t("screens:lokPersonnummer.title")}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons
              name="close"
              size={24}
              color={theme.colors.text}
            />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.secondary} />
          </View>
        ) : (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Icon + subtitle */}
              <View style={styles.headerSection}>
                <View style={styles.iconContainer}>
                  <Ionicons
                    name="shield-checkmark"
                    size={40}
                    color={theme.colors.secondary}
                  />
                </View>
                <Text style={styles.subtitle}>
                  {mode === "child"
                    ? t("screens:lokPersonnummer.subtitleChild", {
                        name: displayName,
                      })
                    : t("screens:lokPersonnummer.subtitleSelf")}
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
                  existingBirthDate={existingStatus?.birthDate}
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
              <Text
                style={styles.privacyLink}
                onPress={() => Linking.openURL(LEGAL_URLS.lokConsent)}
              >
                {t("screens:lokPersonnummer.readPrivacyPolicy")}
              </Text>

              {/* Submit */}
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

              {/* Remove (GDPR) */}
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
        )}
      </View>

      {/* Remove Confirmation */}
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

      {/* Alert Modal */}
      <ConfirmationModal
        visible={alertModal.visible}
        title={alertModal.title}
        message={alertModal.message}
        confirmText={t("common:ok")}
        onConfirm={hideAlert}
        onCancel={hideAlert}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: theme.colors.text,
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  headerSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${theme.colors.secondary}20`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
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
  inputSection: {
    marginBottom: 8,
  },
  privacyLink: {
    fontSize: 13,
    color: theme.colors.secondary,
    textDecorationLine: "underline",
    textAlign: "center",
    marginBottom: 20,
  },
  submitSection: {
    marginBottom: 32,
  },
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
