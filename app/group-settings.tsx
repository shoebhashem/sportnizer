import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import Input from '@/components/Input';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { addDoc, collection, doc, getDoc, getDocs, getFirestore, runTransaction, setDoc, writeBatch } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Group {
  id: string;
  name: string;
  createdBy: string;
}

export default function GroupSettingsScreen() {
  const { groupId } = useLocalSearchParams();
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [userRole, setUserRole] = useState<string>('member');
  const [loading, setLoading] = useState(true);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [adminCount, setAdminCount] = useState(0);
  const [showCreateSubgroupModal, setShowCreateSubgroupModal] = useState(false);
  const [subgroupName, setSubgroupName] = useState('');
  const [creatingSubgroup, setCreatingSubgroup] = useState(false);

  const fetchGroupData = useCallback(async () => {
    if (!groupId || !user?.uid) return;
    
    try {
      const db = getFirestore();
      
      // Fetch group data
      const groupDoc = await getDoc(doc(db, 'groups', groupId as string));
      if (groupDoc.exists()) {
        setGroup({
          id: groupDoc.id,
          name: groupDoc.data().name,
          createdBy: groupDoc.data().createdBy
        });
      }

      // Fetch user's role in this group and count admins
      const membersSnapshot = await getDocs(collection(db, 'groups', groupId as string, 'members'));
      let userRole = 'member';
      let adminCount = 0;
      
      membersSnapshot.forEach((doc) => {
        const memberData = doc.data();
        if (doc.id === user.uid) {
          userRole = memberData.role || 'member';
        }
        if (memberData.role === 'admin') {
          adminCount++;
        }
      });
      
      // If user is the group creator but not found in members, consider them as admin
      if (groupDoc.exists() && groupDoc.data().createdBy === user.uid && userRole === 'member') {
        userRole = 'admin';
        console.log('Group creator automatically granted admin permissions');
      }
      
      setUserRole(userRole);
      setAdminCount(adminCount);
    } catch (error) {
      console.error('Error fetching group data:', error);
      setErrorMessage('Failed to load group data');
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  }, [groupId, user?.uid]);

  useEffect(() => {
    fetchGroupData();
  }, [fetchGroupData]);

  const handleLeaveGroup = () => {
    // Check if user is the last admin
    if (userRole === 'admin' && adminCount <= 1) {
      setErrorMessage('You cannot leave the group as you are the only admin. Please assign another admin first or delete the group.');
      setShowErrorModal(true);
      return;
    }
    
    setShowLeaveModal(true);
  };

  const confirmLeaveGroup = async () => {
    if (!user?.uid) return;
    
    setShowLeaveModal(false);
    
    try {
      const db = getFirestore();
      
      await runTransaction(db, async (transaction) => {
        // Remove user from group members
        const memberRef = doc(db, 'groups', groupId as string, 'members', user.uid);
        transaction.delete(memberRef);
        
        // Update group member count
        const groupRef = doc(db, 'groups', groupId as string);
        const groupDoc = await transaction.get(groupRef);
        if (groupDoc.exists()) {
          const currentCount = groupDoc.data().membersCount || 0;
          transaction.update(groupRef, {
            membersCount: Math.max(0, currentCount - 1)
          });
        }
      });

      // Show success modal
      setSuccessMessage('You have left the group successfully');
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error leaving group:', error);
      setErrorMessage('Failed to leave group. Please try again.');
      setShowErrorModal(true);
    }
  };

  const handleDeleteGroup = () => {
    setShowDeleteModal(true);
  };

  const confirmDeleteGroup = async () => {
    setShowDeleteModal(false);
    
    try {
      const db = getFirestore();
      
      // Use batch operations to delete everything
      const batch = writeBatch(db);
      
      // Get all subcollections first
      const membersSnapshot = await getDocs(collection(db, 'groups', groupId as string, 'members'));
      const eventsSnapshot = await getDocs(collection(db, 'groups', groupId as string, 'events'));
      const subgroupsSnapshot = await getDocs(collection(db, 'groups', groupId as string, 'subgroups'));
      const resultsSnapshot = await getDocs(collection(db, 'groups', groupId as string, 'results'));
      
      // Delete all members
      membersSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      // Delete all events
      eventsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      // Delete all subgroups
      subgroupsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      // Delete all results
      resultsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      // Delete the group document
      const groupRef = doc(db, 'groups', groupId as string);
      batch.delete(groupRef);
      
      // Update creator's groupsCreated count
      if (group?.createdBy) {
        const creatorRef = doc(db, 'users', group.createdBy);
        const creatorDoc = await getDoc(creatorRef);
        if (creatorDoc.exists()) {
          const currentCount = creatorDoc.data().groupsCreated || 0;
          batch.update(creatorRef, {
            groupsCreated: Math.max(0, currentCount - 1)
          });
        }
      }
      
      // Commit all deletions
      await batch.commit();

      // Show success modal
      setSuccessMessage('Group has been deleted successfully');
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error deleting group:', error);
      setErrorMessage('Failed to delete group. Please try again.');
      setShowErrorModal(true);
    }
  };

  const handleAddMember = () => {
    if (group && user) {
      const groupName = encodeURIComponent(group.name);
      const inviterName = encodeURIComponent(user.displayName || user.email?.split('@')[0] || 'User');
      router.push(`/addmembers?groupId=${groupId}&groupName=${groupName}&inviterName=${inviterName}` as any);
    }
  };

  const handleCreateSubgroup = () => {
    setSubgroupName('');
    setShowCreateSubgroupModal(true);
  };

  const handleConfirmCreateSubgroup = async () => {
    if (!subgroupName.trim()) {
      return;
    }

    if (!groupId || !user?.uid) {
      setErrorMessage('Missing group ID or user information. Please try again.');
      setShowErrorModal(true);
      return;
    }

    // Check if user has permission to create subgroups
    console.log('Permission check:', {
      userRole,
      canManage,
      isAdmin,
      groupCreatedBy: group?.createdBy,
      currentUserId: user.uid
    });
    
    if (!canManage) {
      setErrorMessage('You do not have permission to create subgroups in this group.');
      setShowErrorModal(true);
      return;
    }

    setCreatingSubgroup(true);
    
    try {
      const db = getFirestore();
      
      // First, ensure group creator is added as admin member if not already present
      if (isGroupCreator) {
        const memberDoc = await getDoc(doc(db, 'groups', groupId as string, 'members', user.uid));
        if (!memberDoc.exists()) {
          console.log('Adding group creator as admin member');
          await setDoc(doc(db, 'groups', groupId as string, 'members', user.uid), {
            role: 'admin',
            joinedAt: new Date()
          });
        }
      } else {
        // For non-creators, verify membership and role
        const memberDoc = await getDoc(doc(db, 'groups', groupId as string, 'members', user.uid));
        console.log('User membership check:', {
          exists: memberDoc.exists(),
          data: memberDoc.exists() ? memberDoc.data() : null
        });
        
        if (!memberDoc.exists()) {
          setErrorMessage('You are not a member of this group. Please contact an admin.');
          setShowErrorModal(true);
          setCreatingSubgroup(false);
          return;
        }
        
        const memberRole = memberDoc.data()?.role;
        if (memberRole !== 'admin' && memberRole !== 'coach') {
          setErrorMessage('You do not have permission to create subgroups. Only admins and coaches can create subgroups.');
          setShowErrorModal(true);
          setCreatingSubgroup(false);
          return;
        }
      }
      
      console.log('Creating subgroup with data:', {
        name: subgroupName.trim(),
        memberIds: [],
        createdBy: user.uid,
        createdAt: new Date()
      });
      
      const docRef = await addDoc(collection(db, 'groups', groupId as string, 'subgroups'), {
        name: subgroupName.trim(),
        memberIds: [],
        createdBy: user.uid,
        createdAt: new Date()
      });

      console.log('Subgroup created successfully with ID:', docRef.id);

      setShowCreateSubgroupModal(false);
      setSubgroupName('');
      
      // Navigate to manage-group screen with subgroups tab active
      router.push(`/manage-group?groupId=${groupId}&tab=subgroups` as any);
    } catch (error) {
      console.error('Error creating subgroup:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      setErrorMessage(`Failed to create subgroup: ${errorMsg}`);
      setShowErrorModal(true);
    } finally {
      setCreatingSubgroup(false);
    }
  };

  const isAdmin = userRole === 'admin';
  const isGroupCreator = group?.createdBy === user?.uid;
  const canManage = userRole === 'admin' || userRole === 'coach' || isGroupCreator;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading group settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!group) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Group not found</Text>
          <Button
            label="Go Back"
            onPress={() => router.back()}
            theme="secondary"
          />
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
          <Text style={styles.title}>Group Settings</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Group Info */}
        <View style={styles.groupInfoContainer}>
          <Text style={styles.groupName}>{group.name}</Text>
          <Text style={styles.yourRole}>Your Role: {userRole}</Text>
        </View>

        {/* Settings Options */}
        <View style={styles.optionsContainer}>
          {/* Add Member Option - Only for Admin/Coach */}
          {canManage && (
            <TouchableOpacity 
              style={styles.optionItem}
              onPress={handleAddMember}
            >
              <View style={styles.optionIcon}>
                <Ionicons 
                  name="person-add-outline" 
                  size={24} 
                  color={theme.colors.secondary} 
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Add Member</Text>
                <Text style={styles.optionDescription}>Invite new members to join this group</Text>
              </View>
              <Ionicons 
                name="chevron-forward" 
                size={20} 
                color={theme.colors.textSecondary} 
              />
            </TouchableOpacity>
          )}

          {/* Create Subgroup Option - Only for Admin/Coach */}
          {canManage && (
            <TouchableOpacity 
              style={styles.optionItem}
              onPress={handleCreateSubgroup}
            >
              <View style={styles.optionIcon}>
                <Ionicons 
                  name="layers-outline" 
                  size={24} 
                  color={theme.colors.secondary} 
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Create Subgroup</Text>
                <Text style={styles.optionDescription}>Create a new subgroup within this group</Text>
              </View>
              <Ionicons 
                name="chevron-forward" 
                size={20} 
                color={theme.colors.textSecondary} 
              />
            </TouchableOpacity>
          )}

          {/* Leave Group Option */}
          <TouchableOpacity 
            style={styles.optionItem}
            onPress={handleLeaveGroup}
          >
            <View style={styles.optionIcon}>
              <Ionicons 
                name="exit-outline" 
                size={24} 
                color={theme.colors.error} 
              />
            </View>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>Leave Group</Text>
              <Text style={styles.optionDescription}>Remove yourself from this group</Text>
            </View>
            <Ionicons 
              name="chevron-forward" 
              size={20} 
              color={theme.colors.textSecondary} 
            />
          </TouchableOpacity>

          {/* Delete Group Option - Only for Admin */}
          {isAdmin && (
            <TouchableOpacity 
              style={[styles.optionItem, styles.dangerOption]}
              onPress={handleDeleteGroup}
            >
              <View style={styles.optionIcon}>
                <Ionicons 
                  name="trash-outline" 
                  size={24} 
                  color={theme.colors.error} 
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={[styles.optionTitle, styles.dangerText]}>Delete Group</Text>
                <Text style={styles.optionDescription}>Permanently delete this group</Text>
              </View>
              <Ionicons 
                name="chevron-forward" 
                size={20} 
                color={theme.colors.error} 
              />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Leave Group Confirmation Modal */}
      <ConfirmationModal
        visible={showLeaveModal}
        title="Leave Group"
        message={`Are you sure you want to leave "${group?.name || 'this group'}"?`}
        confirmText="Leave"
        cancelText="Cancel"
        onConfirm={confirmLeaveGroup}
        onCancel={() => setShowLeaveModal(false)}
        confirmButtonTheme="secondary"
      />

      {/* Delete Group Confirmation Modal */}
      <ConfirmationModal
        visible={showDeleteModal}
        title="Delete Group"
        message={`Are you sure you want to permanently delete "${group?.name || 'this group'}"? This will also delete all future events for all members in this group and cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDeleteGroup}
        onCancel={() => setShowDeleteModal(false)}
        confirmButtonTheme="primary"
      />

      {/* Success Modal */}
      <ConfirmationModal
        visible={showSuccessModal}
        title="Success"
        message={successMessage}
        confirmText="OK"
        onConfirm={() => {
          setShowSuccessModal(false);
          router.replace('/groups');
        }}
        onCancel={() => {
          setShowSuccessModal(false);
          router.replace('/groups');
        }}
        confirmButtonTheme="primary"
      />

      {/* Error Modal */}
      <ConfirmationModal
        visible={showErrorModal}
        title="Error"
        message={errorMessage}
        confirmText="OK"
        onConfirm={() => setShowErrorModal(false)}
        onCancel={() => setShowErrorModal(false)}
        confirmButtonTheme="secondary"
      />

      {/* Create Subgroup Modal */}
      <Modal
        visible={showCreateSubgroupModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateSubgroupModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setShowCreateSubgroupModal(false)}
        >
          <View style={styles.modalContainer}>
            <Pressable onPress={() => {}} style={styles.modal}>
              <Text style={styles.modalTitle}>Create Subgroup</Text>
              
              <Input
                label="Subgroup Name"
                value={subgroupName}
                onChangeText={setSubgroupName}
                placeholder="Enter subgroup name"
                autoCapitalize="words"
              />
              
              <View style={styles.modalButtons}>
                <View style={styles.modalButton}>
                  <Button
                    label="Cancel"
                    onPress={() => setShowCreateSubgroupModal(false)}
                    theme="secondary"
                  />
                </View>
                <View style={styles.modalButton}>
                  <Button
                    label={creatingSubgroup ? "Creating..." : "Create"}
                    onPress={handleConfirmCreateSubgroup}
                    theme="primary"
                    disabled={creatingSubgroup || !subgroupName.trim()}
                  />
                </View>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.bold,
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40, // Same width as back button for centering
  },
  groupInfoContainer: {
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.lg,
    alignItems: 'center',
  },
  groupName: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.sm,
  },
  yourRole: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textTransform: 'capitalize',
  },
  optionsContainer: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    overflow: 'hidden',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  dangerOption: {
    borderBottomWidth: 0,
  },
  optionIcon: {
    width: 40,
    alignItems: 'center',
  },
  optionContent: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  optionTitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  dangerText: {
    color: theme.colors.error,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  errorText: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.error,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
    padding: theme.spacing.md,
  },
  modal: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.large,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  modalButton: {
    flex: 1,
  },
});
