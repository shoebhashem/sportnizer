// PaymentCard Component - Display pending membership fee payment
// Used on Home screen to show payment requests for user and their children

import { theme } from "@/constants/theme";
import { paymentService, type PendingPayment } from "@/services/paymentService";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

interface PaymentCardProps {
  payment: PendingPayment;
  onPaymentComplete?: () => void;
}

export default function PaymentCard({
  payment,
  onPaymentComplete,
}: PaymentCardProps) {
  const { t } = useTranslation(["components", "common"]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPaidStatus, setLocalPaidStatus] = useState(false);

  // Format amount for display
  const formattedAmount = paymentService.formatAmount(
    payment.amount,
    payment.currency,
  );

  // Format due date
  const formatDueDate = (date: Date | null): string => {
    if (!date) return t("components:paymentCard.noDueDate");

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return t("components:paymentCard.dueToday");
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return t("components:paymentCard.dueTomorrow");
    } else {
      return t("components:paymentCard.dueDate", {
        date: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year:
            date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
        }),
      });
    }
  };

  // Get days remaining text
  const getDaysRemainingText = (): string => {
    if (payment.daysRemaining === null) return "";
    if (payment.isOverdue) {
      return t("components:paymentCard.daysOverdue", { count: Math.abs(payment.daysRemaining) });
    }
    if (payment.daysRemaining === 0) return t("components:paymentCard.dueToday");
    if (payment.daysRemaining === 1) return t("components:paymentCard.oneDayRemaining");
    return t("components:paymentCard.daysRemaining", { count: payment.daysRemaining });
  };

  // Check if payment is paid (from backend status or detected locally)
  const isPaid = payment.status === "paid" || localPaidStatus;

  // Get card style based on status
  const getCardStyle = () => {
    // Paid status - green theme
    if (isPaid) {
      return {
        borderColor: "#22C55E", // Green
        backgroundColor: "#F0FDF4", // Light green
      };
    }
    if (payment.isOverdue) {
      return {
        borderColor: theme.colors.error,
        backgroundColor: "#FEF2F2",
      };
    }
    if (payment.daysRemaining !== null && payment.daysRemaining <= 7) {
      return {
        borderColor: theme.colors.warning || "#F59E0B",
        backgroundColor: "#FFFBEB",
      };
    }
    return {
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.white,
    };
  };

  // Handle pay button press
  const handlePayPress = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await paymentService.startPayment(
        payment.feeId,
        payment.beneficiaryId,
      );

      if (!result.success) {
        // Check if the error indicates fee is already paid
        const errorLower = (result.error || "").toLowerCase();
        if (
          errorLower.includes("already been paid") ||
          errorLower.includes("already paid")
        ) {
          setLocalPaidStatus(true);
          onPaymentComplete?.(); // Trigger refresh
        } else {
          setError(result.error || "Payment failed");
        }
      } else if (result.nativeBrowserClosed) {
        // Browser was dismissed after native checkout (payment succeeded or
        // was cancelled). Re-fetch from server to get accurate card state.
        onPaymentComplete?.();
      }
      // Note: The actual payment completion will be handled by webhook
      // and the component will be refreshed from the parent
    } catch (err: any) {
      // Check if the error indicates fee is already paid
      const errorMsg = err.message || "";
      const errorLower = errorMsg.toLowerCase();
      if (
        errorLower.includes("already been paid") ||
        errorLower.includes("already paid")
      ) {
        setLocalPaidStatus(true);
        onPaymentComplete?.(); // Trigger refresh
      } else {
        setError(errorMsg || "Failed to start payment");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const cardStyle = getCardStyle();

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: cardStyle.borderColor,
          backgroundColor: cardStyle.backgroundColor,
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons
            name="card"
            size={24}
            color={
              payment.isOverdue ? theme.colors.error : theme.colors.primary
            }
          />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {payment.feeTitle}
          </Text>
          <Text style={styles.subtitle}>
            {payment.clubName} → {payment.groupName}
          </Text>
        </View>
      </View>

      {/* Beneficiary (if paying for child) */}
      <View style={styles.beneficiaryRow}>
        <Text style={styles.beneficiaryLabel}>{t("components:paymentCard.for")}</Text>
        <Text style={styles.beneficiaryName}>{payment.beneficiaryName}</Text>
      </View>

      {/* Amount */}
      <View style={styles.amountRow}>
        <Text style={styles.amountLabel}>{t("components:paymentCard.amount")}</Text>
        <Text style={styles.amount}>{formattedAmount}</Text>
      </View>

      {/* Due date */}
      <View style={styles.dueDateRow}>
        <Ionicons
          name="calendar-outline"
          size={16}
          color={payment.isOverdue ? theme.colors.error : "#666"}
        />
        <Text style={[styles.dueDate, payment.isOverdue && styles.overdue]}>
          {formatDueDate(payment.dueDate)}
        </Text>
        {payment.daysRemaining !== null && (
          <Text
            style={[styles.daysRemaining, payment.isOverdue && styles.overdue]}
          >
            • {getDaysRemainingText()}
          </Text>
        )}
      </View>

      {/* Error message */}
      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={16} color={theme.colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Pay button or Paid status */}
      {isPaid ? (
        <View style={styles.paidBadge}>
          <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
          <Text style={styles.paidText}>{t("components:paymentCard.paid")}</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.payButton,
            isLoading && styles.payButtonDisabled,
            payment.isOverdue && styles.payButtonOverdue,
          ]}
          onPress={handlePayPress}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Ionicons name="card" size={18} color="white" />
              <Text style={styles.payButtonText}>
                {payment.isOverdue ? t("components:paymentCard.payNowOverdue") : t("components:paymentCard.payNow")}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// Card-specific colors for light background
const cardColors = {
  text: "#1a1d21", // Dark text on light card
  textSecondary: "#666", // Muted text on light card
  iconBg: "#f0f0f0", // Light gray for icon background
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: cardColors.iconBg,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: cardColors.text,
  },
  subtitle: {
    fontSize: 13,
    color: cardColors.textSecondary,
    marginTop: 2,
  },
  beneficiaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  beneficiaryLabel: {
    fontSize: 14,
    color: cardColors.textSecondary,
    marginRight: 8,
  },
  beneficiaryName: {
    fontSize: 14,
    fontWeight: "500",
    color: cardColors.text,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  amountLabel: {
    fontSize: 14,
    color: cardColors.textSecondary,
    marginRight: 8,
  },
  amount: {
    fontSize: 18,
    fontWeight: "700",
    color: cardColors.text,
  },
  dueDateRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  dueDate: {
    fontSize: 13,
    color: cardColors.textSecondary,
    marginLeft: 6,
  },
  daysRemaining: {
    fontSize: 13,
    color: cardColors.textSecondary,
    marginLeft: 4,
  },
  overdue: {
    color: theme.colors.error,
    fontWeight: "600",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.error,
    marginLeft: 8,
    flex: 1,
  },
  payButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  payButtonDisabled: {
    opacity: 0.7,
  },
  payButtonOverdue: {
    backgroundColor: theme.colors.error,
  },
  payButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  paidBadge: {
    backgroundColor: "#DCFCE7",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  paidText: {
    color: "#16A34A",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
});
