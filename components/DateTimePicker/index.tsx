import DateTimePicker from '@react-native-community/datetimepicker';
import React from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';

import { theme } from '../../constants/theme';

interface DateTimePickerProps {
  value: Date;
  mode: 'date' | 'time';
  isVisible: boolean;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
  title?: string;
}

export default function CustomDateTimePicker({
  value,
  mode,
  isVisible,
  onConfirm,
  onCancel,
  title
}: DateTimePickerProps) {
  if (!isVisible) return null;

  // Android - Direct picker
  if (Platform.OS === 'android') {
    return (
      <DateTimePicker
        value={value}
        mode={mode}
        display={mode === 'time' ? 'clock' : 'default'}
        is24Hour={true}
        onChange={(event: any, selectedValue: any) => {
          onCancel(); // Always close the picker
          if (selectedValue && event.type === 'set') {
            onConfirm(selectedValue);
          }
        }}
      />
    );
  }

  // iOS - Modal picker
  return (
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
          {title || (mode === 'date' ? 'Select Date' : 'Select Time')}
        </Text>
        
        <DateTimePicker
          value={value}
          mode={mode}
          display="spinner"
          textColor="white"
          onChange={(event: any, selectedValue: any) => {
            if (selectedValue) {
              onConfirm(selectedValue);
            }
          }}
          style={{ backgroundColor: theme.colors.inputBackground }}
        />
        
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
          <TouchableOpacity
            onPress={onCancel}
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
            onPress={onCancel}
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
  );
}
