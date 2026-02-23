// Stripe Return Screen - Landing page after Stripe onboarding
// User is redirected here after completing or leaving Stripe's hosted onboarding

import Button from "@/components/Button";
import { theme } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function StripeReturnScreen() {
  const { clubId, clubName } = useLocalSearchParams();
  const [countdown, setCountdown] = useState(5);

  const handleContinue = () => {
    if (clubId) {
      router.replace({
        pathname: "/stripe-onboarding",
        params: { clubId: clubId as string, clubName: clubName as string },
      } as any);
    } else {
      router.replace("/(tabs)");
    }
  };

  // Auto-redirect after countdown
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      if (clubId) {
        router.replace({
          pathname: "/stripe-onboarding",
          params: { clubId: clubId as string, clubName: clubName as string },
        } as any);
      } else {
        router.replace("/(tabs)");
      }
    }
  }, [countdown, clubId, clubName]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <Ionicons
            name="checkmark-circle"
            size={80}
            color={theme.colors.success}
          />
        </View>

        {/* Title */}
        <Text style={styles.title}>Welcome Back!</Text>
        <Text style={styles.subtitle}>
          You&apos;ve returned from Stripe. Let&apos;s check your account
          status.
        </Text>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons
            name="information-circle"
            size={24}
            color={theme.colors.secondary}
          />
          <Text style={styles.infoText}>
            If you completed all the steps in Stripe, your account should be
            ready. Otherwise, you can continue where you left off.
          </Text>
        </View>

        {/* Countdown */}
        <Text style={styles.countdown}>
          Redirecting in {countdown} seconds...
        </Text>

        {/* Button */}
        <View style={styles.buttonContainer}>
          <Button
            label="Continue Now"
            onPress={handleContinue}
            theme="primary"
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
    marginBottom: 24,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 12,
    lineHeight: 20,
  },
  countdown: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 24,
  },
  buttonContainer: {
    width: "100%",
  },
});
