import Button from '@/components/Button';
import DropdownInput from '@/components/DropdownInput';
import Input from '@/components/Input';
import { theme } from '@/constants/theme';
import { SPORT_TYPES, createClubAndGroup, createGroupInClub } from '@/services/clubService';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

interface ClubOption {
  id: string;
  name: string;
  isAdmin: boolean;
}

interface CreateGroupModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (result: { clubId?: string; groupId: string }) => void;
  userClubs: ClubOption[];
}

export default function CreateGroupModal({ 
  visible, 
  onClose, 
  onSuccess, 
  userClubs 
}: CreateGroupModalProps) {
  // Flow state
  const [currentStep, setCurrentStep] = useState<'select' | 'new-club' | 'existing-club'>('select');
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  
  // Form state
  const [clubName, setClubName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [sportType, setSportType] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Error states
  const [clubNameError, setClubNameError] = useState('');
  const [groupNameError, setGroupNameError] = useState('');
  const [sportTypeError, setSportTypeError] = useState('');

  // Get admin clubs for user
  const adminClubs = userClubs.filter(club => club.isAdmin);

  const resetForm = () => {
    setCurrentStep('select');
    setSelectedClubId('');
    setClubName('');
    setGroupName('');
    setSportType('');
    setLocation('');
    setClubNameError('');
    setGroupNameError('');
    setSportTypeError('');
    setLoading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validateNewClubForm = (): boolean => {
    let isValid = true;
    
    // Reset errors
    setClubNameError('');
    setGroupNameError('');
    setSportTypeError('');

    // Validate club name
    if (!clubName.trim()) {
      setClubNameError('Club name is required');
      isValid = false;
    } else if (clubName.trim().length < 3) {
      setClubNameError('Club name must be at least 3 characters');
      isValid = false;
    }

    // Validate group name
    if (!groupName.trim()) {
      setGroupNameError('Group name is required');
      isValid = false;
    } else if (groupName.trim().length < 3) {
      setGroupNameError('Group name must be at least 3 characters');
      isValid = false;
    }

    // Validate sport type
    if (!sportType) {
      setSportTypeError('Please select a sport type');
      isValid = false;
    }

    return isValid;
  };

  const validateExistingClubForm = (): boolean => {
    let isValid = true;
    
    // Reset errors
    setGroupNameError('');
    setSportTypeError('');

    // Validate group name
    if (!groupName.trim()) {
      setGroupNameError('Group name is required');
      isValid = false;
    } else if (groupName.trim().length < 3) {
      setGroupNameError('Group name must be at least 3 characters');
      isValid = false;
    }

    // Validate sport type
    if (!sportType) {
      setSportTypeError('Please select a sport type');
      isValid = false;
    }

    return isValid;
  };

  const handleCreateNewClubAndGroup = async () => {
    if (!validateNewClubForm()) return;

    setLoading(true);
    try {
      const result = await createClubAndGroup({
        clubName: clubName.trim(),
        groupName: groupName.trim(),
        sportType,
      });

      if (result.success) {
        onSuccess({ 
          clubId: result.clubId!, 
          groupId: result.groupId! 
        });
        handleClose();
      } else {
        // Handle error - you might want to show an error modal here
        console.error('Failed to create club and group:', result.error);
      }
    } catch (error) {
      console.error('Error creating club and group:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroupInExistingClub = async () => {
    if (!validateExistingClubForm()) return;

    // Find the club ID based on selected club name
    const selectedClub = adminClubs.find(club => club.name === selectedClubId);
    if (!selectedClub) {
      console.error('Selected club not found');
      return;
    }

    setLoading(true);
    try {
      const result = await createGroupInClub(selectedClub.id, groupName.trim(), sportType);

      if (result.success) {
        onSuccess({ groupId: result.groupId! });
        handleClose();
      } else {
        // Handle error
        console.error('Failed to create group in club:', result.error);
      }
    } catch (error) {
      console.error('Error creating group in club:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderInitialSelection = () => {
    const hasAdminClubs = adminClubs.length > 0;

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.modalTitle}>Create New Group</Text>
        <Text style={styles.modalDescription}>
          Choose how you want to create your group:
        </Text>

        <View style={styles.optionsList}>
          {/* Create New Club Option - Always shown */}
          <TouchableOpacity 
            style={styles.option}
            onPress={() => setCurrentStep('new-club')}
          >
            <Ionicons name="business-outline" size={24} color={theme.colors.secondary} />
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>Create New Club</Text>
              <Text style={styles.optionDescription}>
                Create a new club/organization with your first group
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>

          {/* Existing Club Option - Only if user has admin clubs */}
          {hasAdminClubs && (
            <TouchableOpacity 
              style={styles.option}
              onPress={() => setCurrentStep('existing-club')}
            >
              <Ionicons name="people-outline" size={24} color={theme.colors.secondary} />
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Add to Existing Club</Text>
                <Text style={styles.optionDescription}>
                  Create a group under one of your existing clubs
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.modalButtons}>
          <Button
            label="Cancel"
            onPress={handleClose}
            theme="secondary"
          />
        </View>
      </View>
    );
  };

  const renderNewClubForm = () => (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <TouchableOpacity onPress={() => setCurrentStep('select')}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.secondary} />
        </TouchableOpacity>
        <Text style={styles.modalTitle}>Create New Club</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView style={styles.formContainer} showsVerticalScrollIndicator={false}>
        <Input
          label="Club/Organization Name *"
          value={clubName}
          onChangeText={setClubName}
          placeholder="e.g., Gais Football Club"
          error={clubNameError}
        />

        <Input
          label="Group Name *"
          value={groupName}
          onChangeText={setGroupName}
          placeholder="e.g., Boys U16 Team"
          error={groupNameError}
        />

        <DropdownInput
          label="Sport Type *"
          value={sportType}
          onValueChange={setSportType}
          options={SPORT_TYPES}
          placeholder="Select a sport"
          error={sportTypeError}
        />
      </ScrollView>

      <View style={styles.modalButtons}>
        <View style={styles.modalButton}>
          <Button
            label="Cancel"
            onPress={() => setCurrentStep('select')}
            theme="secondary"
          />
        </View>
        <View style={styles.modalButton}>
          <Button
            label={loading ? "Creating..." : "Create Group"}
            onPress={handleCreateNewClubAndGroup}
            theme="primary"
            disabled={loading}
          />
        </View>
      </View>
    </View>
  );

  const renderExistingClubForm = () => (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <TouchableOpacity onPress={() => setCurrentStep('select')}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.secondary} />
        </TouchableOpacity>
        <Text style={styles.modalTitle}>Add to Existing Club</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView style={styles.formContainer} showsVerticalScrollIndicator={false}>
        <DropdownInput
          label="Select Club *"
          value={selectedClubId}
          onValueChange={setSelectedClubId}
          options={adminClubs.map(club => club.name)}
          placeholder="Choose a club"
        />

        <Input
          label="Group Name *"
          value={groupName}
          onChangeText={setGroupName}
          placeholder="e.g., Girls U14 Team"
          error={groupNameError}
        />

        <DropdownInput
          label="Sport Type *"
          value={sportType}
          onValueChange={setSportType}
          options={SPORT_TYPES}
          placeholder="Select a sport"
          error={sportTypeError}
        />
      </ScrollView>

      <View style={styles.modalButtons}>
        <View style={styles.modalButton}>
          <Button
            label="Cancel"
            onPress={() => setCurrentStep('select')}
            theme="secondary"
          />
        </View>
        <View style={styles.modalButton}>
          <Button
            label={loading ? "Creating..." : "Create Group"}
            onPress={handleCreateGroupInExistingClub}
            theme="primary"
            disabled={loading || !selectedClubId}
          />
        </View>
      </View>
    </View>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'select':
        return renderInitialSelection();
      case 'new-club':
        return renderNewClubForm();
      case 'existing-club':
        return renderExistingClubForm();
      default:
        return renderInitialSelection();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.modalOverlay} onPress={handleClose}>
        <View style={styles.modalContainer}>
          <Pressable onPress={() => {}} style={styles.modal}>
            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={theme.colors.secondary} />
              </View>
            )}
            {renderCurrentStep()}
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modal: {
    backgroundColor: theme.colors.primary,
    borderRadius: 20,
    overflow: 'hidden',
  },
  stepContainer: {
    padding: theme.spacing.lg,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  modalDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
  optionsList: {
    marginBottom: theme.spacing.xl,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 12,
    marginBottom: theme.spacing.sm,
  },
  optionContent: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  formContainer: {
    maxHeight: 300,
    marginBottom: theme.spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  modalButton: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  spacer: {
    width: 24,
  },
});
