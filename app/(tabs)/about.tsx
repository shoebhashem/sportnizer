import { theme } from "@/constants/theme";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";

export default function AboutScreen() {
  const handleEmailPress = () => {
    Linking.openURL("mailto:support@sportnizer.com");
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>About Sportnizer</Text>

        <Text style={styles.paragraph}>
          Sportnizer is a clean and focused platform designed to help teams and
          clubs organize their sports activities in a simple and structured way.
        </Text>

        <Text style={styles.sectionTitle}>Built From Real Experience</Text>

        <Text style={styles.paragraph}>
          Sportnizer was created from firsthand experience in youth sports. As a
          volunteer coach and parent involved in organizing teams, training
          sessions and matches, it became clear how much time was spent managing
          logistics instead of focusing on the sport itself.
        </Text>

        <Text style={styles.paragraph}>
          Many tools felt overly complex for everyday team management.
          Sportnizer was built to simplify the essentials — managing members,
          planning events and tracking attendance — in a clear and modern way.
        </Text>

        <Text style={styles.paragraph}>
          The goal is simple: make organizing sports easier, so more time can be
          spent on the field.
        </Text>

        <Text style={styles.sectionTitle}>Continuously Improving</Text>

        <Text style={styles.paragraph}>
          Sportnizer is actively evolving and continuously improving based on
          real-world use and feedback from teams and clubs.
        </Text>

        <Text style={styles.paragraph}>
          If you experience any issues, find a bug, or have suggestions for
          improvement, we would truly appreciate hearing from you.
        </Text>

        <Text style={styles.email} onPress={handleEmailPress}>
          support@sportnizer.com
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
