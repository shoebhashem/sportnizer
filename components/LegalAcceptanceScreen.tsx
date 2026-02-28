/**
 * Legal Acceptance Screen Component
 *
 * A full-screen component for accepting Terms of Service and Privacy Policy.
 * Used in signup flow and for re-acceptance when legal documents are updated.
 */

import Button from "@/components/Button";
import { LEGAL_URLS } from "@/constants/legal";
import { theme } from "@/constants/theme";
import { useUser } from "@/contexts/UserContext";
import { legalService } from "@/services/legal/legalService";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Linking,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface LegalAcceptanceScreenProps {
  // Mode: signup (initial), re-acceptance (version update)
  mode: "signup" | "re-acceptance";

  // Version info
  termsVersion: string;
  privacyVersion: string;

  // Material changes summary (for re-acceptance)
  materialChangesSummary?: string | null;

  // Callbacks
  onAccept: () => void;
  onCancel?: () => void; // Optional - not shown in signup mode

  // Loading state
  isLoading?: boolean;
}

// Key points summary (not full legal text)
const KEY_POINTS = [
  {
    icon: "shield-checkmark-outline" as const,
    title: "Data Protection",
    description:
      "Your data is protected with appropriate security measures. Clubs manage their member data as Data Controllers.",
  },
  {
    icon: "people-outline" as const,
    title: "Club Responsibilities",
    description:
      "Club administrators determine how member data is used within their clubs and are responsible for obtaining necessary consents.",
  },
  {
    icon: "server-outline" as const,
    title: "How We Process Data",
    description:
      "Sportnizer acts as a Data Processor, handling data only as instructed by clubs to provide the service.",
  },
  {
    icon: "trash-outline" as const,
    title: "Data Retention",
    description:
      "Inactive accounts have a 30-day grace period before deletion. You can request your data anytime via support.",
  },
  {
    icon: "document-text-outline" as const,
    title: "Your Rights",
    description:
      "You have rights to access, correct, delete, and export your data. Contact your club or our support for assistance.",
  },
];

