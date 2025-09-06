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

interface AnnouncementData {
  title: string;
  message: string;
}

interface ModalState {
  visible: boolean;
  title: string;
  message: string;
}

export default function MakeAnnouncementScreen() {
  const router = useRouter();
  const [announcementData, setAnnouncementData] = useState<AnnouncementData>({
    title: '',
    message: ''
  });

  const [modal, setModal] = useState<ModalState>({
    visible: false,
    title: '',
    message: ''
  });

  const handleSelectRecipients = () => {
    // Validate announcement data
    if (!announcementData.title.trim()) {
      setModal({
        visible: true,
        title: 'Error',
        message: 'Please enter an announcement title'
      });
      return;
    }

    if (!announcementData.message.trim()) {
      setModal({
        visible: true,
        title: 'Error',
        message: 'Please enter an announcement message'
      });
      return;
    }

    // TODO: Navigate to select recipients screen with announcement data
    console.log('Navigating to select recipients with announcement:', announcementData);
    
    // For now, show success message
    setModal({
      visible: true,
      title: 'Success',
      message: 'Announcement ready! Recipient selection will be implemented soon.'
    });
  };

  const handleModalClose = () => {
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
          Make Announcement
        </Text>
      </View>

      <ScrollView 
        style={{ flex: 1 }} 
        contentContainerStyle={{ padding: theme.layout.containerPadding }}
        showsVerticalScrollIndicator={false}
      >
        {/* Announcement Title */}
        <View style={{ marginBottom: theme.spacing.lg }}>
          <Text style={{
            fontSize: theme.typography.fontSize.medium,
            fontWeight: theme.typography.fontWeight.medium,
            color: theme.colors.text,
            marginBottom: theme.spacing.sm,
          }}>
            Title *
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
            placeholder="Enter announcement title..."
            placeholderTextColor={theme.colors.textSecondary}
            value={announcementData.title}
            onChangeText={(text) => setAnnouncementData(prev => ({ ...prev, title: text }))}
          />
        </View>

        {/* Announcement Message */}
        <View style={{ marginBottom: theme.spacing.lg }}>
          <Text style={{
            fontSize: theme.typography.fontSize.medium,
            fontWeight: theme.typography.fontWeight.medium,
            color: theme.colors.text,
            marginBottom: theme.spacing.sm,
          }}>
            Message *
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
              minHeight: 120,
            }}
            placeholder="Write your announcement message here..."
            placeholderTextColor={theme.colors.textSecondary}
            value={announcementData.message}
            onChangeText={(text) => setAnnouncementData(prev => ({ ...prev, message: text }))}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Preview Section */}
        {(announcementData.title.trim() || announcementData.message.trim()) && (
          <View style={{ marginBottom: theme.spacing.lg }}>
            <Text style={{
              fontSize: theme.typography.fontSize.medium,
              fontWeight: theme.typography.fontWeight.medium,
              color: theme.colors.text,
              marginBottom: theme.spacing.sm,
            }}>
              Preview
            </Text>
            <View style={{
              backgroundColor: theme.colors.inputBackground,
              borderWidth: 1,
              borderColor: theme.colors.inputBorder,
              borderRadius: theme.borderRadius.medium,
              padding: theme.spacing.md,
            }}>
              {announcementData.title.trim() && (
                <Text style={{
                  fontSize: theme.typography.fontSize.large,
                  fontWeight: theme.typography.fontWeight.bold,
                  color: theme.colors.text,
                  marginBottom: theme.spacing.sm,
                }}>
                  {announcementData.title}
                </Text>
              )}
              {announcementData.message.trim() && (
                <Text style={{
                  fontSize: theme.typography.fontSize.medium,
                  color: theme.colors.text,
                  lineHeight: 22,
                }}>
                  {announcementData.message}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Tips Section */}
        <View style={{
          backgroundColor: theme.colors.inputBackground,
          borderRadius: theme.borderRadius.medium,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.xl,
        }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: theme.spacing.sm,
          }}>
            <FontAwesome name="lightbulb-o" size={16} color={theme.colors.secondary} style={{ marginRight: theme.spacing.sm }} />
            <Text style={{
              color: theme.colors.secondary,
              fontSize: theme.typography.fontSize.medium,
              fontWeight: theme.typography.fontWeight.medium,
            }}>
              Tips for Great Announcements
            </Text>
          </View>
          <Text style={{
            color: theme.colors.textSecondary,
            fontSize: theme.typography.fontSize.small,
            lineHeight: 18,
          }}>
            • Keep titles clear and concise{'\n'}
            • Include important details like dates, times, and locations{'\n'}
            • Use a friendly but professional tone{'\n'}
            • Consider your audience when writing
          </Text>
        </View>

        {/* Bottom spacing for scroll */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Select Recipients Button */}
      <View style={{
        padding: theme.layout.containerPadding,
        borderTopWidth: 1,
        borderTopColor: theme.colors.inputBorder,
        backgroundColor: theme.colors.primary,
      }}>
        <Button
          label="Select Recipients"
          onPress={handleSelectRecipients}
          theme="secondary"
        />
      </View>

      {/* Confirmation Modal */}
      <ConfirmationModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        confirmText="OK"
        cancelText={undefined}
        onConfirm={handleModalClose}
        onCancel={handleModalClose}
        confirmButtonTheme="primary"
      />
    </SafeAreaView>
  );
}
