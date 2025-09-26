import AdContainer from "@/components/AdContainer";
import Button from "@/components/Button";
import { theme } from "@/constants/theme";
import { useUserClubs } from "@/contexts/UserContext";
import { router } from "expo-router";
import React from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

export default function GroupsScreen() {
  const clubs = useUserClubs();

  const handleCreateGroup = () => {
    router.push('/create-group');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Groups</Text>
        <Text style={styles.subtitle}>Manage your clubs and groups</Text>
      </View>

      <View style={styles.buttonContainer}>
        <Button
          label="Create New Group / Club"
          theme="primary"
          onPress={handleCreateGroup}
        />
      </View>

      <ScrollView contentContainerStyle={styles.clubsContainer}>
        {clubs.length === 0 ? (
          <Text style={styles.noClubsText}>
            You haven&apos;t joined any clubs yet. Create your groups and organize your sport activities!
          </Text>
        ) : (
          clubs.map((club) => (
            <View key={club.clubId} style={styles.clubCard}>
              <Text style={styles.clubName}>{club.clubName}</Text>
            </View>
          ))
        )}
      </ScrollView>

      <AdContainer position="bottom" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.layout.containerPadding,
  },
  header: {
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    alignItems: "center",
  },
  title: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.secondary,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    textAlign: "center",
  },
  buttonContainer: {
    marginVertical: theme.spacing.lg,
  },
  clubsContainer: {
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  clubCard: {
    backgroundColor: theme.colors.secondary,
    padding: theme.spacing.md,
    borderRadius: 12,
  },
  clubName: {
    color: theme.colors.primary,
    fontWeight: "600",
    fontSize: theme.typography.fontSize.medium,
  },
  noClubsText: {
    textAlign: "center",
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.medium,
    marginTop: theme.spacing.lg,
  },
});