export default function LegalAcceptanceScreen({
  mode,
  termsVersion,
  privacyVersion,
  materialChangesSummary,
  onAccept,
  onCancel,
  isLoading = false,
}: LegalAcceptanceScreenProps) {
  const [hasAgreed, setHasAgreed] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState<string>("");
  const { refreshUserProfile } = useUser();

  useEffect(() => {
    // Fetch effective date
    const loadEffectiveDate = async () => {
      const config = await legalService.fetchLegalConfig();
      if (config?.termsEffectiveDate) {
        setEffectiveDate(
          legalService.formatLegalDate(config.termsEffectiveDate),
        );
      } else {
        setEffectiveDate(
          new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
        );
      }
    };
    loadEffectiveDate();
  }, []);

  const openTermsOfService = async () => {
    try {
      const url = LEGAL_URLS.termsOfService;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        console.warn("Cannot open Terms of Service URL");
      }
    } catch (error) {
      console.error("Error opening Terms of Service:", error);
    }
  };

  const openPrivacyPolicy = async () => {
    try {
      const url = LEGAL_URLS.privacyPolicy;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        console.warn("Cannot open Privacy Policy URL");
      }
    } catch (error) {
      console.error("Error opening Privacy Policy:", error);
    }
  };

  const isReAcceptance = mode === "re-acceptance";

  const handleAccept = async () => {
    await refreshUserProfile();
    onAccept();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Ionicons
            name={isReAcceptance ? "refresh-outline" : "document-text-outline"}
            size={48}
            color={theme.colors.accent}
          />
          <Text style={styles.title}>
            {isReAcceptance
              ? "Updated Terms & Privacy Policy"
              : "Terms of Service & Privacy Policy"}
          </Text>
          <Text style={styles.subtitle}>
            {isReAcceptance
              ? "We've updated our legal documents. Please review and accept to continue."
              : "Please review and accept our terms to create your account."}
          </Text>
        </View>

        {/* Material Changes Summary (Re-acceptance only) */}
        {isReAcceptance && materialChangesSummary && (
          <View style={styles.changesContainer}>
            <View style={styles.changesHeader}>
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={theme.colors.accent}
              />
              <Text style={styles.changesTitle}>What's Changed</Text>
            </View>
            <Text style={styles.changesText}>{materialChangesSummary}</Text>
          </View>
        )}

        {/* Key Points Summary */}
        <View style={styles.keyPointsContainer}>
          <Text style={styles.sectionTitle}>Key Points</Text>
          {KEY_POINTS.map((point, index) => (
            <View key={index} style={styles.keyPoint}>
              <View style={styles.keyPointIcon}>
                <Ionicons
                  name={point.icon}
                  size={24}
                  color={theme.colors.accent}
                />
              </View>
              <View style={styles.keyPointContent}>
                <Text style={styles.keyPointTitle}>{point.title}</Text>
                <Text style={styles.keyPointDescription}>
                  {point.description}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Document Links */}
        <View style={styles.linksContainer}>
          <Text style={styles.sectionTitle}>Full Documents</Text>
          <Pressable style={styles.linkButton} onPress={openTermsOfService}>
            <Ionicons
              name="document-outline"
              size={20}
              color={theme.colors.accent}
            />
            <Text style={styles.linkText}>Read Terms of Service</Text>
            <Ionicons
              name="open-outline"
              size={16}
              color={theme.colors.textSecondary}
            />
          </Pressable>
          <Pressable style={styles.linkButton} onPress={openPrivacyPolicy}>
            <Ionicons
              name="shield-outline"
              size={20}
              color={theme.colors.accent}
            />
            <Text style={styles.linkText}>Read Privacy Policy</Text>
            <Ionicons
              name="open-outline"
              size={16}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        </View>

        {/* Version and Date */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>
            Terms: {termsVersion} | Privacy: {privacyVersion}
          </Text>
          {effectiveDate && (
            <Text style={styles.versionText}>Effective: {effectiveDate}</Text>
          )}
        </View>

        {/* Agreement Checkbox */}
        <Pressable
          style={styles.checkboxContainer}
          onPress={() => setHasAgreed(!hasAgreed)}
        >
          <View style={[styles.checkbox, hasAgreed && styles.checkboxChecked]}>
            {hasAgreed && (
              <Ionicons
                name="checkmark"
                size={16}
                color={theme.colors.primary}
              />
            )}
          </View>
          <Text style={styles.checkboxLabel}>
            I have read and agree to the{" "}
            <Text style={styles.linkInline} onPress={openTermsOfService}>
              Terms of Service
            </Text>{" "}
            and{" "}
            <Text style={styles.linkInline} onPress={openPrivacyPolicy}>
              Privacy Policy
            </Text>
          </Text>
        </Pressable>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.footer}>
        {onCancel && isReAcceptance && (
          <View style={styles.buttonWrapper}>
            <Button label="Sign Out" onPress={onCancel} theme="secondary" />
          </View>
        )}
        <View style={[styles.buttonWrapper, !onCancel && styles.buttonFull]}>
          <Button
            label={isLoading ? "Please wait..." : "I Agree & Continue"}
            onPress={handleAccept}
            theme="primary"
            disabled={!hasAgreed || isLoading}
          />
        </View>
      </View>

      {/* Loading Overlay */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  header: {
    alignItems: "center",
    marginBottom: theme.spacing.xl,
  },
  title: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: "center",
    marginTop: theme.spacing.md,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginTop: theme.spacing.sm,
    lineHeight: 22,
  },
  changesContainer: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  changesHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  changesTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.accent,
    marginLeft: theme.spacing.xs,
  },
  changesText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.text,
    lineHeight: 20,
  },
  keyPointsContainer: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  keyPoint: {
    flexDirection: "row",
    marginBottom: theme.spacing.md,
  },
  keyPointIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: theme.spacing.md,
  },
  keyPointContent: {
    flex: 1,
  },
  keyPointTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    marginBottom: 2,
  },
  keyPointDescription: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  linksContainer: {
    marginBottom: theme.spacing.lg,
  },
  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  linkText: {
    flex: 1,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
  },
  versionContainer: {
    alignItems: "center",
    marginBottom: theme.spacing.lg,
  },
  versionText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.inputBorder,
    marginRight: theme.spacing.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    lineHeight: 22,
  },
  linkInline: {
    color: theme.colors.accent,
    textDecorationLine: "underline",
  },
  footer: {
    flexDirection: "row",
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
    backgroundColor: theme.colors.background,
    gap: theme.spacing.md,
  },
  buttonWrapper: {
    flex: 1,
  },
  buttonFull: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
});
