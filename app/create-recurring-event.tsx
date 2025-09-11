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

interface RecurringEventData {
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  startTime: Date;
  gatheringTime?: Date; // Optional gathering time
  endTime: Date;
  location: string;
  type: 'practice' | 'game' | 'meeting' | 'other';
  capacity: {
    enabled: boolean;
    maxAttendees?: number;
  };
  recurrence: {
    pattern: 'daily' | 'weekly' | 'monthly';
    interval: number; // every X days/weeks/months
    daysOfWeek?: number[]; // 0=Sunday, 1=Monday, etc. (for weekly)
    endType: 'date' | 'count';
    occurrences?: number; // if endType is 'count'
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

export default function CreateRecurringEventScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [eventData, setEventData] = useState<RecurringEventData>({
    title: '',
    description: '',
    startDate: new Date(),
    endDate: (() => {
      const date = new Date();
      date.setMonth(date.getMonth() + 3); // Default 3 months from now
      return date;
    })(),
    startTime: new Date(),
    gatheringTime: undefined,
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
    recurrence: {
      pattern: 'weekly',
      interval: 1,
      daysOfWeek: [new Date().getDay()], // Default to current day
      endType: 'date'
    }
  });
  
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showGatheringTimePicker, setShowGatheringTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [recipients, setRecipients] = useState<RecipientSelection | null>(null);
  const [isCreating, setIsCreating] = useState(false);
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
      console.log('Create-recurring-event focused');
      console.log('Platform:', Platform.OS);
      console.log('All params:', params);
      
      const eventDataParam = params.eventData as string;
      const recipientsParam = params.recipients as string;
      
      console.log('eventDataParam:', eventDataParam);
      console.log('recipientsParam:', recipientsParam);
      console.log('processedParams.current:', processedParams.current);
      
      // Only process if params have changed
      if (eventDataParam && eventDataParam !== processedParams.current.eventData) {
        try {
          const savedEventData = JSON.parse(eventDataParam);
          console.log('Restoring recurring event data:', savedEventData);
          
          const newEventData = {
            ...savedEventData,
            startDate: new Date(savedEventData.startDate),
            endDate: new Date(savedEventData.endDate),
            startTime: new Date(savedEventData.startTime),
            gatheringTime: savedEventData.gatheringTime ? new Date(savedEventData.gatheringTime) : undefined,
            endTime: new Date(savedEventData.endTime)
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
    }, [params])
  );

  const eventTypes = [
    { key: 'practice', label: 'Practice', icon: 'dribbble' },
    { key: 'game', label: 'Game', icon: 'trophy' },
    { key: 'meeting', label: 'Meeting', icon: 'users' },
    { key: 'other', label: 'Other', icon: 'calendar' }
  ];

  const recurrencePatterns = [
    { key: 'daily', label: 'Daily', icon: 'calendar' },
    { key: 'weekly', label: 'Weekly', icon: 'calendar-o' },
    { key: 'monthly', label: 'Monthly', icon: 'calendar-plus-o' }
  ];

  const daysOfWeek = [
    { key: 0, label: 'Sun', fullLabel: 'Sunday' },
    { key: 1, label: 'Mon', fullLabel: 'Monday' },
    { key: 2, label: 'Tue', fullLabel: 'Tuesday' },
    { key: 3, label: 'Wed', fullLabel: 'Wednesday' },
    { key: 4, label: 'Thu', fullLabel: 'Thursday' },
    { key: 5, label: 'Fri', fullLabel: 'Friday' },
    { key: 6, label: 'Sat', fullLabel: 'Saturday' }
  ];

  const handleNext = () => {
    if (!eventData.title.trim()) {
      setModal({
        visible: true,
        title: 'Error',
        message: 'Please enter an event title'
      });
      return;
    }
    
    if (!eventData.location.trim()) {
      setModal({
        visible: true,
        title: 'Error',
        message: 'Please enter a location'
      });
      return;
    }

    if (eventData.startDate >= eventData.endDate) {
      setModal({
        visible: true,
        title: 'Error',
        message: 'End date must be after start date'
      });
      return;
    }

    if (eventData.recurrence.pattern === 'weekly' && (!eventData.recurrence.daysOfWeek || eventData.recurrence.daysOfWeek.length === 0)) {
      setModal({
        visible: true,
        title: 'Error',
        message: 'Please select at least one day of the week'
      });
      return;
    }

    if (eventData.recurrence.endType === 'count' && (!eventData.recurrence.occurrences || eventData.recurrence.occurrences < 1)) {
      setModal({
        visible: true,
        title: 'Error',
        message: 'Please enter a valid number of occurrences'
      });
      return;
    }

    if (recipients) {
      // Recipients already selected, create the recurring events
      handleCreateRecurringEvents();
    } else {
      // Navigate to select recipients screen with recurring event data
      router.push({
        pathname: '/select-recipients' as any,
        params: {
          feature: 'recurring-event',
          sourceScreen: 'create-recurring-event',
          data: JSON.stringify(eventData),
          eventData: JSON.stringify(eventData) // Pass event data for preservation
        }
      });
    }
  };

  const handleCreateRecurringEvents = async () => {
    console.log('handleCreateRecurringEvents called');
    console.log('eventData:', eventData);
    console.log('recipients:', recipients);
    
    if (!recipients) {
      console.log('No recipients selected');
      return;
    }

    setIsCreating(true);
    console.log('Starting recurring events creation...');

    try {
      const currentUser = await getCurrentUser();
      console.log('Current user:', currentUser);
      
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      console.log('Creating recurring events...');
      const result = await eventService.createRecurringEvents(eventData, recipients, currentUser.uid);
      console.log('Recurring events created:', result);

      // Show success message
      const totalEvents = result.eventIds.length;
      setModal({
        visible: true,
        title: 'Success!',
        message: `Recurring event "${eventData.title}" has been created with ${totalEvents} occurrences and sent to ${recipients.totalCount} recipients.`,
        type: 'success'
      });

    } catch (error) {
      console.error('Error creating recurring events:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error details:', errorMessage);
      
      setModal({
        visible: true,
        title: 'Creation Failed',
        message: `There was an error creating the recurring events: ${errorMessage}. Please try again.`,
        type: 'error'
      });
    } finally {
      setIsCreating(false);
      console.log('Recurring events creation finished');
    }
  };

  const handleModalClose = () => {
    if (modal.type === 'success') {
      // Reset form and navigate to home tab
      setEventData({
        title: '',
        description: '',
        startDate: new Date(),
        endDate: (() => {
          const date = new Date();
          date.setMonth(date.getMonth() + 3);
          return date;
        })(),
        startTime: new Date(),
        gatheringTime: undefined,
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
        recurrence: {
          pattern: 'weekly',
          interval: 1,
          daysOfWeek: [new Date().getDay()],
          endType: 'date'
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

  const formatDate = (date: Date) => {
    return date.toLocaleDateString();
  };

  const formatTime = (time: Date) => {
    const hours = time.getHours().toString().padStart(2, '0');
    const minutes = time.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const getButtonLabel = (): string => {
    console.log('getButtonLabel called - isCreating:', isCreating, 'recipients:', recipients);
    if (isCreating) {
      return 'Creating Events...';
    }
    if (recipients) {
      return `Create Recurring Events (${recipients.totalCount} recipients)`;
    }
    return 'Next: Select Recipients';
  };

  const isButtonDisabled = (): boolean => {
    return isCreating || !eventData.title.trim() || !eventData.location.trim();
  };

  const toggleDayOfWeek = (day: number) => {
    setEventData(prev => ({
      ...prev,
      recurrence: {
        ...prev.recurrence,
        daysOfWeek: prev.recurrence.daysOfWeek?.includes(day)
          ? prev.recurrence.daysOfWeek.filter(d => d !== day)
          : [...(prev.recurrence.daysOfWeek || []), day]
      }
    }));
  };

  const getRecurrenceSummary = () => {
    const { pattern, interval, daysOfWeek: selectedDays, endType, occurrences } = eventData.recurrence;
    
    let summary = `Every ${interval > 1 ? interval + ' ' : ''}${pattern === 'daily' ? 'day' : pattern === 'weekly' ? 'week' : 'month'}${interval > 1 ? 's' : ''}`;
    
    if (pattern === 'weekly' && selectedDays && selectedDays.length > 0) {
      const dayLabels = selectedDays.sort().map(dayNum => {
        const dayInfo = daysOfWeek.find(d => d.key === dayNum);
        return dayInfo ? dayInfo.label : '';
      }).filter(Boolean);
      summary += ` on ${dayLabels.join(', ')}`;
    }
    
    if (endType === 'count' && occurrences) {
      summary += `, ${occurrences} time${occurrences > 1 ? 's' : ''}`;
    } else {
      summary += ` until ${formatDate(eventData.endDate)}`;
    }
    
    return summary;
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
          Create Recurring Event
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

        {/* Recurrence Pattern */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ 
            fontSize: 16, 
            fontWeight: '600', 
            color: theme.colors.text,
            marginBottom: 8
          }}>
            Repeat Pattern
          </Text>
          <View style={{ 
            flexDirection: 'row', 
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 12
          }}>
            {recurrencePatterns.map((pattern) => (
              <TouchableOpacity
                key={pattern.key}
                onPress={() => setEventData(prev => ({ 
                  ...prev, 
                  recurrence: { 
                    ...prev.recurrence, 
                    pattern: pattern.key as any,
                    // Reset days of week when changing pattern
                    daysOfWeek: pattern.key === 'weekly' ? [new Date().getDay()] : undefined
                  } 
                }))}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: eventData.recurrence.pattern === pattern.key ? theme.colors.secondary : theme.colors.inputBorder,
                  backgroundColor: eventData.recurrence.pattern === pattern.key ? theme.colors.secondary + '20' : theme.colors.inputBackground
                }}
              >
                <FontAwesome 
                  name={pattern.icon as any} 
                  size={16} 
                  color={eventData.recurrence.pattern === pattern.key ? theme.colors.secondary : theme.colors.textSecondary}
                  style={{ marginRight: 8 }}
                />
                <Text style={{
                  color: eventData.recurrence.pattern === pattern.key ? theme.colors.secondary : theme.colors.textSecondary,
                  fontWeight: eventData.recurrence.pattern === pattern.key ? '600' : 'normal'
                }}>
                  {pattern.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Interval Input */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ color: theme.colors.text, marginRight: 8 }}>Every</Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: theme.colors.inputBorder,
                borderRadius: 6,
                padding: 8,
                fontSize: 16,
                backgroundColor: theme.colors.inputBackground,
                color: theme.colors.text,
                width: 60,
                textAlign: 'center',
                marginRight: 8
              }}
              value={eventData.recurrence.interval.toString()}
              onChangeText={(text) => {
                const num = parseInt(text) || 1;
                if (num >= 1 && num <= 99) {
                  setEventData(prev => ({ 
                    ...prev, 
                    recurrence: { ...prev.recurrence, interval: num } 
                  }));
                }
              }}
              keyboardType="numeric"
              maxLength={2}
            />
            <Text style={{ color: theme.colors.text }}>
              {eventData.recurrence.pattern === 'daily' ? 'day' : eventData.recurrence.pattern === 'weekly' ? 'week' : 'month'}{eventData.recurrence.interval > 1 ? 's' : ''}
            </Text>
          </View>

          {/* Days of Week Selection (Weekly only) */}
          {eventData.recurrence.pattern === 'weekly' && (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ 
                fontSize: 14, 
                fontWeight: '500', 
                color: theme.colors.text,
                marginBottom: 8
              }}>
                Select Days
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {daysOfWeek.map((day) => (
                  <TouchableOpacity
                    key={day.key}
                    onPress={() => toggleDayOfWeek(day.key)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: eventData.recurrence.daysOfWeek?.includes(day.key) ? theme.colors.secondary : theme.colors.inputBorder,
                      backgroundColor: eventData.recurrence.daysOfWeek?.includes(day.key) ? theme.colors.secondary + '20' : theme.colors.inputBackground
                    }}
                  >
                    <Text style={{
                      color: eventData.recurrence.daysOfWeek?.includes(day.key) ? theme.colors.secondary : theme.colors.textSecondary,
                      fontWeight: eventData.recurrence.daysOfWeek?.includes(day.key) ? '600' : 'normal',
                      fontSize: 12
                    }}>
                      {day.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
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

        {/* End Condition */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ 
            fontSize: 16, 
            fontWeight: '600', 
            color: theme.colors.text,
            marginBottom: 8
          }}>
            End Condition
          </Text>
          
          {/* End Type Toggle */}
          <View style={{ 
            flexDirection: 'row', 
            gap: 8,
            marginBottom: 12
          }}>
            <TouchableOpacity
              onPress={() => setEventData(prev => ({ 
                ...prev, 
                recurrence: { ...prev.recurrence, endType: 'date' } 
              }))}
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: eventData.recurrence.endType === 'date' ? theme.colors.secondary : theme.colors.inputBorder,
                backgroundColor: eventData.recurrence.endType === 'date' ? theme.colors.secondary + '20' : theme.colors.inputBackground
              }}
            >
              <Text style={{
                color: eventData.recurrence.endType === 'date' ? theme.colors.secondary : theme.colors.textSecondary,
                fontWeight: eventData.recurrence.endType === 'date' ? '600' : 'normal',
                textAlign: 'center'
              }}>
                End Date
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setEventData(prev => ({ 
                ...prev, 
                recurrence: { ...prev.recurrence, endType: 'count', occurrences: 10 } 
              }))}
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: eventData.recurrence.endType === 'count' ? theme.colors.secondary : theme.colors.inputBorder,
                backgroundColor: eventData.recurrence.endType === 'count' ? theme.colors.secondary + '20' : theme.colors.inputBackground
              }}
            >
              <Text style={{
                color: eventData.recurrence.endType === 'count' ? theme.colors.secondary : theme.colors.textSecondary,
                fontWeight: eventData.recurrence.endType === 'count' ? '600' : 'normal',
                textAlign: 'center'
              }}>
                # of Times
              </Text>
            </TouchableOpacity>
          </View>

          {/* End Date Picker */}
          {eventData.recurrence.endType === 'date' && (
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
          )}

          {/* Occurrence Count Input */}
          {eventData.recurrence.endType === 'count' && (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.inputBorder,
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 16,
                  backgroundColor: theme.colors.inputBackground,
                  color: theme.colors.text,
                  width: 80,
                  textAlign: 'center',
                  marginRight: 12
                }}
                value={eventData.recurrence.occurrences?.toString() || ''}
                onChangeText={(text) => {
                  const num = parseInt(text) || 0;
                  if (num >= 1 && num <= 999) {
                    setEventData(prev => ({ 
                      ...prev, 
                      recurrence: { ...prev.recurrence, occurrences: num } 
                    }));
                  }
                }}
                placeholder="10"
                placeholderTextColor={theme.colors.textSecondary}
                keyboardType="numeric"
                maxLength={3}
              />
              <Text style={{ color: theme.colors.text }}>occurrences</Text>
            </View>
          )}
        </View>

        {/* Recurrence Summary */}
        <View style={{ 
          marginBottom: 20,
          padding: 12,
          backgroundColor: theme.colors.inputBackground,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.colors.inputBorder
        }}>
          <Text style={{ 
            fontSize: 14, 
            fontWeight: '500', 
            color: theme.colors.text,
            marginBottom: 4
          }}>
            Recurrence Summary
          </Text>
          <Text style={{ 
            fontSize: 14, 
            color: theme.colors.textSecondary
          }}>
            {getRecurrenceSummary()}
          </Text>
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
                Only first {eventData.capacity.maxAttendees || 10} members who accept can attend each occurrence
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
                    feature: 'recurring-event',
                    sourceScreen: 'create-recurring-event',
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
      {Platform.OS === 'web' && (showStartDatePicker || showStartTimePicker || showGatheringTimePicker || showEndDatePicker || showEndTimePicker) && (
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
        title="Select Recurrence End Date"
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
