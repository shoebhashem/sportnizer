import { FontAwesome } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Button from '../components/Button';
import ConfirmationModal from '../components/ConfirmationModal';
import { theme } from '../constants/theme';
import { getCurrentUser } from '../services/authService';
import { pollService } from '../services/pollService';

interface PollData {
  question: string;
  description: string;
  options: string[];
}

interface RecipientSelection {
  type: 'selected-groups';
  groups: {
    groupId: string;
    scope: 'entire' | 'subgroups' | 'members';
    subgroupIds?: string[];
    memberIds?: string[];
  }[];
  totalCount: number;
}

interface ModalState {
  visible: boolean;
  title: string;
  message: string;
  type?: 'error' | 'success' | 'info';
}

export default function CreatePollScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [pollData, setPollData] = useState<PollData>({
    question: '',
    description: '',
    options: ['', '']
  });

  const [recipients, setRecipients] = useState<RecipientSelection | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [modal, setModal] = useState<ModalState>({
    visible: false,
    title: '',
    message: '',
    type: 'error'
  });

  // Track processed params to prevent infinite loops
  const processedParams = useRef<{pollData?: string; recipients?: string}>({});

  // Handle returning from select-recipients screen
  useFocusEffect(
    useCallback(() => {
      console.log('Create-poll focused');
      console.log('All params:', params);
      
      const pollDataParam = params.pollData as string;
      const recipientsParam = params.recipients as string;
      
      console.log('pollDataParam:', pollDataParam);
      console.log('recipientsParam:', recipientsParam);
      console.log('processedParams.current:', processedParams.current);
      
      // Only process if params have changed
      if (pollDataParam && pollDataParam !== processedParams.current.pollData) {
        try {
          const savedPollData = JSON.parse(pollDataParam);
          console.log('Restoring poll data:', savedPollData);
          setPollData(savedPollData);
          processedParams.current.pollData = pollDataParam;
        } catch (error) {
          console.error('Error parsing poll data:', error);
        }
      }
      
      // Only process recipients if they've changed
      if (recipientsParam && recipientsParam !== 'undefined' && recipientsParam !== processedParams.current.recipients) {
        try {
          const recipientData = JSON.parse(recipientsParam);
          console.log('Setting recipients:', recipientData);
          setRecipients(recipientData);
          processedParams.current.recipients = recipientsParam;
        } catch (error) {
          console.error('Error parsing recipient data:', error);
        }
      }
    }, [params])
  );

  const handleAddOption = () => {
    if (pollData.options.length < 6) { // Limit to 6 options
      setPollData(prev => ({
        ...prev,
        options: [...prev.options, '']
      }));
    }
  };

  const handleRemoveOption = (index: number) => {
    if (pollData.options.length > 2) { // Minimum 2 options
      setPollData(prev => ({
        ...prev,
        options: prev.options.filter((_, i) => i !== index)
      }));
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    setPollData(prev => ({
      ...prev,
      options: prev.options.map((option, i) => i === index ? value : option)
    }));
  };

  const handleSelectRecipients = () => {
    // Validate poll data
    if (!pollData.question.trim()) {
      setModal({
        visible: true,
        title: 'Error',
        message: 'Please enter a poll question',
        type: 'error'
      });
      return;
    }

    const validOptions = pollData.options.filter(option => option.trim());
    if (validOptions.length < 2) {
      setModal({
        visible: true,
        title: 'Error',
        message: 'Please provide at least 2 options',
        type: 'error'
      });
      return;
    }

    const validPollData = { ...pollData, options: validOptions };
    
    if (recipients) {
      // Recipients already selected, create the poll
      handleCreatePoll(validPollData);
    } else {
      // Navigate to select recipients screen with poll data
      router.push({
        pathname: '/select-recipients' as any,
        params: {
          feature: 'poll',
          sourceScreen: 'create-poll',
          data: JSON.stringify(validPollData),
          pollData: JSON.stringify(validPollData) // Pass poll data for preservation
        }
      });
    }
  };

  const handleCreatePoll = async (validPollData: PollData) => {
    console.log('handleCreatePoll called');
    console.log('pollData:', validPollData);
    console.log('recipients:', recipients);
    
    if (!recipients) {
      console.log('No recipients selected');
      return;
    }

    setIsCreating(true);
    console.log('Starting poll creation...');

    try {
      const currentUser = await getCurrentUser();
      console.log('Current user:', currentUser);
      
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      console.log('Creating poll...');
      const pollId = await pollService.createPoll(validPollData, recipients, currentUser.uid);
      console.log('Poll created with ID:', pollId);

      // Show success message
      setModal({
        visible: true,
        title: 'Success!',
        message: `Poll "${validPollData.question}" has been created and sent to ${recipients.totalCount} recipients.`,
        type: 'success'
      });

    } catch (error) {
      console.error('Error creating poll:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error details:', errorMessage);
      
      setModal({
        visible: true,
        title: 'Creation Failed',
        message: `There was an error creating the poll: ${errorMessage}. Please try again.`,
        type: 'error'
      });
    } finally {
      setIsCreating(false);
      console.log('Poll creation finished');
    }
  };

  const handleModalConfirm = () => {
    if (modal.type === 'success') {
      // Reset form and navigate to home tab
      setPollData({
        question: '',
        description: '',
        options: ['', '']
      });
      setRecipients(null);
      setModal({ ...modal, visible: false });
      
      // Navigate to home tab instead of going back
      router.replace('/(tabs)/' as any);
    } else {
      setModal({ ...modal, visible: false });
    }
  };

  const getButtonLabel = (): string => {
    console.log('getButtonLabel called - isCreating:', isCreating, 'recipients:', recipients);
    if (isCreating) {
      return 'Creating Poll...';
    }
    if (recipients) {
      return `Create Poll (${recipients.totalCount} recipients)`;
    }
    return 'Next: Select Recipients';
  };

  const isButtonDisabled = (): boolean => {
    const validOptions = pollData.options.filter(option => option.trim());
    return isCreating || !pollData.question.trim() || validOptions.length < 2;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: theme.layout.containerPadding,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.inputBorder,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: theme.borderRadius.medium,
            backgroundColor: theme.colors.inputBackground,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: theme.spacing.md,
          }}
        >
          <FontAwesome name="arrow-left" size={18} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={{
          fontSize: theme.typography.fontSize.large,
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text,
          flex: 1,
        }}>
          Create Poll
        </Text>
      </View>

      <ScrollView 
        style={{ flex: 1 }} 
        contentContainerStyle={{ padding: theme.layout.containerPadding }}
        showsVerticalScrollIndicator={false}
      >
        {/* Poll Question */}
        <View style={{ marginBottom: theme.spacing.lg }}>
          <Text style={{
            fontSize: theme.typography.fontSize.medium,
            fontWeight: theme.typography.fontWeight.medium,
            color: theme.colors.text,
            marginBottom: theme.spacing.sm,
          }}>
            Poll Question *
          </Text>
          <TextInput
            style={{
              backgroundColor: theme.colors.inputBackground,
              borderWidth: 1,
              borderColor: theme.colors.inputBorder,
              borderRadius: theme.borderRadius.medium,
              padding: theme.spacing.md,
              color: theme.colors.text,
              fontSize: theme.typography.fontSize.medium,
              minHeight: theme.layout.inputHeight,
            }}
            placeholder="What would you like to ask?"
            placeholderTextColor={theme.colors.textSecondary}
            value={pollData.question}
            onChangeText={(text) => setPollData(prev => ({ ...prev, question: text }))}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Poll Description */}
        <View style={{ marginBottom: theme.spacing.lg }}>
          <Text style={{
            fontSize: theme.typography.fontSize.medium,
            fontWeight: theme.typography.fontWeight.medium,
            color: theme.colors.text,
            marginBottom: theme.spacing.sm,
          }}>
            Description (Optional)
          </Text>
          <TextInput
            style={{
              backgroundColor: theme.colors.inputBackground,
              borderWidth: 1,
              borderColor: theme.colors.inputBorder,
              borderRadius: theme.borderRadius.medium,
              padding: theme.spacing.md,
              color: theme.colors.text,
              fontSize: theme.typography.fontSize.medium,
              minHeight: 80,
            }}
            placeholder="Add additional context or details..."
            placeholderTextColor={theme.colors.textSecondary}
            value={pollData.description}
            onChangeText={(text) => setPollData(prev => ({ ...prev, description: text }))}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Poll Options */}
        <View style={{ marginBottom: theme.spacing.lg }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: theme.spacing.sm,
          }}>
            <Text style={{
              fontSize: theme.typography.fontSize.medium,
              fontWeight: theme.typography.fontWeight.medium,
              color: theme.colors.text,
            }}>
              Options *
            </Text>
            <Text style={{
              fontSize: theme.typography.fontSize.small,
              color: theme.colors.textSecondary,
            }}>
              {pollData.options.length}/6
            </Text>
          </View>

          {pollData.options.map((option, index) => (
            <View key={index} style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: theme.spacing.sm,
            }}>
              <View style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: theme.colors.inputBackground,
                borderWidth: 1,
                borderColor: theme.colors.inputBorder,
                borderRadius: theme.borderRadius.medium,
                paddingHorizontal: theme.spacing.md,
                minHeight: theme.layout.inputHeight,
              }}>
                <View style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: theme.colors.secondary,
                  marginRight: theme.spacing.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Text style={{
                    fontSize: theme.typography.fontSize.small,
                    color: theme.colors.secondary,
                    fontWeight: theme.typography.fontWeight.bold,
                  }}>
                    {String.fromCharCode(65 + index)} {/* A, B, C, etc. */}
                  </Text>
                </View>
                <TextInput
                  style={{
                    flex: 1,
                    color: theme.colors.text,
                    fontSize: theme.typography.fontSize.medium,
                  }}
                  placeholder={`Option ${index + 1}`}
                  placeholderTextColor={theme.colors.textSecondary}
                  value={option}
                  onChangeText={(text) => handleOptionChange(index, text)}
                />
              </View>

              {/* Remove option button (only show if more than 2 options) */}
              {pollData.options.length > 2 && (
                <TouchableOpacity
                  onPress={() => handleRemoveOption(index)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: theme.borderRadius.medium,
                    backgroundColor: theme.colors.error,
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginLeft: theme.spacing.sm,
                  }}
                >
                  <FontAwesome name="trash" size={16} color={theme.colors.white} />
                </TouchableOpacity>
              )}
            </View>
          ))}

          {/* Add Option Button */}
          {pollData.options.length < 6 && (
            <TouchableOpacity
              onPress={handleAddOption}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.inputBackground,
                borderWidth: 1,
                borderColor: theme.colors.secondary,
                borderStyle: 'dashed',
                borderRadius: theme.borderRadius.medium,
                padding: theme.spacing.md,
                minHeight: theme.layout.inputHeight,
                marginTop: theme.spacing.sm,
              }}
            >
              <FontAwesome name="plus" size={16} color={theme.colors.secondary} style={{ marginRight: theme.spacing.sm }} />
              <Text style={{
                color: theme.colors.secondary,
                fontSize: theme.typography.fontSize.medium,
                fontWeight: theme.typography.fontWeight.medium,
              }}>
                Add Option
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Info Text */}
        <View style={{
          backgroundColor: theme.colors.inputBackground,
          borderRadius: theme.borderRadius.medium,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.xl,
        }}>
          <Text style={{
            color: theme.colors.textSecondary,
            fontSize: theme.typography.fontSize.small,
            lineHeight: 18,
          }}>
            💡 Tip: Create clear, distinct options for your poll. Team members will be able to vote once the poll is created.
          </Text>
        </View>

        {/* Bottom spacing for scroll */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Action */}
      <View style={{
        padding: theme.layout.containerPadding,
        borderTopWidth: 1,
        borderTopColor: theme.colors.inputBorder,
        backgroundColor: theme.colors.primary,
      }}>
        {recipients && (
          <View style={{
            backgroundColor: theme.colors.success + '20',
            borderColor: theme.colors.success,
            borderWidth: 1,
            borderRadius: theme.borderRadius.medium,
            padding: theme.spacing.sm,
            marginBottom: theme.spacing.md,
            flexDirection: 'row',
            alignItems: 'center'
          }}>
            <FontAwesome 
              name="check-circle" 
              size={16} 
              color={theme.colors.success} 
              style={{ marginRight: theme.spacing.xs }} 
            />
            <Text style={{
              color: theme.colors.success,
              fontSize: theme.typography.fontSize.small,
              flex: 1
            }}>
              Recipients selected: {recipients.totalCount} people
            </Text>
            <TouchableOpacity
              onPress={() => {
                const validOptions = pollData.options.filter(option => option.trim());
                const validPollData = { ...pollData, options: validOptions };
                router.push({
                  pathname: '/select-recipients' as any,
                  params: {
                    feature: 'poll',
                    sourceScreen: 'create-poll',
                    data: JSON.stringify(validPollData),
                    recipients: JSON.stringify(recipients)
                  }
                });
              }}
              style={{
                paddingHorizontal: theme.spacing.xs,
                paddingVertical: theme.spacing.xs / 2
              }}
            >
              <Text style={{
                color: theme.colors.success,
                fontSize: theme.typography.fontSize.small,
                fontWeight: theme.typography.fontWeight.medium
              }}>
                Edit
              </Text>
            </TouchableOpacity>
          </View>
        )}
        
        <Button
          label={getButtonLabel()}
          onPress={() => {
            console.log('Button pressed - Recipients:', recipients, 'IsCreating:', isCreating);
            handleSelectRecipients();
          }}
          disabled={isButtonDisabled()}
          theme="secondary"
        />
      </View>

      {/* Confirmation Modal */}
      <ConfirmationModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        confirmText="OK"
        cancelText=""
        onConfirm={handleModalConfirm}
        onCancel={handleModalConfirm}
        confirmButtonTheme="primary"
      />
    </SafeAreaView>
  );
}
