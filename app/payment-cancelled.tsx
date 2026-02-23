// Payment Cancelled Screen - Landing page after cancelled Stripe Checkout
// User is redirected here if they cancel or close payment

import Button from "@/components/Button";
import { theme } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PaymentCancelledScreen() {
  // payment_id param available for verification if needed
  useLocalSearchParams<{ payment_id?: string }>();
  const [countdown, setCountdown] = useState(5);

  const handleContinue = () => {
    router.replace("/(tabs)");
  };

  // Auto-redirect after countdown
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      router.replace("/(tabs)");
    }
  }, [countdown]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconContainer}>
          <Ionicons
            name="close-circle"
            size={100}
            color={theme.colors.warning}
          />
        </View>

        {/* Title */}
        <Text style={styles.title}>Payment Cancelled</Text>
        <Text style={styles.subtitle}>
          No worries! Your payment was not processed and you haven&apos;t been
          charged.
        </Text>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons
            name="information-circle"
            size={24}
            color={theme.colors.secondary}
          />
          <Text style={styles.infoText}>
            You can pay this fee anytime from your home screen. The payment
            request will remain active until you complete it.
          </Text>
        </View>

        {/* Countdown */}
        <Text style={styles.countdown}>
          Returning to app in {countdown} seconds...
        </Text>

        {/* Continue Button */}
        <Button
          label="Return to Home"
          onPress={handleContinue}
          theme="primary"
        />
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
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  iconContainer: {
    marginBottom: 24,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#FFFBEB",
    justifyContent: "center",
    alignItems: "center",
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
    alignItems: "flex-start",
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  countdown: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 24,
  },
});
