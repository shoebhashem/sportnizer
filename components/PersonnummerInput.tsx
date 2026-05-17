/**
 * PersonnummerInput Component
 *
 * Specialized input component for Swedish personal identity numbers (personnummer).
 * Features:
 * - Auto-formatting with hyphen (YYYYMMDD-XXXX)
 * - Real-time format validation
 * - Masked display when personnummer is already stored
 * - Inline consent checkbox
 * - GDPR-compliant — never shows the full number after submission
 */

import { theme } from "@/constants/theme";
import {
    formatPersonnummerInput,

    validatePersonnummerFormat,
} from "@/services/lok/personnummerService";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

interface PersonnummerInputProps {
  /** Current input value (raw digits) */
  value: string;
  /** Called with raw digits (no formatting) */
  onChangeText: (text: string) => void;
  /** Whether the user has given consent */
  consentGiven: boolean;
  /** Called when consent checkbox is toggled */
  onConsentChange: (given: boolean) => void;
  /** If personnummer is already stored, show formatted birth date */
  existingBirthDate?: string | null;
  /** Whether the input is in "replace" mode (updating existing) */
  isReplacing?: boolean;
  /** Called when user wants to replace existing personnummer */
  onStartReplace?: () => void;
  /** Called when user cancels replacing */
  onCancelReplace?: () => void;
  /** External error message */
  error?: string;
  /** Whether the component is disabled */
  disabled?: boolean;
}

export default function PersonnummerInput({
  value,
  onChangeText,
  consentGiven,
  onConsentChange,
  existingBirthDate,
  isReplacing = false,
  onStartReplace,
  onCancelReplace,
  error,
  disabled = false,
}: PersonnummerInputProps) {
  const { t } = useTranslation(["screens", "common"]);
  const [isFocused, setIsFocused] = useState(false);

  // Format the display value
  const displayValue = formatPersonnummerInput(value);

  // Validate on the fly
  const validation =
    value.length > 0 ? validatePersonnummerFormat(value) : { valid: true };

  const showError = error || (!validation.valid && value.length >= 6);
  const errorMessage =
    error ||
    (validation.error
      ? t(`screens:lokPersonnummer.errors.${validation.error}`)
      : "");

  const handleChangeText = useCallback(
    (text: string) => {
      // Strip non-digits
      const digits = text.replace(/[^0-9]/g, "");
      // Cap at 12 digits
      onChangeText(digits.slice(0, 12));
    },
    [onChangeText],
  );

  // If personnummer already exists and not replacing, show birth date confirmation
  if (existingBirthDate && !isReplacing) {
    const formatted = existingBirthDate.length === 8
      ? `${existingBirthDate.substring(0, 4)}-${existingBirthDate.substring(4, 6)}-${existingBirthDate.substring(6, 8)}`
      : existingBirthDate;
    return (
      <View style={styles.container}>
        <Text style={styles.label}>
          {t("screens:lokPersonnummer.personnummerLabel")}
        </Text>

        <View style={[styles.maskedContainer]}>
          <Ionicons
            name="lock-closed"
            size={18}
            color={theme.colors.success}
            style={styles.lockIcon}
          />
          <Text style={styles.maskedText}>
            {t("screens:lokPersonnummer.personnummerStoredDate", { date: formatted })}
          </Text>
        </View>

        <Text style={styles.storedHelperText}>
          {t("screens:lokPersonnummer.personnummerStored")}
        </Text>

        <View style={styles.actionRow}>
          <Pressable
            style={styles.replaceButton}
            onPress={onStartReplace}
            disabled={disabled}
          >
            <Ionicons
              name="create-outline"
              size={16}
              color={theme.colors.primary}
            />
            <Text style={styles.replaceButtonText}>
              {t("screens:lokPersonnummer.replacePersonnummer")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {t("screens:lokPersonnummer.personnummerLabel")}
      </Text>

      {isReplacing && (
        <View style={styles.replacingBanner}>
          <Ionicons
            name="information-circle"
            size={16}
            color={theme.colors.accent}
          />
          <Text style={styles.replacingText}>
            {t("screens:lokPersonnummer.replacingInfo")}
          </Text>
          <Pressable onPress={onCancelReplace}>
            <Text style={styles.cancelReplaceText}>{t("common:cancel")}</Text>
          </Pressable>
        </View>
      )}

      <View
        style={[
          styles.inputContainer,
          isFocused && styles.inputContainerFocused,
          showError && styles.inputContainerError,
          disabled && styles.inputContainerDisabled,
        ]}
      >
        <TextInput
          style={[styles.input, disabled && styles.inputDisabled]}
          value={displayValue}
          onChangeText={handleChangeText}
          placeholder="YYYYMMDD-XXXX"
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType="numeric"
          maxLength={13} // 12 digits + 1 hyphen
          autoComplete="off"
          textContentType="none"
          autoCorrect={false}
          editable={!disabled}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        {value.length === 12 && validation.valid && (
          <Ionicons
            name="checkmark-circle"
            size={20}
            color={theme.colors.success}
            style={styles.validIcon}
          />
        )}
      </View>

      {showError && <Text style={styles.errorText}>{errorMessage}</Text>}

      <Text style={styles.helperText}>
        {t("screens:lokPersonnummer.personnummerHelper")}
      </Text>

      {/* Consent Checkbox */}
      <Pressable
        style={styles.consentRow}
        onPress={() => onConsentChange(!consentGiven)}
        disabled={disabled}
      >
        <View style={[styles.checkbox, consentGiven && styles.checkboxChecked]}>
          {consentGiven && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <Text style={styles.consentText}>
          {t("screens:lokPersonnummer.consentText")}
        </Text>
      </Pressable>

      <Text style={styles.consentDetail}>
        {t("screens:lokPersonnummer.consentDetail")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.inputBackground,
    paddingHorizontal: 14,
    height: 48,
  },
  inputContainerFocused: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  inputContainerError: {
    borderColor: theme.colors.error,
  },
  inputContainerDisabled: {
    backgroundColor: theme.colors.background,
    opacity: 0.6,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontFamily: "monospace",
    color: theme.colors.text,
    letterSpacing: 1.5,
  },
  inputDisabled: {
    color: theme.colors.textSecondary,
  },
  validIcon: {
    marginLeft: 8,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.error,
    marginTop: 4,
  },
  helperText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  // Masked display (existing personnummer)
  maskedContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.success,
    borderRadius: 10,
    backgroundColor: theme.colors.inputBackground,
    paddingHorizontal: 14,
    height: 48,
  },
  lockIcon: {
    marginRight: 8,
  },
  maskedText: {
    fontSize: 18,
    fontFamily: "monospace",
    color: theme.colors.text,
    letterSpacing: 1.5,
  },
  storedHelperText: {
    fontSize: 12,
    color: theme.colors.success,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    marginTop: 8,
  },
  replaceButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  replaceButtonText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: "500",
  },
  // Replacing banner
  replacingBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${theme.colors.accent}15`,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    gap: 6,
  },
  replacingText: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.accent,
  },
  cancelReplaceText: {
    fontSize: 12,
    color: theme.colors.error,
    fontWeight: "600",
  },
  // Consent
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 16,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  consentText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 18,
  },
  consentDetail: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 6,
    marginLeft: 32,
    lineHeight: 16,
  },
});
