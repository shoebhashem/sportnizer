import Button from '@/components/Button';
import ConfirmationModal from '@/components/ConfirmationModal';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useUser } from '@/contexts/UserContext';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export default function AddMemberTypeScreen() {
  const { groupId, clubId, groupName, clubName } = useLocalSearchParams();
  const { user } = useAuth();
  const { userProfile } = useUser();
  
  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalConfirmText, setModalConfirmText] = useState('OK');
  const [modalOnConfirm, setModalOnConfirm] = useState<() => void>(() => {});
  const [isJoiningGroup, setIsJoiningGroup] = useState(false);

  // Check if current user is a club admin for this club
  const isClubAdmin = userProfile?.clubs?.find(club => 
    club.clubId === clubId && club.isAdmin
  );

  // Check if user is already a member of this group
  const isGroupMember = userProfile?.groupsJoined?.find(group => 
    group.groupId === groupId
  );

  // Show "Add me as a player" option if user is club admin but not group member
  const showSelfJoinOption = isClubAdmin && !isGroupMember;

  // Helper function to show modal
  const showModal = (title: string, message: string, confirmText: string = "OK", onConfirm: () => void = () => {}) => {
    setModalTitle(title);
    setModalMessage(message);
    setModalConfirmText(confirmText);
    setModalOnConfirm(() => () => {
      hideModal();
      onConfirm();
    });
    setModalVisible(true);
  };

  // Helper function to hide modal
  const hideModal = () => {
    setModalVisible(false);
  };

  const handleJoinAsPlayer = async () => {
    if (!user?.uid || !clubId || !groupId) {
      showModal('Error', 'Missing required information. Please try again.');
      return;
    }

    setIsJoiningGroup(true);

    try {
      // TODO: Implement group joining functionality using Firebase Functions
      // This should call a Firebase Function to add the user to the group
      showModal('Info', 'Group joining functionality is not yet implemented.');
    } catch (error: any) {
      console.error('Error joining group:', error);
      showModal('Error', 'Failed to join group. Please try again.');
    } finally {
      setIsJoiningGroup(false);
    }
  };

  const handleRegularMember = () => {
    // Navigate to regular member addition screen
    router.push(`/add-regular-member?groupId=${groupId}&clubId=${clubId}&groupName=${groupName}&clubName=${clubName}` as any);
  };

  const handleChildYouthMember = () => {
    // Navigate to child/youth member addition screen
    router.push(`/add-child-member?groupId=${groupId}&clubId=${clubId}&groupName=${groupName}&clubName=${clubName}` as any);
  };

  const handleGoBack = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Add Player</Text>
          <Text style={styles.subtitle}>
            Choose the type of player you want to add to {groupName || 'this group'}
          </Text>
        </View>

        <View style={styles.optionsContainer}>
          {/* Add Me as Player Option - Only for club admins who aren't group members */}
          {showSelfJoinOption && (
            <View style={[styles.optionCard, styles.selfJoinCard]}>
              <View style={styles.selfJoinHeader}>
                <Ionicons name="person-add" size={24} color={theme.colors.secondary} />
                <Text style={styles.optionTitle}>Add Me as Player</Text>
              </View>
              <Text style={styles.optionDescription}>
                Join this group as a player. As a club admin, you can add yourself directly without an invitation.
              </Text>
              <Button
                label={isJoiningGroup ? "Joining..." : "Join as Player"}
                onPress={handleJoinAsPlayer}
                theme="secondary"
                disabled={isJoiningGroup}
              />
            </View>
          )}

          {/* Player Option */}
          <View style={styles.optionCard}>
            <Text style={styles.optionTitle}>Player</Text>
            <Text style={styles.optionDescription}>
              Adult players who are eligible to respond to events and communications themselves.
            </Text>
            <Button
              label="Add Player"
              onPress={handleRegularMember}
              theme="primary"
            />
          </View>

          {/* Youth Player Option */}
          <View style={styles.optionCard}>
            <Text style={styles.optionTitle}>Youth Player</Text>
            <Text style={styles.optionDescription}>
              Young players who need guardians to handle communications and make decisions regarding events.
            </Text>
            <Button
              label="Add Youth Player"
              onPress={handleChildYouthMember}
              theme="primary"
            />
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <Button
            label="Go Back"
            onPress={handleGoBack}
            theme="secondary"
          />
        </View>
      </ScrollView>
      
      <ConfirmationModal
        visible={modalVisible}
        title={modalTitle}
        message={modalMessage}
        confirmText={modalConfirmText}
        onConfirm={modalOnConfirm}
        onCancel={hideModal}
      />
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
    paddingVertical: theme.spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xxl,
  },
  title: {
    fontSize: theme.typography.fontSize.xxlarge,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  optionsContainer: {
    flex: 1,
    gap: theme.spacing.xl,
  },
  optionCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  optionTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  optionDescription: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: theme.spacing.lg,
  },
  buttonContainer: {
    marginTop: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
  },
  selfJoinCard: {
    borderColor: theme.colors.secondary,
    borderWidth: 2,
    backgroundColor: theme.colors.inputBackground,
  },
  selfJoinHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
});
