// Accounting Settings Hub Screen
// Entry point for all accounting-related configuration options.

import { theme } from "@/constants/theme";
import Ionicons from "@react-native-vector-icons/ionicons/static";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AccountingSettingsScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { clubId } = useLocalSearchParams();

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t("screens:accountingSettings.title"),
    });
  }, [navigation, t]);

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.optionsContainer}>
          {/* Chart of Accounts */}
          <TouchableOpacity
            style={styles.optionItem}
            onPress={() =>
              router.push({
                pathname: "/chart-of-accounts",
                params: { clubId: clubId as string },
              } as any)
            }
            activeOpacity={0.7}
          >
            <View style={styles.optionIcon}>
              <Ionicons
                name="list-outline"
                size={24}
                color={theme.colors.secondary}
              />
            </View>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>
                {t("screens:accountingSettings.chartOfAccounts")}
              </Text>
              <Text style={styles.optionDescription}>
                {t("screens:accountingSettings.chartOfAccountsDesc")}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.primary },
  scrollContent: { padding: theme.spacing.md, paddingBottom: 40 },
  optionsContainer: {
    gap: theme.spacing.sm,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: theme.spacing.md,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  optionDescription: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
});
