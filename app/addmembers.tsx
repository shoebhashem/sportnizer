import AdContainer from '@/components/AdContainer';
import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import Input from '@/components/Input';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface SearchResult {
  id: string;
  name: string;
  email: string;
  isAlreadyMember?: boolean;
}

export default function AddMembersScreen() {
  const { user } = useAuth();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Modal states
  const [invitationModalVisible, setInvitationModalVisible] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');

  const searchUsers = async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setLoading(true);
    
    // Mock search functionality - replace with actual Firestore search later
    setTimeout(() => {
      const mockUsers: SearchResult[] = [
        {
          id: '1',
          name: 'John Doe',
          email: 'john@email.com',
          isAlreadyMember: false
        },
        {
          id: '2',
          name: 'Jane Smith',
          email: 'jane@email.com',
          isAlreadyMember: true
        },
        {
          id: '3',
          name: 'Mike Johnson',
          email: 'mike@email.com',
          isAlreadyMember: false
        }
      ];

      // Filter results based on search query
      const filteredResults = mockUsers.filter(user => 
        user.name.toLowerCase().includes(query.toLowerCase()) ||
        user.email.toLowerCase().includes(query.toLowerCase())
      );

      setSearchResults(filteredResults);
      setShowResults(true);
      setLoading(false);
    }, 500);
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchUsers(searchQuery);
    }, 300); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleSelectUser = (user: SearchResult) => {
    setSelectedUser(user);
    setSearchQuery(user.name || user.email);
    setShowResults(false);
  };

  const handleAddMemberAndClose = () => {
    if (selectedUser) {
      addMember(selectedUser, true);
    } else if (searchQuery.trim()) {
      // User not found, show invitation option
      showInvitationDialog();
    }
  };

  const handleAddMemberAndContinue = () => {
    if (selectedUser) {
      addMember(selectedUser, false);
    } else if (searchQuery.trim()) {
      // User not found, show invitation option
      showInvitationDialog();
    }
  };

  const addMember = async (userToAdd: SearchResult, shouldClose: boolean) => {
    if (userToAdd.isAlreadyMember) {
      setModalMessage(`${userToAdd.name} is already a member of this group.`);
      setSuccessModalVisible(true);
      return;
    }

    try {
      // TODO: Implement actual Firebase logic to add member
      console.log(`Adding member: ${userToAdd.name} to group: ${groupId}`);
      
      setModalMessage(`${userToAdd.name} has been invited to join the group! They will receive a notification to accept the invitation.`);
      setSuccessModalVisible(true);
      
      if (shouldClose) {
        setTimeout(() => {
          router.back();
        }, 2000);
      } else {
        // Clear form for next addition
        setSearchQuery('');
        setSelectedUser(null);
      }
    } catch (error) {
      console.error('Error adding member:', error);
      setModalMessage('Failed to add member. Please try again.');
      setSuccessModalVisible(true);
    }
  };

  const showInvitationDialog = () => {
    // Check if search query looks like an email
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(searchQuery.trim());
    
    if (isEmail) {
      setModalMessage(`No Sportnizer account found for "${searchQuery}". Would you like to send an invitation email to this address?`);
      setInvitationModalVisible(true);
    } else {
      setModalMessage(`No user found with username "${searchQuery}". Please try searching by email address to send an invitation.`);
      setSuccessModalVisible(true);
    }
  };

  const handleSendInvitation = () => {
    setInvitationModalVisible(false);
    
    // TODO: Implement actual email invitation logic
    console.log(`Sending invitation to: ${searchQuery} for group: ${groupId}`);
    
    setModalMessage(`Invitation sent to ${searchQuery}! They will receive an email with instructions to join your group.`);
    setSuccessModalVisible(true);
    
    // Clear form
    setSearchQuery('');
    setSelectedUser(null);
  };

  const handleCloseModal = () => {
    setSuccessModalVisible(false);
    setModalMessage('');
  };

  const handleClose = () => {
    router.back();
  };

  const renderSearchResult = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity
      style={[
        styles.searchResultItem,
        item.isAlreadyMember && styles.alreadyMemberItem
      ]}
      onPress={() => handleSelectUser(item)}
      disabled={item.isAlreadyMember}
    >
      <View style={styles.userInfo}>
        <Text style={[
          styles.userName,
          item.isAlreadyMember && styles.alreadyMemberText
        ]}>
          {item.name}
        </Text>
        <Text style={[
          styles.userEmail,
          item.isAlreadyMember && styles.alreadyMemberText
        ]}>
          {item.email}
        </Text>
      </View>
      {item.isAlreadyMember && (
        <View style={styles.memberBadge}>
          <Text style={styles.memberBadgeText}>ALREADY MEMBER</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Add Members</Text>
            <Text style={styles.subtitle}>
              Search for existing users or invite new members via email
            </Text>
          </View>

          <View style={styles.searchSection}>
            <Input
              label="Search by name or email"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Enter name or email address"
              autoCapitalize="none"
            />
            
            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={theme.colors.secondary} />
                <Text style={styles.loadingText}>Searching...</Text>
              </View>
            )}

            {showResults && searchResults.length > 0 && (
              <View style={styles.searchResultsContainer}>
                <FlatList
                  data={searchResults}
                  keyExtractor={(item) => item.id}
                  renderItem={renderSearchResult}
                  style={styles.searchResultsList}
                  nestedScrollEnabled={true}
                />
              </View>
            )}

            {showResults && searchResults.length === 0 && searchQuery.trim().length >= 2 && !loading && (
              <View style={styles.noResultsContainer}>
                <Text style={styles.noResultsText}>
                  No users found for &quot;{searchQuery}&quot;
                </Text>
                {/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(searchQuery.trim()) && (
                  <Text style={styles.inviteHint}>
                    You can send an invitation to this email address
                  </Text>
                )}
              </View>
            )}
          </View>

          <View style={styles.actionButtons}>
            <Button
              label="Add Member & Close"
              theme="primary"
              onPress={handleAddMemberAndClose}
              disabled={!searchQuery.trim()}
            />
            
            <Button
              label="Add Member & Continue"
              theme="secondary"
              onPress={handleAddMemberAndContinue}
              disabled={!searchQuery.trim()}
            />
            
            <Button
              label="Close"
              theme="secondary"
              onPress={handleClose}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <AdContainer position="bottom" />

      {/* Invitation Confirmation Modal */}
      <ConfirmationModal
        visible={invitationModalVisible}
        title="Send Invitation?"
        message={modalMessage}
        confirmText="Send Invitation"
        cancelText="Cancel"
        onConfirm={handleSendInvitation}
        onCancel={() => setInvitationModalVisible(false)}
        confirmButtonTheme="primary"
      />

      {/* Success/Error Modal */}
      <ConfirmationModal
        visible={successModalVisible}
        title="Success"
        message={modalMessage}
        confirmText="OK"
        cancelText=""
        onConfirm={handleCloseModal}
        onCancel={handleCloseModal}
        confirmButtonTheme="primary"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  keyboardView: {
    flex: 1,
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
  searchSection: {
    marginBottom: theme.spacing.xl,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.md,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
  searchResultsContainer: {
    marginTop: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderRadius: theme.borderRadius.medium,
    backgroundColor: theme.colors.inputBackground,
    maxHeight: 200,
  },
  searchResultsList: {
    flexGrow: 0,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  alreadyMemberItem: {
    opacity: 0.6,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.xs,
  },
  userEmail: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  alreadyMemberText: {
    color: theme.colors.textSecondary,
  },
  memberBadge: {
    backgroundColor: theme.colors.secondary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.small,
  },
  memberBadgeText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  noResultsContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    padding: theme.spacing.lg,
  },
  noResultsText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  inviteHint: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  actionButtons: {
    marginTop: theme.spacing.xl,
  },
});
