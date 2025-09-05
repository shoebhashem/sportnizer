import { FontAwesome } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Button from '../components/Button';
import { theme } from '../constants/theme';

interface EventData {
  title: string;
  description: string;
  date: Date;
  time: Date;
  location: string;
  type: 'practice' | 'game' | 'meeting' | 'other';
}

export default function CreateEventScreen() {
  const router = useRouter();
  const [eventData, setEventData] = useState<EventData>({
    title: '',
    description: '',
    date: new Date(),
    time: new Date(),
    location: '',
    type: 'practice'
  });
  
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const eventTypes = [
    { key: 'practice', label: 'Practice', icon: 'dribbble' },
    { key: 'game', label: 'Game', icon: 'trophy' },
    { key: 'meeting', label: 'Meeting', icon: 'users' },
    { key: 'other', label: 'Other', icon: 'calendar' }
  ];

  const handleNext = () => {
    if (!eventData.title.trim()) {
      Alert.alert('Error', 'Please enter an event title');
      return;
    }
    
    if (!eventData.location.trim()) {
      Alert.alert('Error', 'Please enter a location');
      return;
    }

    // Navigate to select groups screen with event data
    router.push({
      pathname: '/select-event-group' as any,
      params: {
        eventData: JSON.stringify(eventData)
      }
    });
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
        <Button
          label="Next: Select Groups"
          onPress={handleNext}
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

      {/* Date Picker */}
      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker
          value={eventData.date}
          mode="date"
          display="default"
          is24Hour={true}
          onChange={(event: any, selectedDate: any) => {
            setShowDatePicker(false);
            if (selectedDate) {
              setEventData(prev => ({ ...prev, date: selectedDate }));
            }
          }}
        />
      )}

      {/* iOS Date Picker in Modal */}
      {Platform.OS === 'ios' && showDatePicker && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
        }}>
          <View style={{
            backgroundColor: theme.colors.inputBackground,
            borderRadius: 12,
            padding: 20,
            margin: 20,
            width: '90%',
            maxWidth: 400,
          }}>
            <Text style={{ 
              color: theme.colors.text, 
              fontSize: 18, 
              fontWeight: '600', 
              textAlign: 'center',
              marginBottom: 20 
            }}>
              Select Date
            </Text>
            <DateTimePicker
              value={eventData.date}
              mode="date"
              display="spinner"
              textColor="white"
              onChange={(event: any, selectedDate: any) => {
                if (selectedDate) {
                  setEventData(prev => ({ ...prev, date: selectedDate }));
                }
              }}
              style={{ backgroundColor: theme.colors.inputBackground }}
            />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity
                onPress={() => setShowDatePicker(false)}
                style={{
                  flex: 1,
                  padding: 12,
                  backgroundColor: theme.colors.inputBorder,
                  borderRadius: 8,
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: theme.colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowDatePicker(false)}
                style={{
                  flex: 1,
                  padding: 12,
                  backgroundColor: theme.colors.secondary,
                  borderRadius: 8,
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Web Date Picker */}
      {Platform.OS === 'web' && showDatePicker && (
        <View style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: [{ translateX: -150 }, { translateY: -100 }],
          backgroundColor: theme.colors.inputBackground,
          padding: 20,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.inputBorder,
          zIndex: 1000,
          width: 300,
        }}>
          <Text style={{ color: theme.colors.text, fontSize: 16, marginBottom: 12, fontWeight: '600' }}>
            Select Date
          </Text>
          <input
            type="date"
            value={eventData.date.toISOString().split('T')[0]}
            onChange={(e) => {
              setEventData(prev => ({ ...prev, date: new Date(e.target.value) }));
            }}
            style={{
              width: '100%',
              padding: 12,
              fontSize: 16,
              borderRadius: 8,
              border: `1px solid ${theme.colors.inputBorder}`,
              backgroundColor: theme.colors.primary,
              color: theme.colors.text,
              marginBottom: 16
            }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => setShowDatePicker(false)}
              style={{
                flex: 1,
                padding: 12,
                backgroundColor: theme.colors.inputBorder,
                borderRadius: 8,
                alignItems: 'center'
              }}
            >
              <Text style={{ color: theme.colors.text }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowDatePicker(false)}
              style={{
                flex: 1,
                padding: 12,
                backgroundColor: theme.colors.secondary,
                borderRadius: 8,
                alignItems: 'center'
              }}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Time Picker */}
      {Platform.OS === 'android' && showTimePicker && (
        <DateTimePicker
          value={eventData.time}
          mode="time"
          display="clock"
          is24Hour={true}
          onChange={(event: any, selectedTime: any) => {
            setShowTimePicker(false);
            if (selectedTime) {
              setEventData(prev => ({ ...prev, time: selectedTime }));
            }
          }}
        />
      )}

      {/* iOS Time Picker in Modal */}
      {Platform.OS === 'ios' && showTimePicker && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
        }}>
          <View style={{
            backgroundColor: theme.colors.inputBackground,
            borderRadius: 12,
            padding: 20,
            margin: 20,
            width: '90%',
            maxWidth: 400,
          }}>
            <Text style={{ 
              color: theme.colors.text, 
              fontSize: 18, 
              fontWeight: '600', 
              textAlign: 'center',
              marginBottom: 20 
            }}>
              Select Time
            </Text>
            <DateTimePicker
              value={eventData.time}
              mode="time"
              display="spinner"
              textColor="white"
              onChange={(event: any, selectedTime: any) => {
                if (selectedTime) {
                  setEventData(prev => ({ ...prev, time: selectedTime }));
                }
              }}
              style={{ backgroundColor: theme.colors.inputBackground }}
            />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity
                onPress={() => setShowTimePicker(false)}
                style={{
                  flex: 1,
                  padding: 12,
                  backgroundColor: theme.colors.inputBorder,
                  borderRadius: 8,
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: theme.colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowTimePicker(false)}
                style={{
                  flex: 1,
                  padding: 12,
                  backgroundColor: theme.colors.secondary,
                  borderRadius: 8,
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Web Time Picker */}
      {Platform.OS === 'web' && showTimePicker && (
        <View style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: [{ translateX: -150 }, { translateY: -100 }],
          backgroundColor: theme.colors.inputBackground,
          padding: 20,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.inputBorder,
          zIndex: 1000,
          width: 300,
        }}>
          <Text style={{ color: theme.colors.text, fontSize: 16, marginBottom: 12, fontWeight: '600' }}>
            Select Time
          </Text>
          <input
            type="time"
            value={eventData.time.toTimeString().slice(0, 5)}
            onChange={(e) => {
              const [hours, minutes] = e.target.value.split(':');
              const newTime = new Date();
              newTime.setHours(parseInt(hours), parseInt(minutes));
              setEventData(prev => ({ ...prev, time: newTime }));
            }}
            style={{
              width: '100%',
              padding: 12,
              fontSize: 16,
              borderRadius: 8,
              border: `1px solid ${theme.colors.inputBorder}`,
              backgroundColor: theme.colors.primary,
              color: theme.colors.text,
              marginBottom: 16
            }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => setShowTimePicker(false)}
              style={{
                flex: 1,
                padding: 12,
                backgroundColor: theme.colors.inputBorder,
                borderRadius: 8,
                alignItems: 'center'
              }}
            >
              <Text style={{ color: theme.colors.text }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowTimePicker(false)}
              style={{
                flex: 1,
                padding: 12,
                backgroundColor: theme.colors.secondary,
                borderRadius: 8,
                alignItems: 'center'
              }}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
