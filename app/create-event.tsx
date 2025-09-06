import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
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

interface EventData {
  title: string;
  description: string;
  date: Date;
  time: Date;
  location: string;
  type: 'practice' | 'game' | 'meeting' | 'other';
}

interface ModalState {
  visible: boolean;
  title: string;
  message: string;
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
  const [modal, setModal] = useState<ModalState>({
    visible: false,
    title: '',
    message: ''
  });

  const eventTypes = [
    { key: 'practice', label: 'Practice', icon: 'dribbble' },
    { key: 'game', label: 'Game', icon: 'trophy' },
    { key: 'meeting', label: 'Meeting', icon: 'users' },
    { key: 'other', label: 'Other', icon: 'calendar' }
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

    // Navigate to select recipients screen with event data
    router.push({
      pathname: '/select-event-group' as any,
      params: {
        eventData: JSON.stringify(eventData)
      }
    });
  };

  const handleModalClose = () => {
    setModal({ ...modal, visible: false });
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
          label="Next: Select Recipients"
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
        confirmText="OK"
        cancelText={undefined}
        onConfirm={handleModalClose}
        onCancel={handleModalClose}
        confirmButtonTheme="primary"
      />
    </SafeAreaView>
  );
}
