import AdContainer from "@/components/AdContainer";
import Button from "@/components/Button";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { router } from "expo-router";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    query,
    where,
} from "firebase/firestore";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    FlatList,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Group {
  id: string;
  name: string;
  sportType: string;
  location: string;
  createdBy: string;
  ageGroup?: number; // 1=children, 2=adults, 3=mixed
}

interface Member {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
  status: "active" | "pending";
  joinedAt?: Date;
}

export default function ManageTeamsScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);

  // Load user's groups from Firestore
  useEffect(() => {
    const loadUserGroups = async () => {
      if (!user?.uid) return;

      try {
        setLoading(true);
        const db = getFirestore();

        // Query groups where user is the creator OR a member
        const createdGroupsQuery = query(
          collection(db, "groups"),
          where("createdBy", "==", user.uid),
        );

        const createdGroupsSnapshot = await getDocs(createdGroupsQuery);
        const userGroups: Group[] = [];

        createdGroupsSnapshot.forEach((doc) => {
          const groupData = doc.data();
          userGroups.push({
            id: doc.id,
            name: groupData.name,
            sportType: groupData.sportType,
            location: groupData.location,
            createdBy: groupData.createdBy,
          });
        });

        // TODO: Also query groups where user is a member (not creator)
        // This would require checking the members subcollection

        setGroups(userGroups);
        if (userGroups.length > 0) {
          setSelectedGroupId(userGroups[0].id);
        }
      } catch (error) {
        console.error("Error loading groups:", error);
      } finally {
        setLoading(false);
      }
    };

    loadUserGroups();
  }, [user]);

  const loadMembers = useCallback(async (groupId: string) => {
    if (!groupId) return;

    setMembersLoading(true);
    try {
      const db = getFirestore();

      // First get the group data to know who the owner is
      const groupDoc = await getDoc(doc(db, "groups", groupId));
      const groupData = groupDoc.exists() ? groupDoc.data() : null;
      const ownerId = groupData?.createdBy;

      // Get members from the group's members subcollection
      const membersQuery = query(collection(db, "groups", groupId, "members"));
      const membersSnapshot = await getDocs(membersQuery);

      const groupMembers: Member[] = [];

      // For each member, get their user data
      for (const memberDoc of membersSnapshot.docs) {
        const memberData = memberDoc.data();
        const userId = memberDoc.id;

        // Get user details from users collection
        const userDoc = await getDoc(doc(db, "users", userId));

        if (userDoc.exists()) {
          const userData = userDoc.data();

          // Determine role: owner, admin, or member
          let role: "owner" | "admin" | "member" = "member";
          if (userId === ownerId) {
            role = "owner";
          } else if (memberData.role === "admin") {
            role = "admin";
          }

          groupMembers.push({
            id: userId,
            name: userData.name || userData.email?.split("@")[0] || "User",
            email: userData.email || "No email",
            role: role,
            status: "active",
            joinedAt: memberData.joinedAt?.toDate(),
          });
        } else {
          // Handle case where user document doesn't exist (shouldn't happen, but safety first)
          console.warn(`User document not found for member: ${userId}`);
        }
      }

      // Sort members: owner first, then admins, then members
      groupMembers.sort((a, b) => {
        if (a.role === "owner") return -1;
        if (b.role === "owner") return 1;
        if (a.role === "admin" && b.role === "member") return -1;
        if (b.role === "admin" && a.role === "member") return 1;
        return 0;
      });

      setMembers(groupMembers);
    } catch (error) {
      console.error("Error loading members:", error);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedGroupId) {
      loadMembers(selectedGroupId);
    }
  }, [selectedGroupId, loadMembers]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const isOwnerOrAdmin =
    selectedGroup &&
    (selectedGroup.createdBy === user?.uid ||
      members.find((m) => m.id === user?.uid)?.role === "admin");

  const handleAddMembers = () => {
    if (!selectedGroup || !user) return;

    const groupName = encodeURIComponent(selectedGroup.name);
    const userName = encodeURIComponent(
      user.displayName || user.email?.split("@")[0] || "Team Admin",
    );

    // Navigate to add members screen with the selected group ID, name, and inviter name
    router.push(
      `/addmembers?groupId=${selectedGroupId}&groupName=${groupName}&inviterName=${userName}` as any,
    );
  };

  const handleMemberPress = (member: Member) => {
    // Show member details modal or navigate to member details (to be implemented)
    alert(`Member details for ${member.name || member.email} coming soon!`);
  };

  const renderMember = ({ item }: { item: Member }) => (
    <TouchableOpacity
      style={styles.memberItem}
      onPress={() => handleMemberPress(item)}
    >
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>
          {item.name || item.email}
          {item.id === user?.uid && ` (${t("common:you")})`}
        </Text>
        <Text style={styles.memberEmail}>{item.email}</Text>
        <View style={styles.memberMeta}>
          <View style={[styles.roleTag, styles[`${item.role}Role`]]}>
            <Text style={styles.roleText}>{item.role.toUpperCase()}</Text>
          </View>
          <View style={[styles.statusTag, styles[`${item.status}Status`]]}>
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>
            {t("screens:manageteams.loadingTeams")}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (groups.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>
            {t("screens:manageteams.noTeamsFound")}
          </Text>
          <Text style={styles.emptySubtitle}>
            {t("screens:manageteams.noTeamsMessage")}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.groupTabs}
          contentContainerStyle={styles.groupTabsContent}
        >
          {groups.map((group) => (
            <TouchableOpacity
              key={group.id}
              style={[
                styles.groupTab,
                selectedGroupId === group.id && styles.selectedGroupTab,
              ]}
              onPress={() => setSelectedGroupId(group.id)}
            >
              <Text
                style={[
                  styles.groupTabText,
                  selectedGroupId === group.id && styles.selectedGroupTabText,
                ]}
              >
                {group.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {isOwnerOrAdmin && (
          <Button
            label={t("screens:manageteams.addMembers")}
            theme="primary"
            onPress={handleAddMembers}
          />
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>
          {t("screens:manageteams.teamMembers", { count: members.length })}
        </Text>

        {membersLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={theme.colors.secondary} />
          </View>
        ) : (
          <FlatList
            data={members}
            keyExtractor={(item) => item.id}
            renderItem={renderMember}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.membersList}
          />
        )}
      </View>

      <AdContainer position="bottom" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  header: {
    paddingHorizontal: theme.layout.containerPadding,
    paddingVertical: theme.spacing.md,
  },
  groupTabs: {
    marginBottom: theme.spacing.md,
  },
  groupTabsContent: {
    paddingHorizontal: theme.spacing.sm,
  },
  groupTab: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    marginRight: theme.spacing.sm,
    borderRadius: theme.borderRadius.medium,
    backgroundColor: theme.colors.inputBackground,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  selectedGroupTab: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  groupTabText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
  },
  selectedGroupTabText: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.layout.containerPadding,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.md,
  },
  membersList: {
    paddingBottom: theme.spacing.xl,
  },
  memberItem: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.xs,
  },
  memberEmail: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  memberMeta: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  roleTag: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.small,
    alignSelf: "flex-start",
  },
  ownerRole: {
    backgroundColor: "#FFD700",
  },
  adminRole: {
    backgroundColor: "#FF6B6B",
  },
  memberRole: {
    backgroundColor: theme.colors.secondary,
  },
  roleText: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
  },
  statusTag: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.small,
    alignSelf: "flex-start",
  },
  activeStatus: {
    backgroundColor: "#4CAF50",
  },
  pendingStatus: {
    backgroundColor: "#FF9800",
  },
  statusText: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.layout.containerPadding,
  },
  emptyTitle: {
    fontSize: theme.typography.fontSize.xlarge,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  emptySubtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: theme.spacing.xl,
    lineHeight: 22,
  },
});
