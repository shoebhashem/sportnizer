import Button from '@/components/Button';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { router } from 'expo-router';
import { collection, getDocs, getFirestore, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Group {
  id: string;
  name: string;
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
      
      // Get groups where user is the creator
      const createdGroupsQuery = query(
        collection(db, 'groups'),
        where('createdBy', '==', user.uid)
      );
      
      // Get groups where user is a member (from subcollection)
      // Note: This is a simplified approach - in production you might want to maintain 
      // a user document with group references for better performance
      const createdGroupsSnapshot = await getDocs(createdGroupsQuery);
      
      const userGroups: Group[] = [];
      createdGroupsSnapshot.forEach((doc) => {
        userGroups.push({
          id: doc.id,
          name: doc.data().name
        });
      });

      setGroups(userGroups);
    } catch (error) {
      console.error('Error fetching groups:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUserGroups();
  }, [fetchUserGroups]);

  const handleCreateGroup = () => {
    router.push('/create-group');
  };

  const handleGroupPress = (groupId: string) => {
    router.push('/manage-group');
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
