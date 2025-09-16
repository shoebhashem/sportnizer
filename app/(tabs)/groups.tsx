import Button from '@/components/Button';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { router, useFocusEffect } from 'expo-router';
import { collection, doc, getDoc, getDocs, getFirestore, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Group {
  id: string;
  name: string;
  ageGroup?: number; // 1=children, 2=adults, 3=mixed
}

export default function GroupsScreen() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUserGroups = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const db = getFirestore();
      
      // Get user document to check groupsJoined array
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      const userGroups: Group[] = [];
      
      // Get groups where user is the creator
      const createdGroupsQuery = query(
        collection(db, 'groups'),
        where('createdBy', '==', user.uid)
      );
      const createdGroupsSnapshot = await getDocs(createdGroupsQuery);
      
      createdGroupsSnapshot.forEach((doc) => {
        userGroups.push({
          id: doc.id,
          name: doc.data().name
        });
      });

      // Get groups where user is a member (from user's groupsJoined array)
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const groupsJoined = userData.groupsJoined || [];
        
        console.log('User groupsJoined:', groupsJoined);
        
        // Handle both old and new schema
        for (const groupItem of groupsJoined) {
          let groupId: string;
          
          // Check if it's the new GroupMembership structure or old string format
          if (typeof groupItem === 'string') {
            // Old format: array of strings
            groupId = groupItem;
          } else if (groupItem && typeof groupItem === 'object' && groupItem.groupId) {
            // New format: array of GroupMembership objects
            groupId = groupItem.groupId;
          } else {
            console.warn('Invalid group data:', groupItem);
            continue;
          }
          
          // Skip if this is a group the user created (already included above)
          if (userGroups.some(group => group.id === groupId)) {
            continue;
          }
          
          try {
            const groupDocRef = doc(db, 'groups', groupId);
            const groupDoc = await getDoc(groupDocRef);
            
            if (groupDoc.exists()) {
              userGroups.push({
                id: groupDoc.id,
                name: groupDoc.data().name
              });
            }
          } catch (error) {
            console.error(`Error fetching group ${groupId}:`, error);
          }
        }
      } else {
        // If user document doesn't exist, create it with empty groupsJoined array
        console.log('User document not found, creating one...');
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, {
          name: user.displayName || user.email?.split('@')[0] || 'User',
          email: user.email || '',
          createdAt: serverTimestamp(),
          groupsCreated: 0,
          groupsJoined: [],
          emailVerified: true, // Assume verified if they're logged in
        });
      }

      console.log('Total groups found:', userGroups.length);
      console.log('Groups data:', userGroups);
      setGroups(userGroups);
    } catch (error) {
      console.error('Error fetching groups:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Real-time listener for user's groups
  useEffect(() => {
    if (!user) return;

    const db = getFirestore();
    let unsubscribeCreatedGroups: (() => void) | null = null;
    let unsubscribeUser: (() => void) | null = null;

    const setupListeners = async () => {
      // Listen to groups created by user
      const createdGroupsQuery = query(
        collection(db, 'groups'),
        where('createdBy', '==', user.uid)
      );
      
      unsubscribeCreatedGroups = onSnapshot(createdGroupsQuery, async (snapshot) => {
        const createdGroups: Group[] = [];
        snapshot.forEach((doc) => {
          createdGroups.push({
            id: doc.id,
            name: doc.data().name
          });
        });
        
        // Fetch joined groups and combine with created groups
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          
          const allGroups = [...createdGroups];
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const groupsJoined = userData.groupsJoined || [];
            
            // Handle both old and new schema for real-time updates
            for (const groupItem of groupsJoined) {
              let groupId: string;
              
              // Check if it's the new GroupMembership structure or old string format
              if (typeof groupItem === 'string') {
                // Old format: array of strings
                groupId = groupItem;
              } else if (groupItem && typeof groupItem === 'object' && groupItem.groupId) {
                // New format: array of GroupMembership objects
                groupId = groupItem.groupId;
              } else {
                console.warn('Invalid group data in real-time listener:', groupItem);
                continue;
              }
              
              if (allGroups.some(group => group.id === groupId)) {
                continue;
              }
              
              try {
                const groupDocRef = doc(db, 'groups', groupId);
                const groupDoc = await getDoc(groupDocRef);
                
                if (groupDoc.exists()) {
                  allGroups.push({
                    id: groupDoc.id,
                    name: groupDoc.data().name
                  });
                }
              } catch (error) {
                console.error(`Error fetching group ${groupId}:`, error);
              }
            }
          }

          setGroups(allGroups);
          setLoading(false);
        } catch (error) {
          console.error('Error fetching joined groups:', error);
          setLoading(false);
        }
      });

      // Listen to user document changes (for groupsJoined array changes)
      const userDocRef = doc(db, 'users', user.uid);
      unsubscribeUser = onSnapshot(userDocRef, async (doc) => {
        if (doc.exists()) {
          // Re-trigger the created groups listener which will also fetch joined groups
          console.log('User document changed, refreshing groups...');
        }
      });
    };

    setupListeners();

    return () => {
      unsubscribeCreatedGroups?.();
      unsubscribeUser?.();
    };
  }, [user]);

  // Refresh data when screen comes into focus (e.g., after creating/deleting groups)
  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchUserGroups();
      }
    }, [user, fetchUserGroups])
  );

  const handleCreateGroup = () => {
    router.push('/create-group');
  };

  const handleGroupPress = (groupId: string) => {
    router.push(`/manage-group?groupId=${groupId}` as any);
  };

  const renderGroupItem = ({ item }: { item: Group }) => (
    <TouchableOpacity 
      style={styles.groupItem}
      onPress={() => handleGroupPress(item.id)}
    >
      <Text style={styles.groupName}>{item.name}</Text>
      <Text style={styles.groupArrow}>›</Text>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>
        Create your first group or join a group by link
      </Text>
    </View>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading your groups...</Text>
        </View>
      );
    }

    return (
      <View style={styles.content}>
        <View style={styles.groupsContainer}>
          <Text style={styles.sectionTitle}>Your Groups</Text>
          {groups.length > 0 ? (
            <FlatList
              data={groups}
              renderItem={renderGroupItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              style={styles.groupsList}
            />
          ) : (
            renderEmptyState()
          )}
        </View>

        <View style={styles.buttonContainer}>
          <Button
            label="Create New Group"
            onPress={handleCreateGroup}
            theme="primary"
            icon="plus"
          />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
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
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  title: {
    fontSize: theme.typography.fontSize.xlarge,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.bold,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    lineHeight: 22,
  },
  content: {
    flex: 1,
    width: '100%',
  },
  buttonContainer: {
    width: '100%',
    marginBottom: theme.spacing.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  groupsContainer: {
    flex: 1,
    width: '100%',
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.md,
  },
  groupsList: {
    flex: 1,
  },
  groupItem: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupName: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    flex: 1,
  },
  groupArrow: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
  emptyContainer: {
    padding: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
