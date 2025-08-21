import { theme } from '@/constants/theme';
import React, { useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface DatePickerProps {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  error?: string;
  minimumDate?: Date;
  maximumDate?: Date;
}

const DatePicker: React.FC<DatePickerProps> = ({
  label,
  value,
  onChange,
  placeholder = "Select date",
  error,
  minimumDate,
  maximumDate
}) => {
  const [showPicker, setShowPicker] = useState(false);

  const handleDateChange = (selectedDate: Date) => {
    setShowPicker(false);
    onChange(selectedDate);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // For web, we'll use HTML5 date input
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>{label}</Text>
        <input
          type="date"
          value={value ? value.toISOString().split('T')[0] : ''}
          onChange={(e) => {
            const selectedDate = e.target.value ? new Date(e.target.value) : null;
            onChange(selectedDate);
          }}
          min={minimumDate?.toISOString().split('T')[0]}
          max={maximumDate?.toISOString().split('T')[0]}
          style={{
            backgroundColor: theme.colors.inputBackground,
            border: `1px solid ${error ? theme.colors.error : theme.colors.inputBorder}`,
            borderRadius: theme.borderRadius.small,
            padding: theme.spacing.sm,
            minHeight: 50,
            fontSize: theme.typography.fontSize.medium,
            color: theme.colors.text,
            width: '100%',
          }}
        />
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>
    );
  }

  // For mobile platforms, use a simple modal with date selection
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.input, error && styles.inputError]}
        onPress={() => setShowPicker(true)}
      >
        <Text style={[styles.inputText, !value && styles.placeholder]}>
          {value ? formatDate(value) : placeholder}
        </Text>
      </TouchableOpacity>
      
      {error && <Text style={styles.errorText}>{error}</Text>}
      
      <Modal visible={showPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select {label}</Text>
            <SimpleDatePicker
              value={value || new Date()}
              onChange={handleDateChange}
              onCancel={() => setShowPicker(false)}
              minimumDate={minimumDate}
              maximumDate={maximumDate}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

// Simple date picker for mobile
const SimpleDatePicker: React.FC<{
  value: Date;
  onChange: (date: Date) => void;
  onCancel: () => void;
  minimumDate?: Date;
  maximumDate?: Date;
}> = ({ value, onChange, onCancel }) => {
  return (
    <View style={styles.pickerContainer}>
      <Text style={styles.selectedDate}>
        {value.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}
      </Text>
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.confirmButton} 
          onPress={() => onChange(value)}
        >
          <Text style={styles.confirmButtonText}>Select</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    fontWeight: theme.typography.fontWeight.medium,
  },
  input: {
    backgroundColor: theme.colors.inputBackground,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderRadius: theme.borderRadius.small,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minHeight: 50,
    justifyContent: 'center',
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  inputText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  placeholder: {
    color: theme.colors.textSecondary,
  },
  errorText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.medium,
    width: '80%',
    maxWidth: 300,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    fontWeight: theme.typography.fontWeight.bold,
  },
  pickerContainer: {
    alignItems: 'center',
  },
  selectedDate: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: theme.spacing.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.small,
    borderWidth: 1,
    borderColor: theme.colors.textSecondary,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.medium,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.small,
    backgroundColor: theme.colors.secondary,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: theme.colors.primary,
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.bold,
  },
});

export default DatePicker;
