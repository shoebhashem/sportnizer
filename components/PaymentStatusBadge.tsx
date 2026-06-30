// PaymentStatusBadge Component - Display payment status in member lists
// Shows "Paid", "Not Paid", or "Overdue" status with appropriate colors

import { theme } from "@/constants/theme";
import React from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

export type PaymentStatus = "paid" | "pending" | "overdue" | "no_fee" | "cancelled";

interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  paidBy?: string | null; // Name of person who paid (for guardian payments)
  compact?: boolean; // Use smaller size for tight spaces
}

export default function PaymentStatusBadge({
  status,
  paidBy,
  compact = false,
}: PaymentStatusBadgeProps) {
  const { t } = useTranslation(["components", "common"]);

  // Don't show anything if there's no active fee
  if (status === "no_fee") {
    return null;
  }


  const getStatusConfig = () => {
    switch (status) {
      case "paid":
        return {
          label: t("components:paymentStatusBadge.paid"),
          backgroundColor: "#DCFCE7",
          textColor: "#166534",
          borderColor: "#86EFAC",
        };
      case "pending":
        return {
          label: t("components:paymentStatusBadge.notPaid"),
          backgroundColor: "#FEF9C3",
          textColor: "#854D0E",
          borderColor: "#FDE047",
        };
      case "overdue":
        return {
          label: t("components:paymentStatusBadge.overdue"),
          backgroundColor: "#FEE2E2",
          textColor: "#991B1B",
          borderColor: "#FCA5A5",
        };
      case "cancelled":
        return {
          label: t("components:paymentStatusBadge.cancelled"),
          backgroundColor: "#F3F4F6",
          textColor: "#4B5563",
          borderColor: "#D1D5DB",
        };
      default:
        return {
          label: "",
          backgroundColor: "transparent",
          textColor: theme.colors.textSecondary,
          borderColor: "transparent",
        };
    }
  };

  const config = getStatusConfig();

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.badge,
          compact && styles.badgeCompact,
          {
            backgroundColor: config.backgroundColor,
            borderColor: config.borderColor,
          },
        ]}
      >
        <Text
          style={[
            styles.label,
            compact && styles.labelCompact,
            { color: config.textColor },
          ]}
        >
          {config.label}
        </Text>
      </View>
      {/* Show who paid (for guardian payments) */}
      {status === "paid" && paidBy && !compact && (
        <Text style={styles.paidBy} numberOfLines={1}>
          {t("components:paymentStatusBadge.paidBy", { paidBy })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-end",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeCompact: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
  },
  labelCompact: {
    fontSize: 10,
  },
  paidBy: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
    maxWidth: 100,
  },
});
