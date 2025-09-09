import { FontAwesome } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Button from '../components/Button';
import ConfirmationModal from '../components/ConfirmationModal';
import CustomDateTimePicker from '../components/DateTimePicker';
import { theme } from '../constants/theme';
import { getCurrentUser } from '../services/authService';
import { eventService } from '../services/eventService';

interface EventData {
  title: string;
  description: string;
  date: Date;
  time: Date;
  location: string;
  type: 'practice' | 'game' | 'meeting' | 'other';
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

export default function CreateEventScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [eventData, setEventData] = useState<EventData>({
    title: '',
    description: '',
    date: new Date(),
    time: new Date(),
    location: '',
    type: 'practice'
  });
  
  const [recipients, setRecipients] = useState<RecipientSelection | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [modal, setModal] = useState<ModalState>({
    visible: false,
    title: '',
    message: '',
    type: 'error'
  });

  // Track processed params to prevent infinite loops
  const processedParams = useRef<{eventData?: string; recipients?: string}>({});

  // Handle returning from select-recipients screen
  useFocusEffect(
    useCallback(() => {
      console.log('Create-event focused');
      console.log('Platform:', Platform.OS);
      
      const eventDataParam = params.eventData as string;
      const recipientsParam = params.recipients as string;
      
      // Only process if params have changed
      if (eventDataParam && eventDataParam !== processedParams.current.eventData) {
        try {
          const savedEventData = JSON.parse(eventDataParam);
          console.log('Restoring event data:', savedEventData);
          
          const newEventData = {
            ...savedEventData,
            date: new Date(savedEventData.date),
            time: new Date(savedEventData.time)
          };
          
          setEventData(newEventData);
          processedParams.current.eventData = eventDataParam;
        } catch (error) {
          console.error('Error parsing event data:', error);
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
    }, [params.eventData, params.recipients])
  );

  const eventTypes = [
    { key: 'practice', label: 'Practice', icon: 'dribbble' },
    { key: 'game', label: 'Game', icon: 'trophy' },
    { key: 'meeting', label: 'Meeting', icon: 'users' },
    { key: 'other', label: 'Other', icon: 'calendar' }
  ];

  const validateEventData = (): boolean => {
    if (!eventData.title.trim()) {
      setModal({
        visible: true,
        title: 'Missing Information',
        message: 'Please enter an event title',
        type: 'error'
      });
      return false;
    }
    
    if (!eventData.location.trim()) {
      setModal({
        visible: true,
        title: 'Missing Information',
        message: 'Please enter a location',
        type: 'error'
      });
      return false;
    }

    return true;
  };

  const handleNext = () => {
    if (!validateEventData()) return;

    if (recipients) {
      // Recipients already selected, create the event
      handleCreateEvent();
    } else {
      // Navigate to select recipients screen with current event data
      router.push({
        pathname: '/select-recipients' as any,
        params: {
          feature: 'event',
          sourceScreen: 'create-event',
          data: JSON.stringify(eventData),
          eventData: JSON.stringify(eventData) // Pass event data for preservation
        }
      });
    }
  };

  const handleCreateEvent = async () => {
    console.log('handleCreateEvent called');
    console.log('eventData:', eventData);
    console.log('recipients:', recipients);
    
    if (!validateEventData() || !recipients) {
      console.log('Validation failed');
      return;
    }

    setIsCreating(true);
    console.log('Starting event creation...');

    try {
      const currentUser = await getCurrentUser();
      console.log('Current user:', currentUser);
      
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      // Combine date and time for start/end timestamps
      const startDateTime = new Date(eventData.date);
      startDateTime.setHours(eventData.time.getHours());
      startDateTime.setMinutes(eventData.time.getMinutes());
      
      // Default duration: 2 hours
      const endDateTime = new Date(startDateTime);
      endDateTime.setHours(startDateTime.getHours() + 2);

      const eventToCreate = {
        title: eventData.title,
        description: eventData.description,
        startTime: startDateTime,
        endTime: endDateTime,
        location: eventData.location,
        type: eventData.type
      };

      console.log('Event to create:', eventToCreate);
      console.log('Recipients:', recipients);

      // Create the event using the service
      const eventId = await eventService.createEvent(eventToCreate, recipients, currentUser.uid);
      console.log('Event created with ID:', eventId);

      // Show success message
      setModal({
        visible: true,
        title: 'Success!',
        message: `Event "${eventData.title}" has been created and sent to ${recipients.totalCount} recipients.`,
        type: 'success'
      });

    } catch (error) {
      console.error('Error creating event:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error details:', errorMessage);
      
      setModal({
        visible: true,
        title: 'Creation Failed',
        message: `There was an error creating the event: ${errorMessage}. Please try again.`,
        type: 'error'
      });
    } finally {
      setIsCreating(false);
      console.log('Event creation finished');
    }
  };

  const handleModalClose = () => {
    if (modal.type === 'success') {
      // Reset form and navigate to home tab
      setEventData({
        title: '',
        description: '',
        date: new Date(),
        time: new Date(),
        location: '',
        type: 'practice'
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
      return 'Creating Event...';
    }
    if (recipients) {
      return `Create Event (${recipients.totalCount} recipients)`;
    }
    return 'Next: Select Recipients';
  };

  const isButtonDisabled = (): boolean => {
    return isCreating || !eventData.title.trim() || !eventData.location.trim();
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString();
  };

  const formatTime = (time: Date) => {
    const hours = time.getHours().toString().padStart(2, '0');
    const minutes = time.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
      <View style={{ 
        flexDirection: 'row', 
        alignItems: 'center', 
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.inputBorder 
      }}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={{ marginRight: 16 }}
        >
          <FontAwesome name="arrow-left" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={{ 
          fontSize: 20, 
          fontWeight: 'bold', 
          color: theme.colors.text 
        }}>
          Create Event
        </Text>
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* Event Title */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ 
            fontSize: 16, 
            fontWeight: '600', 
            color: theme.colors.text,
            marginBottom: 8
          }}>
            Event Title *
          </Text>
          <TextInput
            style={{
              borderWidth: 1,
              borderColor: theme.colors.inputBorder,
              borderRadius: 8,
              padding: 12,
              fontSize: 16,
              backgroundColor: theme.colors.inputBackground,
              color: theme.colors.text
            }}
            value={eventData.title}
            onChangeText={(text) => setEventData(prev => ({ ...prev, title: text }))}
            placeholder="Enter event title"
            placeholderTextColor={theme.colors.textSecondary}
          />
        </View>

        {/* Event Type */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ 
            fontSize: 16, 
            fontWeight: '600', 
            color: theme.colors.text,
            marginBottom: 8
          }}>
            Event Type
          </Text>
          <View style={{ 
            flexDirection: 'row', 
            flexWrap: 'wrap',
            gap: 8
          }}>
            {eventTypes.map((type) => (
              <TouchableOpacity
                key={type.key}
                onPress={() => setEventData(prev => ({ ...prev, type: type.key as any }))}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: eventData.type === type.key ? theme.colors.secondary : theme.colors.inputBorder,
                  backgroundColor: eventData.type === type.key ? theme.colors.secondary + '20' : theme.colors.inputBackground
                }}
              >
                <FontAwesome 
                  name={type.icon as any} 
                  size={16} 
                  color={eventData.type === type.key ? theme.colors.secondary : theme.colors.textSecondary}
                  style={{ marginRight: 8 }}
                />
                <Text style={{
                  color: eventData.type === type.key ? theme.colors.secondary : theme.colors.textSecondary,
                  fontWeight: eventData.type === type.key ? '600' : 'normal'
                }}>
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Date and Time */}
        <View style={{ 
          flexDirection: 'row', 
          gap: 12,
          marginBottom: 20
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ 
              fontSize: 16, 
              fontWeight: '600', 
              color: theme.colors.text,
              marginBottom: 8
            }}>
              Date
            </Text>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.inputBorder,
                borderRadius: 8,
                padding: 12,
                backgroundColor: theme.colors.inputBackground,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <Text style={{ color: theme.colors.text, fontSize: 16 }}>
                {formatDate(eventData.date)}
              </Text>
              <FontAwesome name="calendar" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ 
              fontSize: 16, 
              fontWeight: '600', 
              color: theme.colors.text,
              marginBottom: 8
            }}>
              Time
            </Text>
            <TouchableOpacity
              onPress={() => setShowTimePicker(true)}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.inputBorder,
                borderRadius: 8,
                padding: 12,
                backgroundColor: theme.colors.inputBackground,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <Text style={{ color: theme.colors.text, fontSize: 16 }}>
                {formatTime(eventData.time)}
              </Text>
              <FontAwesome name="clock-o" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Location */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ 
            fontSize: 16, 
            fontWeight: '600', 
            color: theme.colors.text,
            marginBottom: 8
          }}>
            Location *
          </Text>
          <TextInput
            style={{
              borderWidth: 1,
              borderColor: theme.colors.inputBorder,
              borderRadius: 8,
              padding: 12,
              fontSize: 16,
              backgroundColor: theme.colors.inputBackground,
              color: theme.colors.text
            }}
            value={eventData.location}
            onChangeText={(text) => setEventData(prev => ({ ...prev, location: text }))}
            placeholder="Enter event location"
            placeholderTextColor={theme.colors.textSecondary}
          />
        </View>

        {/* Description */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ 
            fontSize: 16, 
            fontWeight: '600', 
            color: theme.colors.text,
            marginBottom: 8
          }}>
            Description
          </Text>
          <TextInput
            style={{
              borderWidth: 1,
              borderColor: theme.colors.inputBorder,
              borderRadius: 8,
              padding: 12,
              fontSize: 16,
              backgroundColor: theme.colors.inputBackground,
              color: theme.colors.text,
              height: 100,
              textAlignVertical: 'top'
            }}
            value={eventData.description}
            onChangeText={(text) => setEventData(prev => ({ ...prev, description: text }))}
            placeholder="Enter event description (optional)"
            placeholderTextColor={theme.colors.textSecondary}
            multiline
          />
        </View>
      </ScrollView>

      {/* Bottom Action */}
      <View style={{ 
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: theme.colors.inputBorder,
        paddingBottom: Platform.OS === 'ios' ? 34 : 16
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
                router.push({
                  pathname: '/select-recipients' as any,
                  params: {
                    feature: 'event',
                    sourceScreen: 'create-event',
                    data: JSON.stringify(eventData),
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
            handleNext();
          }}
          disabled={isButtonDisabled()}
        />
      </View>

      {/* Web Modal Overlay */}
      {Platform.OS === 'web' && (showDatePicker || showTimePicker) && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 999,
        }} />
      )}

      {/* Unified Date and Time Picker */}
      <CustomDateTimePicker
        value={eventData.date}
        mode="date"
        isVisible={showDatePicker}
        onConfirm={(date) => {
          setEventData(prev => ({ ...prev, date }));
          setShowDatePicker(false);
        }}
        onCancel={() => setShowDatePicker(false)}
        title="Select Date"
      />

      <CustomDateTimePicker
        value={eventData.time}
        mode="time"
        isVisible={showTimePicker}
        onConfirm={(time) => {
          setEventData(prev => ({ ...prev, time }));
          setShowTimePicker(false);
        }}
        onCancel={() => setShowTimePicker(false)}
        title="Select Time"
      />

      {/* Confirmation Modal */}
      <ConfirmationModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        confirmText={modal.type === 'success' ? 'Continue' : 'OK'}
        cancelText={undefined}
        onConfirm={handleModalClose}
        onCancel={handleModalClose}
        confirmButtonTheme={modal.type === 'success' ? 'primary' : 'primary'}
      />
    </SafeAreaView>
  );
}
