import React, { useEffect } from 'react';
import ReactDatePicker from 'react-datepicker';
import { Text, TouchableOpacity, View } from 'react-native';

import { theme } from '../../constants/theme';

// Import CSS
import 'react-datepicker/dist/react-datepicker.css';

interface DateTimePickerProps {
  value: Date;
  mode: 'date' | 'time';
  isVisible: boolean;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
  title?: string;
}

// Global flag to prevent multiple style injections
let stylesInjected = false;

const injectStyles = () => {
  if (stylesInjected) return;
  
  const styleId = 'custom-datepicker-styles';
  if (document.getElementById(styleId)) return;
  
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .custom-datepicker {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .custom-datepicker .react-datepicker {
      background-color: ${theme.colors.inputBackground};
      border: 1px solid ${theme.colors.inputBorder};
      border-radius: 8px;
      color: ${theme.colors.text};
    }
    .custom-datepicker .react-datepicker__header {
      background-color: ${theme.colors.primary};
      border-bottom: 1px solid ${theme.colors.inputBorder};
      color: ${theme.colors.text};
    }
    .custom-datepicker .react-datepicker__current-month,
    .custom-datepicker .react-datepicker-time__header {
      color: ${theme.colors.text};
      font-weight: 600;
    }
    .custom-datepicker .react-datepicker__day-name {
      color: ${theme.colors.textSecondary};
      font-weight: 600;
    }
    .custom-datepicker .react-datepicker__day,
    .custom-datepicker .react-datepicker__time-name {
      background-color: ${theme.colors.inputBackground};
      color: ${theme.colors.text};
      border-radius: 4px;
      margin: 1px;
    }
    .custom-datepicker .react-datepicker__day:hover {
      background-color: ${theme.colors.secondary};
      color: ${theme.colors.primary};
    }
    .custom-datepicker .react-datepicker__day--selected,
    .custom-datepicker .react-datepicker__day--keyboard-selected {
      background-color: ${theme.colors.secondary};
      color: ${theme.colors.primary};
      font-weight: 600;
    }
    .custom-datepicker .react-datepicker__day--today {
      background-color: ${theme.colors.inputBorder};
      color: ${theme.colors.text};
      font-weight: 600;
    }
    .custom-datepicker .react-datepicker__day--outside-month {
      background-color: ${theme.colors.primary};
      color: ${theme.colors.textSecondary};
    }
    .custom-datepicker .react-datepicker__time-container .react-datepicker__time .react-datepicker__time-box {
      background-color: ${theme.colors.inputBackground};
    }
    .custom-datepicker .react-datepicker__time-list-item {
      background-color: ${theme.colors.inputBackground};
      color: ${theme.colors.text};
      padding: 8px 16px;
    }
    .custom-datepicker .react-datepicker__time-list-item:hover {
      background-color: ${theme.colors.secondary};
      color: ${theme.colors.primary};
    }
    .custom-datepicker .react-datepicker__time-list-item--selected {
      background-color: ${theme.colors.secondary};
      color: ${theme.colors.primary};
      font-weight: 600;
    }
    .custom-datepicker .react-datepicker__navigation {
      border: none;
    }
    .custom-datepicker .react-datepicker__navigation--previous {
      border-right-color: ${theme.colors.text};
    }
    .custom-datepicker .react-datepicker__navigation--next {
      border-left-color: ${theme.colors.text};
    }
    .custom-datepicker .react-datepicker__month {
      background-color: ${theme.colors.inputBackground};
    }
  `;
  
  document.head.appendChild(style);
  stylesInjected = true;
};

export default function CustomDateTimePicker({
  value,
  mode,
  isVisible,
  onConfirm,
  onCancel,
  title
}: DateTimePickerProps) {
  useEffect(() => {
    injectStyles();
  }, []);

  if (!isVisible) return null;

  const handleDateChange = (date: Date | null) => {
    if (date) {
      onConfirm(date);
    }
  };

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
        
        <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
          <ReactDatePicker
              selected={value}
              onChange={handleDateChange}
              showTimeSelect={mode === 'time'}
              showTimeSelectOnly={mode === 'time'}
              timeIntervals={15}
              timeCaption="Time"
              timeFormat="HH:mm"
              dateFormat={mode === 'date' ? "MMMM d, yyyy" : "HH:mm"}
              inline
              calendarClassName="custom-datepicker"
            />
          </div>
          
          <View style={{ flexDirection: 'row', gap: 12 }}>
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
