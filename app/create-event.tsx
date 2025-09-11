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
  startDate: Date;
  startTime: Date;
  gatheringTime?: Date; // Optional gathering time
  endDate: Date;
  endTime: Date;
  location: string;
  type: 'practice' | 'game' | 'meeting' | 'other';
  capacity: {
    enabled: boolean;
    maxAttendees?: number;
  };
  responseDeadline: {
    enabled: boolean; // Whether custom deadline is enabled
    date?: Date; // Custom deadline date (if enabled)
  };
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
    startDate: new Date(),
    startTime: new Date(),
    gatheringTime: undefined,
    endDate: (() => {
      const date = new Date();
      date.setHours(date.getHours() + 2); // Default 2 hours later
      return date;
    })(),
    endTime: (() => {
      const time = new Date();
      time.setHours(time.getHours() + 2); // Default 2 hours later
      return time;
    })(),
    location: '',
    type: 'practice',
    capacity: {
      enabled: false,
      maxAttendees: undefined
    },
    responseDeadline: {
      enabled: false, // Default to using event start date as deadline
      date: undefined
    }
  });
  
  const [recipients, setRecipients] = useState<RecipientSelection | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showGatheringTimePicker, setShowGatheringTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showResponseDeadlinePicker, setShowResponseDeadlinePicker] = useState(false);
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
            startDate: new Date(savedEventData.startDate),
            startTime: new Date(savedEventData.startTime),
            gatheringTime: savedEventData.gatheringTime ? new Date(savedEventData.gatheringTime) : undefined,
            endDate: new Date(savedEventData.endDate),
            endTime: new Date(savedEventData.endTime),
            responseDeadline: {
              ...savedEventData.responseDeadline,
              date: savedEventData.responseDeadline?.date ? new Date(savedEventData.responseDeadline.date) : undefined
            }
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

      // Combine start date and time for start timestamp
      const startDateTime = new Date(eventData.startDate);
      startDateTime.setHours(eventData.startTime.getHours());
      startDateTime.setMinutes(eventData.startTime.getMinutes());
      
      // Combine end date and time for end timestamp
      const endDateTime = new Date(eventData.endDate);
      endDateTime.setHours(eventData.endTime.getHours());
      endDateTime.setMinutes(eventData.endTime.getMinutes());

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
        startDate: new Date(),
        startTime: new Date(),
        gatheringTime: undefined,
        endDate: (() => {
          const date = new Date();
          date.setHours(date.getHours() + 2);
          return date;
        })(),
        endTime: (() => {
          const time = new Date();
          time.setHours(time.getHours() + 2);
          return time;
        })(),
        location: '',
        type: 'practice',
        capacity: {
          enabled: false,
          maxAttendees: undefined
        },
        responseDeadline: {
          enabled: false, // Default to using event start date as deadline
          date: undefined
        }
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

        {/* Start Date and Time */}
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
              Start Date
            </Text>
            <TouchableOpacity
              onPress={() => setShowStartDatePicker(true)}
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
                {formatDate(eventData.startDate)}
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
              Start Time
            </Text>
            <TouchableOpacity
              onPress={() => setShowStartTimePicker(true)}
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
                {formatTime(eventData.startTime)}
              </Text>
              <FontAwesome name="clock-o" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Gathering Time (Optional) */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ 
            fontSize: 16, 
            fontWeight: '600', 
            color: theme.colors.text,
            marginBottom: 8
          }}>
            Gathering Time (Optional)
          </Text>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12
          }}>
            <View style={{ flex: 1 }}>
              <TouchableOpacity
                onPress={() => eventData.gatheringTime ? setShowGatheringTimePicker(true) : null}
                disabled={!eventData.gatheringTime}
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.inputBorder,
                  borderRadius: 8,
                  padding: 12,
                  backgroundColor: eventData.gatheringTime ? theme.colors.inputBackground : theme.colors.inputBackground + '80',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  opacity: eventData.gatheringTime ? 1 : 0.6
                }}
              >
                <Text style={{ 
                  color: eventData.gatheringTime ? theme.colors.text : theme.colors.textSecondary, 
                  fontSize: 16 
                }}>
                  {eventData.gatheringTime ? formatTime(eventData.gatheringTime) : 'No gathering time'}
                </Text>
                <FontAwesome 
                  name="clock-o" 
                  size={16} 
                  color={eventData.gatheringTime ? theme.colors.textSecondary : theme.colors.textSecondary + '80'} 
                />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => {
                if (eventData.gatheringTime) {
                  // Remove gathering time
                  setEventData(prev => ({ ...prev, gatheringTime: undefined }));
                } else {
                  // Add gathering time (30 minutes before start time)
                  const gatheringTime = new Date(eventData.startTime);
                  gatheringTime.setMinutes(gatheringTime.getMinutes() - 30);
                  setEventData(prev => ({ ...prev, gatheringTime }));
                }
              }}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 8,
                backgroundColor: eventData.gatheringTime ? theme.colors.error : theme.colors.secondary,
              }}
            >
              <Text style={{ 
                color: 'white', 
                fontWeight: '600',
                fontSize: 14
              }}>
                {eventData.gatheringTime ? 'Remove' : 'Add'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* End Date and Time */}
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
              End Date
            </Text>
            <TouchableOpacity
              onPress={() => setShowEndDatePicker(true)}
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
                {formatDate(eventData.endDate)}
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
              End Time
            </Text>
            <TouchableOpacity
              onPress={() => setShowEndTimePicker(true)}
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
                {formatTime(eventData.endTime)}
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

        {/* Capacity Management */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ 
            fontSize: 16, 
            fontWeight: '600', 
            color: theme.colors.text,
            marginBottom: 8
          }}>
            Capacity Limit
          </Text>
          
          {/* Enable/Disable Toggle */}
          <TouchableOpacity
            onPress={() => setEventData(prev => ({ 
              ...prev, 
              capacity: { 
                ...prev.capacity, 
                enabled: !prev.capacity.enabled,
                maxAttendees: !prev.capacity.enabled ? 10 : undefined
              } 
            }))}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.colors.inputBorder,
              backgroundColor: theme.colors.inputBackground,
              marginBottom: eventData.capacity.enabled ? 12 : 0
            }}
          >
            <View style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              borderWidth: 2,
              borderColor: eventData.capacity.enabled ? theme.colors.secondary : theme.colors.inputBorder,
              backgroundColor: eventData.capacity.enabled ? theme.colors.secondary : 'transparent',
              marginRight: 12,
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {eventData.capacity.enabled && (
                <FontAwesome name="check" size={12} color="white" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ 
                color: theme.colors.text, 
                fontSize: 16,
                fontWeight: '500'
              }}>
                Limit number of attendees
              </Text>
              <Text style={{ 
                color: theme.colors.textSecondary, 
                fontSize: 14,
                marginTop: 2
              }}>
                Only first {eventData.capacity.maxAttendees || 10} members who accept can attend
              </Text>
            </View>
          </TouchableOpacity>

          {/* Max Attendees Input */}
          {eventData.capacity.enabled && (
            <View>
              <Text style={{ 
                fontSize: 14, 
                fontWeight: '500', 
                color: theme.colors.text,
                marginBottom: 8
              }}>
                Maximum Attendees
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
                value={eventData.capacity.maxAttendees?.toString() || ''}
                onChangeText={(text) => {
                  const number = parseInt(text) || undefined;
                  setEventData(prev => ({ 
                    ...prev, 
                    capacity: { ...prev.capacity, maxAttendees: number } 
                  }));
                }}
                placeholder="e.g. 10"
                placeholderTextColor={theme.colors.textSecondary}
                keyboardType="numeric"
              />
            </View>
          )}
        </View>

        {/* Response Deadline */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ 
            fontSize: 16, 
            fontWeight: '600', 
            color: theme.colors.text,
            marginBottom: 8
          }}>
            Response Deadline
          </Text>
          <Text style={{ 
            fontSize: 14, 
            color: theme.colors.textSecondary,
            marginBottom: 12
          }}>
            When should members respond by? Default is event start date.
          </Text>
          
          {/* Enable/Disable Custom Deadline Toggle */}
          <TouchableOpacity
            onPress={() => setEventData(prev => ({ 
              ...prev, 
              responseDeadline: { 
                ...prev.responseDeadline, 
                enabled: !prev.responseDeadline.enabled,
                date: !prev.responseDeadline.enabled ? (() => {
                  // Default to 1 day before start date when enabling
                  const deadline = new Date(prev.startDate);
                  deadline.setDate(deadline.getDate() - 1);
                  return deadline;
                })() : undefined
              } 
            }))}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.colors.inputBorder,
              backgroundColor: theme.colors.inputBackground,
              marginBottom: eventData.responseDeadline.enabled ? 12 : 0
            }}
          >
            <View style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              borderWidth: 2,
              borderColor: eventData.responseDeadline.enabled ? theme.colors.secondary : theme.colors.inputBorder,
              backgroundColor: eventData.responseDeadline.enabled ? theme.colors.secondary : 'transparent',
              marginRight: 12,
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {eventData.responseDeadline.enabled && (
                <FontAwesome name="check" size={12} color="white" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ 
                color: theme.colors.text, 
                fontSize: 16,
                fontWeight: '500'
              }}>
                Set custom response deadline
              </Text>
              <Text style={{ 
                color: theme.colors.textSecondary, 
                fontSize: 14,
                marginTop: 2
              }}>
                {eventData.responseDeadline.enabled 
                  ? `Deadline: ${eventData.responseDeadline.date ? eventData.responseDeadline.date.toLocaleDateString() : 'Select date'}`
                  : 'Members can respond until event start date'
                }
              </Text>
            </View>
          </TouchableOpacity>

          {/* Custom Deadline Date Picker */}
          {eventData.responseDeadline.enabled && (
            <View>
              <Text style={{ 
                fontSize: 14, 
                fontWeight: '500', 
                color: theme.colors.text,
                marginBottom: 8
              }}>
                Deadline Date
              </Text>
              <TouchableOpacity
                onPress={() => setShowResponseDeadlinePicker(true)}
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
                  {eventData.responseDeadline.date ? eventData.responseDeadline.date.toLocaleDateString() : 'Select deadline date'}
                </Text>
                <FontAwesome name="calendar" size={16} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
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
      {Platform.OS === 'web' && (showStartDatePicker || showStartTimePicker || showGatheringTimePicker || showEndDatePicker || showEndTimePicker || showResponseDeadlinePicker) && (
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

      {/* Start Date Picker */}
      <CustomDateTimePicker
        value={eventData.startDate}
        mode="date"
        isVisible={showStartDatePicker}
        onConfirm={(date) => {
          setEventData(prev => ({ ...prev, startDate: date }));
          setShowStartDatePicker(false);
        }}
        onCancel={() => setShowStartDatePicker(false)}
        title="Select Start Date"
      />

      {/* Start Time Picker */}
      <CustomDateTimePicker
        value={eventData.startTime}
        mode="time"
        isVisible={showStartTimePicker}
        onConfirm={(time) => {
          setEventData(prev => ({ ...prev, startTime: time }));
          setShowStartTimePicker(false);
        }}
        onCancel={() => setShowStartTimePicker(false)}
        title="Select Start Time"
      />

      {/* Gathering Time Picker */}
      <CustomDateTimePicker
        value={eventData.gatheringTime || eventData.startTime}
        mode="time"
        isVisible={showGatheringTimePicker}
        onConfirm={(time) => {
          setEventData(prev => ({ ...prev, gatheringTime: time }));
          setShowGatheringTimePicker(false);
        }}
        onCancel={() => setShowGatheringTimePicker(false)}
        title="Select Gathering Time"
      />

      {/* End Date Picker */}
      <CustomDateTimePicker
        value={eventData.endDate}
        mode="date"
        isVisible={showEndDatePicker}
        onConfirm={(date) => {
          setEventData(prev => ({ ...prev, endDate: date }));
          setShowEndDatePicker(false);
        }}
        onCancel={() => setShowEndDatePicker(false)}
        title="Select End Date"
      />

      {/* End Time Picker */}
      <CustomDateTimePicker
        value={eventData.endTime}
        mode="time"
        isVisible={showEndTimePicker}
        onConfirm={(time) => {
          setEventData(prev => ({ ...prev, endTime: time }));
          setShowEndTimePicker(false);
        }}
        onCancel={() => setShowEndTimePicker(false)}
        title="Select End Time"
      />

      {/* Response Deadline Date Picker */}
      <CustomDateTimePicker
        value={eventData.responseDeadline.date || eventData.startDate}
        mode="date"
        isVisible={showResponseDeadlinePicker}
        onConfirm={(date) => {
          setEventData(prev => ({ 
            ...prev, 
            responseDeadline: { ...prev.responseDeadline, date } 
          }));
          setShowResponseDeadlinePicker(false);
        }}
        onCancel={() => setShowResponseDeadlinePicker(false)}
        title="Select Response Deadline"
      />

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
