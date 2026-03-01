// Stripe Refresh Screen - Landing page when Stripe onboarding needs restart
// User is redirected here if the onboarding link expired or session timed out

import Button from "@/components/Button";
import { theme } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function StripeRefreshScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const { clubId, clubName } = useLocalSearchParams();

  const handleRetry = () => {
    if (clubId) {
      router.replace({
        pathname: "/stripe-onboarding",
        params: { clubId: clubId as string, clubName: clubName as string },
      } as any);
    } else {
      router.replace("/(tabs)");
    }
  };

  const handleGoHome = () => {
    router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.content}>
        {/* Warning Icon */}
        <View style={styles.iconContainer}>
          <Ionicons
            name="refresh-circle"
            size={80}
            color={theme.colors.warning}
          />
        </View>

        {/* Title */}
        <Text style={styles.title}>
          {t("screens:stripeRefresh.sessionExpired")}
        </Text>
        <Text style={styles.subtitle}>
          {t("screens:stripeRefresh.sessionTimedOut")}
        </Text>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons
            name="shield-checkmark"
            size={24}
            color={theme.colors.secondary}
          />
          <Text style={styles.infoText}>
            {t("screens:stripeRefresh.securityNote")}
          </Text>
        </View>

        {/* Buttons */}
        <View style={styles.buttonContainer}>
          <Button
            label={t("screens:stripeRefresh.continueSetup")}
            onPress={handleRetry}
            theme="primary"
          />
          <View style={styles.buttonSpacer} />
          <Button
            label={t("screens:stripeRefresh.goToHome")}
            onPress={handleGoHome}
            theme="secondary"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 24,
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 12,
    lineHeight: 20,
  },
  buttonContainer: {
    width: "100%",
  },
  buttonSpacer: {
    height: 12,
  },
});
