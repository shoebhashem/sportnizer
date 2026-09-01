import Ionicons from "@react-native-vector-icons/ionicons/static";
import * as Linking from "expo-linking";
import React from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import {
    CURRENT_PRIVACY_VERSION,
    CURRENT_TERMS_VERSION,
    LEGAL_URLS,
} from "../constants/legal";
import { theme } from "../constants/theme";
import { useUser } from "../contexts/UserContext";

interface LegalSettingsSectionProps {
  showAcceptanceStatus?: boolean;
}

export default function LegalSettingsSection({
  showAcceptanceStatus = true,
}: LegalSettingsSectionProps) {
  const { t } = useTranslation(["components", "common"]);
  const { userProfile } = useUser();

  const acceptedTermsVersion = userProfile?.legalAcceptance?.termsVersion;
  const acceptedPrivacyVersion = userProfile?.legalAcceptance?.privacyVersion;
  const acceptedAt = userProfile?.legalAcceptance?.acceptedAt;

  const termsUpToDate = acceptedTermsVersion === CURRENT_TERMS_VERSION;
  const privacyUpToDate = acceptedPrivacyVersion === CURRENT_PRIVACY_VERSION;

  const formatDate = (timestamp: any): string => {
    if (!timestamp) return "Unknown";
    try {
      const date = timestamp.toDate?.() || new Date(timestamp._seconds * 1000);
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Unknown";
    }
  };

  const openLink = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch (error) {
      console.error("Error opening link:", error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t("components:legalSettingsSection.legal")}</Text>

      {/* Terms of Service */}
      <TouchableOpacity
        style={styles.legalItem}
        onPress={() => openLink(LEGAL_URLS.termsOfService)}
        activeOpacity={0.7}
      >
        <View style={styles.legalItemContent}>
          <Ionicons
            name="document-text-outline"
            size={20}
            color={theme.colors.secondary}
          />
          <View style={styles.legalItemText}>
            <Text style={styles.legalItemTitle}>{t("components:legalSettingsSection.termsOfService")}</Text>
            <Text style={styles.legalItemSubtitle}>
              {t("components:legalSettingsSection.version", { version: CURRENT_TERMS_VERSION })}
            </Text>
          </View>
        </View>
        <View style={styles.legalItemRight}>
          {showAcceptanceStatus && acceptedTermsVersion && (
            <View
              style={[
                styles.statusBadge,
                termsUpToDate ? styles.statusCurrent : styles.statusOutdated,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  termsUpToDate
                    ? styles.statusTextCurrent
                    : styles.statusTextOutdated,
                ]}
              >
                {termsUpToDate ? t("components:legalSettingsSection.accepted") : t("components:legalSettingsSection.updateRequired")}
              </Text>
            </View>
          )}
          <Ionicons
            name="chevron-forward"
            size={20}
            color={theme.colors.textSecondary}
          />
        </View>
      </TouchableOpacity>

      {/* Privacy Policy */}
      <TouchableOpacity
        style={styles.legalItem}
        onPress={() => openLink(LEGAL_URLS.privacyPolicy)}
        activeOpacity={0.7}
      >
        <View style={styles.legalItemContent}>
          <Ionicons
            name="shield-checkmark-outline"
            size={20}
            color={theme.colors.secondary}
          />
          <View style={styles.legalItemText}>
            <Text style={styles.legalItemTitle}>{t("components:legalSettingsSection.privacyPolicy")}</Text>
            <Text style={styles.legalItemSubtitle}>
              {t("components:legalSettingsSection.version", { version: CURRENT_PRIVACY_VERSION })}
            </Text>
          </View>
        </View>
        <View style={styles.legalItemRight}>
          {showAcceptanceStatus && acceptedPrivacyVersion && (
            <View
              style={[
                styles.statusBadge,
                privacyUpToDate ? styles.statusCurrent : styles.statusOutdated,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  privacyUpToDate
                    ? styles.statusTextCurrent
                    : styles.statusTextOutdated,
                ]}
              >
                {privacyUpToDate ? t("components:legalSettingsSection.accepted") : t("components:legalSettingsSection.updateRequired")}
              </Text>
            </View>
          )}
          <Ionicons
            name="chevron-forward"
            size={20}
            color={theme.colors.textSecondary}
          />
        </View>
      </TouchableOpacity>

      {/* Acceptance Info */}
      {showAcceptanceStatus && acceptedAt && (
        <View style={styles.acceptanceInfo}>
          <Ionicons
            name="checkmark-circle"
            size={14}
            color={theme.colors.success}
          />
          <Text style={styles.acceptanceText}>
            {t("components:legalSettingsSection.lastAcceptedOn", { date: formatDate(acceptedAt) })}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 12,
  },
  legalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  legalItemContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  legalItemText: {
    marginLeft: 12,
    flex: 1,
  },
  legalItemTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.text,
  },
  legalItemSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  legalItemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusCurrent: {
    backgroundColor: theme.colors.success + "20",
  },
  statusOutdated: {
    backgroundColor: theme.colors.warning + "20",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusTextCurrent: {
    color: theme.colors.success,
  },
  statusTextOutdated: {
    color: theme.colors.warning,
  },
  acceptanceInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  acceptanceText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
});
