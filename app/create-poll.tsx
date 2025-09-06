import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
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

interface PollData {
  question: string;
  description: string;
  options: string[];
}

interface ModalState {
  visible: boolean;
  title: string;
  message: string;
  type: 'error' | 'success';
}

export default function CreatePollScreen() {
  const router = useRouter();
  const [pollData, setPollData] = useState<PollData>({
    question: '',
    description: '',
    options: ['', '']
  });

  const [modal, setModal] = useState<ModalState>({
    visible: false,
    title: '',
    message: '',
    type: 'error'
  });

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

  const handleCreatePoll = () => {
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

    // TODO: Implement poll creation logic
    console.log('Creating poll:', { ...pollData, options: validOptions });
    setModal({
      visible: true,
      title: 'Success',
      message: 'Poll created successfully!',
      type: 'success'
    });
  };

  const handleModalConfirm = () => {
    if (modal.type === 'success') {
      setModal({ ...modal, visible: false });
      router.back();
    } else {
      setModal({ ...modal, visible: false });
    }
  };

  const handleModalCancel = () => {
    setModal({ ...modal, visible: false });
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

      {/* Create Poll Button */}
      <View style={{
        padding: theme.layout.containerPadding,
        borderTopWidth: 1,
        borderTopColor: theme.colors.inputBorder,
        backgroundColor: theme.colors.primary,
      }}>
        <Button
          label="Create Poll"
          onPress={handleCreatePoll}
          theme="secondary"
        />
      </View>

      {/* Confirmation Modal */}
      <ConfirmationModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        confirmText={modal.type === 'success' ? 'OK' : 'OK'}
        cancelText={modal.type === 'error' ? undefined : undefined}
        onConfirm={handleModalConfirm}
        onCancel={handleModalCancel}
        confirmButtonTheme={modal.type === 'success' ? 'secondary' : 'primary'}
      />
    </SafeAreaView>
  );
}
