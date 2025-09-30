//import AdContainer from "@/components/AdContainer";
import Button from "@/components/Button";
import { theme } from "@/constants/theme";
import { useUserClubs, useUserGroups, useUserProfile } from "@/contexts/UserContext";
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
const groups = useUserGroups();
const [selectedClub, setSelectedClub] = useState<string | null>(null);

// Helper function to get groups for a specific club
const getGroupsForClub = (clubId: string) => {
  return groups.filter(group => group.clubId === clubId);
};

const handleCreateGroup = () => {
  router.push("/create-group");
};

const handleGroupPress = (groupId: string, clubId: string) => {
  router.push(`/manage-group?groupId=${groupId}&clubId=${clubId}`);
};if (isLoading) {
return (
<SafeAreaView style={styles.container}>
<Text style={styles.loadingText}>Loading clubs and groups...</Text>
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
      clubs.map((club) => {
        const clubGroups = getGroupsForClub(club.clubId);
        const isSelected = selectedClub === club.clubId;
        
        return (
          <View key={club.clubId} style={styles.clubSection}>
            <TouchableOpacity
              style={[
                styles.clubCard,
                isSelected && styles.clubCardSelected,
              ]}
              onPress={() => setSelectedClub(isSelected ? null : club.clubId)}
            >
              <View style={styles.clubHeader}>
                <Text
                  style={[
                    styles.clubName,
                    isSelected && styles.clubNameSelected,
                  ]}
                >
                  {club.clubName}
                </Text>
                <Text style={styles.groupCount}>
                  {clubGroups.length} group{clubGroups.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </TouchableOpacity>
            
            {/* Show groups when club is selected */}
            {isSelected && clubGroups.length > 0 && (
              <View style={styles.groupsContainer}>
                {clubGroups.map((group) => (
                  <TouchableOpacity 
                    key={group.groupId} 
                    style={styles.groupCard}
                    onPress={() => handleGroupPress(group.groupId, club.clubId)}
                  >
                    <Text style={styles.groupName}>{group.groupName}</Text>
                    <Text style={styles.groupRole}>
                      Role: {group.roles.join(', ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            
            {/* Show message when club is selected but has no groups */}
            {isSelected && clubGroups.length === 0 && (
              <View style={styles.noGroupsContainer}>
                <Text style={styles.noGroupsText}>
                  No groups in this club yet. Create your first group!
                </Text>
              </View>
            )}
          </View>
        );
      })
    )}
  </ScrollView>

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
    gap: theme.spacing.md,
  },
  clubSection: {
    marginBottom: theme.spacing.sm,
  },
  clubCard: {
    backgroundColor: theme.colors.secondary,
    padding: theme.spacing.md,
    borderRadius: 12,
  },
  clubCardSelected: {
    backgroundColor: theme.colors.success,
  },
  clubHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  clubName: {
    color: theme.colors.primary,
    fontWeight: "600",
    fontSize: theme.typography.fontSize.medium,
    flex: 1,
  },
  clubNameSelected: {
    color: theme.colors.primary,
  },
  groupCount: {
    color: theme.colors.primary,
    fontSize: theme.typography.fontSize.small,
    opacity: 0.8,
  },
  groupsContainer: {
    marginTop: theme.spacing.sm,
    paddingLeft: theme.spacing.md,
  },
  groupCard: {
    backgroundColor: theme.colors.white,
    padding: theme.spacing.md,
    borderRadius: 8,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.secondary,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  groupName: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: "500",
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  groupRole: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  noGroupsContainer: {
    marginTop: theme.spacing.sm,
    paddingLeft: theme.spacing.md,
  },
  noGroupsText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    fontStyle: "italic",
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