import { theme } from "@/constants/theme";
import { useTranslation } from "react-i18next";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";

export default function AboutScreen() {
  const { t } = useTranslation(["screens"]);

  const handleEmailPress = () => {
    Linking.openURL("mailto:support@clubnizer.com");
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t("screens:about.title")}</Text>

        <Text style={styles.paragraph}>{t("screens:about.description")}</Text>

        <Text style={styles.sectionTitle}>
          {t("screens:about.builtFromExperienceTitle")}
        </Text>

        <Text style={styles.paragraph}>
          {t("screens:about.builtFromExperienceParagraph1")}
        </Text>

        <Text style={styles.paragraph}>
          {t("screens:about.builtFromExperienceParagraph2")}
        </Text>

        <Text style={styles.paragraph}>
          {t("screens:about.builtFromExperienceParagraph3")}
        </Text>

        <Text style={styles.paragraph}>
          {t("screens:about.builtFromExperienceParagraph4")}
        </Text>

        <Text style={styles.paragraph}>
          {t("screens:about.builtFromExperienceParagraph5")}
        </Text>

        <Text style={styles.paragraph}>
          {t("screens:about.builtFromExperienceParagraph6")}
        </Text>

        <Text style={styles.paragraph}>
          {t("screens:about.builtFromExperienceParagraph7")}
        </Text>

        <Text style={styles.sectionTitle}>
          {t("screens:about.continuouslyImprovingTitle")}
        </Text>

        <Text style={styles.paragraph}>
          {t("screens:about.continuouslyImprovingParagraph1")}
        </Text>

        <Text style={styles.paragraph}>
          {t("screens:about.continuouslyImprovingParagraph2")}
        </Text>

        <Text style={styles.email} onPress={handleEmailPress}>
          {t("screens:about.supportEmail")}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.layout.containerPadding,
  },
  content: {
    paddingVertical: theme.spacing.xxl,
  },
  title: {
    fontSize: theme.typography.fontSize.xlarge,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.xl,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },
  paragraph: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    lineHeight: 24,
    marginBottom: theme.spacing.lg,
  },
  email: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
    marginTop: theme.spacing.md,
  },
});
