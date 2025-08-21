import { theme } from '@/constants/theme';
import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface GenderPickerProps {
  label: string;
  value: 'male' | 'female' | 'other' | 'prefer-not-to-say' | null;
  onChange: (gender: 'male' | 'female' | 'other' | 'prefer-not-to-say') => void;
  error?: string;
}

const genderOptions = [
  { value: 'male' as const, label: 'Male' },
  { value: 'female' as const, label: 'Female' },
  { value: 'other' as const, label: 'Other' },
  { value: 'prefer-not-to-say' as const, label: 'Prefer not to say' },
];

const GenderPicker: React.FC<GenderPickerProps> = ({
  label,
  value,
  onChange,
  error
}) => {
  const [showOptions, setShowOptions] = useState(false);

  const handleSelect = (selectedGender: 'male' | 'female' | 'other' | 'prefer-not-to-say') => {
    onChange(selectedGender);
    setShowOptions(false);
  };

  const getDisplayText = () => {
    const option = genderOptions.find(opt => opt.value === value);
    return option ? option.label : 'Select gender';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.input, error && styles.inputError]}
        onPress={() => setShowOptions(true)}
      >
        <Text style={[styles.inputText, !value && styles.placeholder]}>
          {getDisplayText()}
        </Text>
      </TouchableOpacity>
      
      {error && <Text style={styles.errorText}>{error}</Text>}
      
      <Modal visible={showOptions} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select {label}</Text>
            <ScrollView style={styles.optionsContainer}>
              {genderOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionItem,
                    value === option.value && styles.selectedOption
                  ]}
                  onPress={() => handleSelect(option.value)}
                >
                  <Text style={[
                    styles.optionText,
                    value === option.value && styles.selectedOptionText
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity 
              style={styles.cancelButton} 
              onPress={() => setShowOptions(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    maxHeight: '60%',
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    fontWeight: theme.typography.fontWeight.bold,
  },
  optionsContainer: {
    maxHeight: 200,
  },
  optionItem: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.small,
    marginBottom: theme.spacing.xs,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selectedOption: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  optionText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    textAlign: 'center',
  },
  selectedOptionText: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  cancelButton: {
    marginTop: theme.spacing.lg,
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
});

export default GenderPicker;
