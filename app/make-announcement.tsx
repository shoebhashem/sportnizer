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
import { announcementService } from '../services/announcementService';
import { getCurrentUser } from '../services/authService';

interface AnnouncementData {
  title: string;
  message: string;
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

export default function MakeAnnouncement() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [announcementData, setAnnouncementData] = useState<AnnouncementData>({
    title: '',
    message: ''
  });
  const [selectedRecipients, setSelectedRecipients] = useState<RecipientSelection | null>(null);

  const [modal, setModal] = useState<ModalState>({
    visible: false,
    type: 'error',
    title: '',
    message: ''
  });

  // Track processed params to prevent infinite loops
  const processedParams = useRef<{announcementData?: string; recipients?: string}>({});

  // Handle recipients selected from select-recipients screen
  useFocusEffect(
    useCallback(() => {
      console.log('Make-announcement focused');
      console.log('All params:', params);
      
      const announcementDataParam = params.announcementData as string;
      const recipientsParam = params.recipients as string;
      
      console.log('announcementDataParam:', announcementDataParam);
      console.log('recipientsParam:', recipientsParam);
      console.log('processedParams.current:', processedParams.current);
      
      // Only process if params have changed
      if (announcementDataParam && announcementDataParam !== processedParams.current.announcementData) {
        try {
          const savedAnnouncementData = JSON.parse(announcementDataParam);
          console.log('Restoring announcement data:', savedAnnouncementData);
          setAnnouncementData(savedAnnouncementData);
          processedParams.current.announcementData = announcementDataParam;
        } catch (error) {
          console.error('Error parsing announcement data:', error);
        }
      }
      
      // Only process recipients if they've changed
      if (recipientsParam && recipientsParam !== processedParams.current.recipients) {
        try {
          const selectedRecipients = JSON.parse(recipientsParam);
          console.log('Recipients received:', selectedRecipients);
          setSelectedRecipients(selectedRecipients);
          processedParams.current.recipients = recipientsParam;
        } catch (error) {
          console.error('Error parsing recipients:', error);
        }
      }
    }, [params])
  );

  const handleSelectRecipients = () => {
    // Validate announcement data
    if (!announcementData.title.trim()) {
      setModal({
        visible: true,
        title: 'Missing Title',
        message: 'Please enter a title for your announcement.',
        type: 'error'
      });
      return;
    }

    if (!announcementData.message.trim()) {
      setModal({
        visible: true,
        title: 'Missing Message', 
        message: 'Please enter a message for your announcement.',
        type: 'error'
      });
      return;
    }

    // Navigate to select recipients screen with announcement data
    router.push({
      pathname: '/select-recipients' as any,
      params: {
        feature: 'announcement',
        sourceScreen: 'make-announcement',
        announcementData: JSON.stringify(announcementData)
      }
    });
  };

  const handleCreateAnnouncement = async () => {
    if (!announcementData.title.trim()) {
      setModal({
        visible: true,
        title: 'Missing Title',
        message: 'Please enter a title for your announcement.',
        type: 'error'
      });
      return;
    }

    if (!announcementData.message.trim()) {
      setModal({
        visible: true,
        title: 'Missing Message',
        message: 'Please enter a message for your announcement.',
        type: 'error'
      });
      return;
    }

    if (!selectedRecipients) {
      setModal({
        visible: true,
        title: 'No Recipients Selected',
        message: 'Please select recipients for your announcement.',
        type: 'error'
      });
      return;
    }

    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      await announcementService.createAnnouncement(
        {
          title: announcementData.title.trim(),
          message: announcementData.message.trim()
        },
        selectedRecipients,
        currentUser.uid
      );

      setModal({
        visible: true,
        title: 'Announcement Created',
        message: 'Your announcement has been created successfully.',
        type: 'success'
      });
    } catch (error) {
      console.error('Error creating announcement:', error);
      setModal({
        visible: true,
        title: 'Creation Failed',
        message: 'Failed to create announcement. Please try again.',
        type: 'error'
      });
    }
  };

  const handleModalClose = () => {
    setModal({ ...modal, visible: false });
    if (modal.type === 'success') {
      router.replace('/(tabs)/' as any);
    }
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

        {/* Recipients Section */}
        {selectedRecipients && (
          <View style={{ marginBottom: theme.spacing.lg }}>
            <Text style={{
              fontSize: theme.typography.fontSize.medium,
              fontWeight: theme.typography.fontWeight.medium,
              color: theme.colors.text,
              marginBottom: theme.spacing.sm,
            }}>
              Selected Recipients
            </Text>
            <View style={{
              backgroundColor: theme.colors.inputBackground,
              borderWidth: 1,
              borderColor: theme.colors.inputBorder,
              borderRadius: theme.borderRadius.medium,
              padding: theme.spacing.md,
            }}>
              <Text style={{
                fontSize: theme.typography.fontSize.medium,
                color: theme.colors.text,
                marginBottom: theme.spacing.xs,
              }}>
                {selectedRecipients.totalCount} recipient{selectedRecipients.totalCount !== 1 ? 's' : ''} selected
              </Text>
              <TouchableOpacity
                onPress={handleSelectRecipients}
                style={{
                  backgroundColor: theme.colors.secondary + '20',
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: theme.spacing.xs,
                  borderRadius: theme.borderRadius.small,
                  alignSelf: 'flex-start',
                }}
              >
                <Text style={{
                  color: theme.colors.secondary,
                  fontSize: theme.typography.fontSize.small,
                  fontWeight: theme.typography.fontWeight.medium,
                }}>
                  Change Recipients
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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

      {/* Action Button */}
      <View style={{
        padding: theme.layout.containerPadding,
        borderTopWidth: 1,
        borderTopColor: theme.colors.inputBorder,
        backgroundColor: theme.colors.primary,
      }}>
        <Button
          label={selectedRecipients ? "Create Announcement" : "Next: Select Recipients"}
          onPress={selectedRecipients ? handleCreateAnnouncement : handleSelectRecipients}
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
        onConfirm={handleModalClose}
        onCancel={handleModalClose}
        confirmButtonTheme="primary"
      />
    </SafeAreaView>
  );
}
