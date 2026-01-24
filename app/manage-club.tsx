import Button from '@/components/Button';
import { getDefaultProfilePicture } from '@/constants/profilePictures';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { clubService } from '@/services/club';
import { fetchClubMembers } from '@/services/fetchClubMembers';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ClubMemberData {
  userId: string;
  name: string;
  email: string;
  photoURL?: string;
  roles: string[];
  needsGuardian?: boolean;
  clubRole?: string;
  joinedAt?: any;
}

interface ClubData {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: any;
}

export default function ManageClubScreen() {
  const { clubId } = useLocalSearchParams();
  const { user } = useAuth();
  const [club, setClub] = useState<ClubData | null>(null);
  const [members, setMembers] = useState<ClubMemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isClubAdmin, setIsClubAdmin] = useState(false);

  const fetchAllData = useCallback(async () => {
    if (!clubId || typeof clubId !== 'string') return;

    setLoading(true);
    try {
      // Fetch club data and members
      const [clubResult, membersResult] = await Promise.all([
        clubService.getClub(clubId),
        fetchClubMembers(clubId)
      ]);

      // Process club data
      if (clubResult.success && clubResult.data) {
        setClub(clubResult.data as ClubData);
        console.log('🏢 Club data:', {
          clubId: clubResult.data.id,
          clubName: clubResult.data.name,
        });
      }

      // Process members data
      const membersData: ClubMemberData[] = membersResult.success ? membersResult.members : [];
      if (!membersResult.success && membersResult.error) {
        console.error('❌ Failed to fetch club members:', membersResult.error);
      }
      console.log(`📋 Fetched ${membersData.length} members for club ${clubId}:`, membersData);
      setMembers(membersData);

      // Check if current user is club-admin
      if (user) {
        const currentUserMember = membersData.find(m => m.userId === user.uid);
        const isAdmin = currentUserMember?.clubRole === 'club-admin' || 
                       currentUserMember?.roles?.includes('club-admin') || false;
        setIsClubAdmin(isAdmin);
        console.log(`🔒 User is club admin: ${isAdmin}`);
      }
    } catch (error) {
      console.error('Error fetching club data:', error);
    } finally {
      setLoading(false);
    }
  }, [clubId, user]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchAllData();
    }, [fetchAllData])
  );

  const renderMemberItem = ({ item }: { item: ClubMemberData }) => {
    return (
      <View style={styles.memberItem}>
        <Image
          style={styles.memberAvatar}
          source={{ uri: item.photoURL || getDefaultProfilePicture(item.needsGuardian) }}
        />
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.name}</Text>
          <Text style={styles.memberRole}>
            {item.clubRole || item.roles?.join(', ') || 'member'} 
            {item.needsGuardian && ' (Child/Youth)'}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading club members...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!club) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Club not found</Text>
          <Button label="Go Back" onPress={() => router.back()} theme="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons 
              name="arrow-back" 
              size={24} 
              color={theme.colors.text} 
            />
          </TouchableOpacity>
          <Text style={styles.title}>{club.name}</Text>
          {isClubAdmin && (
            <TouchableOpacity 
              style={styles.kebabMenuButton}
              onPress={() => {
                router.push(`/club-settings?clubId=${clubId}` as any);
              }}
            >
              <Ionicons 
                name="ellipsis-vertical" 
                size={24} 
                color={theme.colors.text} 
              />
            </TouchableOpacity>
          )}
          {!isClubAdmin && <View style={styles.kebabMenuButton} />}
        </View>

        {/* Members Section */}
        <Text style={styles.sectionTitle}>Members ({members.length})</Text>
        
        {members.length > 0 ? (
          <FlatList
            data={members}
            renderItem={renderMemberItem}
            keyExtractor={(item) => item.userId}
            scrollEnabled={false}
            style={styles.membersList}
          />
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No members in this club yet</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.layout.containerPadding,
    paddingBottom: theme.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.sm,
  },
  backButton: {
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.small,
  },
  title: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.secondary,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: theme.spacing.sm,
  },
  kebabMenuButton: {
    padding: theme.spacing.sm,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.secondary,
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  membersList: {
    marginBottom: theme.spacing.lg,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  memberAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.secondary,
    marginRight: theme.spacing.md,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  memberRole: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.layout.containerPadding,
  },
  errorText: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.error,
    marginBottom: theme.spacing.xl,
  },
  emptyState: {
    padding: theme.spacing.xl,
    alignItems: 'center',
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
