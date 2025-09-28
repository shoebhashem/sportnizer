import AdContainer from "@/components/AdContainer";
import Button from "@/components/Button";
import { theme } from "@/constants/theme";
import { useUserClubs, useUserProfile } from "@/contexts/UserContext";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function GroupsScreen() {
const { isLoading } = useUserProfile();
const clubs = useUserClubs();
const [selectedClub, setSelectedClub] = useState<string | null>(null);

const handleCreateGroup = () => {
router.push("/create-group");
};

if (isLoading) {
return (
<SafeAreaView style={styles.container}>
<Text style={styles.loadingText}>Loading clubs...</Text>
</SafeAreaView>
);
}

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
        You haven&apos;t joined any clubs yet. Create your groups and
        organize your sport activities!
      </Text>
    ) : (
      clubs.map((club) => (
        <TouchableOpacity
          key={club.clubId}
          style={[
            styles.clubCard,
            selectedClub === club.clubName && styles.clubCardSelected,
          ]}
          onPress={() => setSelectedClub(club.clubName)}
        >
          <Text
            style={[
              styles.clubName,
              selectedClub === club.clubName && styles.clubNameSelected,
            ]}
          >
            {club.clubName}
          </Text>
        </TouchableOpacity>
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
clubCardSelected: {
backgroundColor: theme.colors.success, // highlight when selected
},
clubName: {
color: theme.colors.primary,
fontWeight: "600",
fontSize: theme.typography.fontSize.medium,
},
clubNameSelected: {
color: theme.colors.white,
},
noClubsText: {
textAlign: "center",
color: theme.colors.textSecondary,
fontSize: theme.typography.fontSize.medium,
marginTop: theme.spacing.lg,
},
loadingText: {
textAlign: "center",
marginTop: theme.spacing.lg,
color: theme.colors.textSecondary,
fontSize: theme.typography.fontSize.medium,
},
});