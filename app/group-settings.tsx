import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import Input from '@/components/Input';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { collection, doc, getDoc, getDocs, getFirestore, runTransaction, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Import new services and types
import { useVersionedData } from '@/contexts/UserContext';
import { functions } from '@/services/core/firebase';
import { GroupData } from '@/services/types/group';

// interface UnconfirmedMember {
//   id: string; // Member document ID
//   name: string;
//   birthDate?: string;
//   guardianEmails?: string[]; // For invitation emails
//   invitationToken?: string; // Links to guardianInvitations collection
// }

export default function GroupSettingsScreen() {
  const { groupId, clubId } = useLocalSearchParams();
  const { user } = useAuth();
  const { fetchGroupData, fetchGroupMembers } = useVersionedData();
  const [group, setGroup] = useState<GroupData | null>(null);
  // const [members, setMembers] = useState<GroupMemberData[]>([]); // Commented out - not used in UI yet
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
  
  // Coach Management State
  const [showAddCoachModal, setShowAddCoachModal] = useState(false);
  
  const fetchGroupDataFromServices = useCallback(async () => {
    if (!groupId || typeof groupId !== 'string' || !clubId || typeof clubId !== 'string' || !user?.uid) return;
    
    try {
      // Fetch group data and members using versioned UserContext services
      const [groupResult, membersResult] = await Promise.all([
        fetchGroupData(clubId, groupId),
        fetchGroupMembers(clubId, groupId)
      ]);

      if (groupResult.success && groupResult.data) {
        setGroup(groupResult.data);
      }
      
      // Process members data
      const membersData = membersResult.success ? membersResult.data?.members || [] : [];
      // setMembers(membersData); // Commented out - not used in UI yet

      // Find current user's role and count admins
      let userRole = 'member';
      let adminCount = 0;
      // const unconfirmedMembers: UnconfirmedMember[] = []; // Commented out - not used yet
      
      membersData.forEach((member: any) => {
        if (member.userId === user.uid) {
          // Check user's roles
          if (member.roles.includes('admin')) {
            userRole = 'admin';
          } else if (member.roles.includes('coach')) {
            userRole = 'coach';
          } else {
            userRole = 'member';
          }
        }
        
        // Count admins
        if (member.roles.includes('admin')) {
          adminCount++;
        }
        
        // Collect unconfirmed members (if they have this property)
        // Note: We may need to add this to GroupMemberData interface if needed
        // if (member.isConfirmed === false) {
        //   unconfirmedMembers.push({
        //     id: member.userId,
        //     name: member.name,
        //     // ... other fields
        //   });
        // }
      });
      
      // If user is the group creator but not found in members, consider them as admin
      if (groupResult.success && groupResult.data && groupResult.data.createdBy === user.uid && userRole === 'member') {
        userRole = 'admin';
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
  }, [groupId, clubId, user?.uid, fetchGroupData, fetchGroupMembers]);

  useEffect(() => {
    fetchGroupDataFromServices();
  }, [fetchGroupDataFromServices]);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchGroupDataFromServices();
    }, [fetchGroupDataFromServices])
  );

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
        // Remove user from group allMembers (updated from members)
        const memberRef = doc(db, 'clubs', clubId as string, 'groups', groupId as string, 'allMembers', user.uid);
        transaction.delete(memberRef);
        
        // Update group member count
        const groupRef = doc(db, 'clubs', clubId as string, 'groups', groupId as string);
        const groupDoc = await transaction.get(groupRef);
        if (groupDoc.exists()) {
          const currentCount = groupDoc.data().memberCount || 0; // Updated field name from membersCount
          transaction.update(groupRef, {
            memberCount: Math.max(0, currentCount - 1) // Updated field name from membersCount
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
      
      // Get all subcollections first - updated to use allMembers
      const membersSnapshot = await getDocs(collection(db, 'clubs', clubId as string, 'groups', groupId as string, 'allMembers'));
      const eventsSnapshot = await getDocs(collection(db, 'clubs', clubId as string, 'groups', groupId as string, 'events'));
      const subgroupsSnapshot = await getDocs(collection(db, 'clubs', clubId as string, 'groups', groupId as string, 'subgroups'));
      const resultsSnapshot = await getDocs(collection(db, 'clubs', clubId as string, 'groups', groupId as string, 'results'));
      
      // Remove group from all members' groupsJoined arrays
      // Note: groupsJoined is an array of objects, not strings, so we need to handle removal differently
      for (const memberDoc of membersSnapshot.docs) {
        const userId = memberDoc.id;
        const userRef = doc(db, 'users', userId);
        
        // Get current user data to properly remove the group membership
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const currentGroupsJoined = userData.groupsJoined || [];
          const updatedGroupsJoined = currentGroupsJoined.filter(
            (membership: any) => membership.groupId !== groupId
          );
          
          batch.update(userRef, {
            groupsJoined: updatedGroupsJoined
          });
        }
      }

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
      const groupRef = doc(db, 'clubs', clubId as string, 'groups', groupId as string);
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

  const handleAddMember = async () => {
    if (group && groupId && clubId) {
      const groupName = encodeURIComponent(group.name);
      router.push(`/add-member-type?groupId=${groupId}&clubId=${clubId}&groupName=${groupName}` as any);
    }
  };

  const handleCreateSubgroup = () => {
    setSubgroupName('');
    setShowCreateSubgroupModal(true);
  };

  const handleConfirmCreateSubgroup = async () => {
    console.log('🔥 handleConfirmCreateSubgroup called');
    console.log('📝 subgroupName:', subgroupName);
    console.log('🏠 clubId:', clubId);
    console.log('👥 groupId:', groupId);
    console.log('👤 user?.uid:', user?.uid);
    
    if (!subgroupName.trim()) {
      console.log('❌ Empty subgroup name, returning early');
      return;
    }

    if (!groupId || !user?.uid || !clubId) {
      console.log('❌ Missing required data');
      setErrorMessage('Missing group ID, club ID, or user information. Please try again.');
      setShowErrorModal(true);
      return;
    }

    setCreatingSubgroup(true);
    console.log('🚀 Starting subgroup creation...');
    
    try {
      // Call the Firebase Function
      console.log('📞 Calling Firebase Function: createSubGroup');
      const createSubGroupFunction = httpsCallable(functions, 'createSubGroup');
      
      const payload = {
        uid: user.uid,
        clubId: clubId as string,
        groupId: groupId as string,
        subGroupName: subgroupName.trim()
      };
      console.log('📦 Payload:', payload);
      
      const result = await createSubGroupFunction(payload);
      console.log('✅ Firebase Function result:', result);

      const data = result.data as { success: boolean; message?: string; error?: string; subGroupName?: string };
      console.log('📊 Response data:', data);

      if (data.success) {
        console.log('🎉 Success! Closing modal and showing success message');
        setShowCreateSubgroupModal(false);
        setSubgroupName('');
        
        // Show success message
        setSuccessMessage(`Subgroup "${data.subGroupName || subgroupName.trim()}" created successfully!`);
        setShowSuccessModal(true);
        
        // Navigate to manage-group screen with subgroups tab active
        router.push(`/manage-group?groupId=${groupId}&tab=subgroups` as any);
      } else {
        console.log('❌ Function returned error:', data.error);
        setErrorMessage(data.error || 'Failed to create subgroup');
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error('💥 Error creating subgroup:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      setErrorMessage(`Failed to create subgroup: ${errorMsg}`);
      setShowErrorModal(true);
    } finally {
      console.log('🏁 Finished - setting creatingSubgroup to false');
      setCreatingSubgroup(false);
    }
  };

  const handleSendGuardianConfirmation = () => {
    router.push({
      pathname: '/invite-guardians',
      params: {
        groupId: groupId as string,
        groupName: group?.name || 'Group'
      }
    });
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

          {/* Add Coach Option - Only for Admin/Coach */}
          {canManage && (
            <TouchableOpacity 
              style={styles.optionItem}
              onPress={() => setShowAddCoachModal(true)}
            >
              <View style={styles.optionIcon}>
                <Ionicons 
                  name="person-add-outline" 
                  size={24} 
                  color={theme.colors.secondary} 
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Add Coach</Text>
                <Text style={styles.optionDescription}>Promote members or invite external coaches</Text>
              </View>
              <Ionicons 
                name="chevron-forward" 
                size={20} 
                color={theme.colors.textSecondary} 
              />
            </TouchableOpacity>
          )}

          {/* Send Confirmation Link - Only for ageGroup 1 */}
          {canManage && group?.ageGroup === 1 && (
            <TouchableOpacity 
              style={styles.optionItem}
              onPress={handleSendGuardianConfirmation}
            >
              <View style={styles.optionIcon}>
                <Ionicons 
                  name="mail-outline" 
                  size={24} 
                  color={theme.colors.secondary} 
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Invite Guardians</Text>
                <Text style={styles.optionDescription}>Send guardian invitation links for unconfirmed children</Text>
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

      {/* Add Coach Modal */}
      <Modal
        visible={showAddCoachModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddCoachModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setShowAddCoachModal(false)}
        >
          <View style={styles.modalContainer}>
            <Pressable onPress={() => {}} style={styles.modal}>
              <Text style={styles.modalTitle}>Add Coach</Text>
              
              <Text style={styles.modalDescription}>
                Choose how to add a new coach to your group:
              </Text>
              
              <View style={styles.coachOptionsList}>
                {/* Promote Member Option - ageGroup 2 only */}
                {group?.ageGroup === 2 && (
                  <TouchableOpacity style={styles.coachOption}>
                    <Ionicons name="people-outline" size={24} color={theme.colors.secondary} />
                    <Text style={styles.coachOptionText}>Promote Existing Member</Text>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                )}
                
                {/* Promote Guardian Option - ageGroup 1 only */}
                {group?.ageGroup === 1 && (
                  <TouchableOpacity style={styles.coachOption}>
                    <Ionicons name="shield-outline" size={24} color={theme.colors.secondary} />
                    <Text style={styles.coachOptionText}>Promote Guardian</Text>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                )}
                
                {/* Invite External Adult - All ageGroups */}
                <TouchableOpacity style={styles.coachOption}>
                  <Ionicons name="person-add-outline" size={24} color={theme.colors.secondary} />
                  <Text style={styles.coachOptionText}>Invite External Adult</Text>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.modalButtons}>
                <Button
                  label="Cancel"
                  onPress={() => setShowAddCoachModal(false)}
                  theme="secondary"
                />
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
  modalDescription: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  coachOptionsList: {
    marginBottom: theme.spacing.lg,
  },
  coachOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  coachOptionText: {
    flex: 1,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginLeft: theme.spacing.md,
  },
  unconfirmedChildrenList: {
    maxHeight: 200,
    marginBottom: theme.spacing.lg,
  },
  childOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  childInfo: {
    flex: 1,
  },
  childName: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
  },
  childBirthDate: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  confirmationStatus: {
    alignItems: 'flex-end',
  },
  sentStatus: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.success,
    fontWeight: theme.typography.fontWeight.medium,
  },
  pendingStatus: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.error,
    fontWeight: theme.typography.fontWeight.medium,
  },
  invitationSent: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.success,
    fontWeight: theme.typography.fontWeight.medium,
  },
  invitationPending: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  childOptionSelected: {
    backgroundColor: theme.colors.inputBackground,
    borderColor: theme.colors.secondary,
    borderWidth: 1,
  },
  selectionIndicator: {
    marginRight: 12,
  },
  memberDetails: {
    flex: 1,
  },
  emailSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
  },
  emailSectionTitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
    marginBottom: 15,
  },
  emailInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  emailInput: {
    flex: 1,
    marginRight: 10,
  },
  removeEmailButton: {
    padding: 5,
  },
  addEmailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  addEmailText: {
    marginLeft: 8,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
  },
});
