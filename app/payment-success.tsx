// Payment Success Screen - Landing page after successful Stripe Checkout
// User is redirected here after completing payment

import Button from "@/components/Button";
import { theme } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PaymentSuccessScreen() {
  // These params can be used for verification if needed
  useLocalSearchParams<{ session_id?: string; payment_id?: string }>();

  const handleContinue = () => {
    router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={100} color="#22C55E" />
        </View>

        {/* Title */}
        <Text style={styles.title}>Payment Successful!</Text>
        <Text style={styles.subtitle}>
          Thank you for your payment. Your receipt has been sent to your email.
        </Text>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons
            name="receipt-outline"
            size={24}
            color={theme.colors.secondary}
          />
          <Text style={styles.infoText}>
            The payment has been processed and the club will receive the funds
            shortly. You&apos;ll also see this payment marked as complete in
            your home screen.
          </Text>
        </View>

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
    backgroundColor: "#F0FDF4",
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
});
