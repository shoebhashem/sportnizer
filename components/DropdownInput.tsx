import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type DropdownOption = {
  id: string;
  name: string;
};

type Props = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: string[] | DropdownOption[];
  placeholder?: string;
  error?: string;
};

export default function DropdownInput({ 
  label, 
  value, 
  onValueChange, 
  options, 
  placeholder = 'Select an option',
  error 
}: Props) {
  const [isOpen, setIsOpen] = useState(false);

  // Helper functions to handle both string[] and DropdownOption[]
  const isOptionObject = (option: string | DropdownOption): option is DropdownOption => {
    return typeof option === 'object' && 'id' in option && 'name' in option;
  };

  const getOptionId = (option: string | DropdownOption): string => {
    return isOptionObject(option) ? option.id : option;
  };

  const getOptionName = (option: string | DropdownOption): string => {
    return isOptionObject(option) ? option.name : option;
  };

  const getDisplayValue = (): string => {
    if (!value) return placeholder;
    
    // Find the option that matches the current value
    const matchingOption = options.find(option => getOptionId(option) === value);
    return matchingOption ? getOptionName(matchingOption) : placeholder;
  };

  const handleSelect = (selectedValue: string) => {
    onValueChange(selectedValue);
    setIsOpen(false);
  };

  const displayValue = getDisplayValue();
  const isPlaceholder = !value;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable 
        style={[
          styles.dropdown,
          error && styles.dropdownError
        ]}
        onPress={() => setIsOpen(true)}
      >
        <Text style={[
          styles.dropdownText,
          isPlaceholder && styles.placeholderText
        ]}>
          {displayValue}
        </Text>
        <Ionicons 
          name={isOpen ? 'chevron-up' : 'chevron-down'} 
          size={20} 
          color={theme.colors.textSecondary} 
        />
      </Pressable>
      {error && <Text style={styles.errorText}>{error}</Text>}

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setIsOpen(false)}>
          <View style={styles.modalContainer}>
            <Pressable onPress={() => {}} style={styles.modal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{label}</Text>
                <Pressable 
                  style={styles.closeButton}
                  onPress={() => setIsOpen(false)}
                >
                  <Ionicons name="close" size={24} color={theme.colors.text} />
                </Pressable>
              </View>
              
              <ScrollView style={styles.optionsList} showsVerticalScrollIndicator={false}>
                {options.map((option, index) => {
                  const optionId = getOptionId(option);
                  const optionName = getOptionName(option);
                  const isSelected = optionId === value;
                  
                  return (
                    <Pressable
                      key={index}
                      style={[
                        styles.option,
                        isSelected && styles.selectedOption
                      ]}
                      onPress={() => handleSelect(optionId)}
                    >
                      <Text style={[
                        styles.optionText,
                        isSelected && styles.selectedOptionText
                      ]}>
                        {optionName}
                      </Text>
                      {isSelected && (
                        <Ionicons 
                          name="checkmark" 
                          size={20} 
                          color={theme.colors.secondary} 
                        />
                      )}
                    </Pressable>
                  )
                })}
              </ScrollView>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.inputBackground,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderRadius: theme.borderRadius.medium,
    height: theme.layout.inputHeight,
    paddingHorizontal: theme.spacing.md,
  },
  dropdownError: {
    borderColor: theme.colors.error,
  },
  dropdownText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    flex: 1,
  },
  placeholderText: {
    color: theme.colors.textSecondary,
  },
  errorText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '70%',
    padding: theme.spacing.md,
  },
  modal: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.large,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  closeButton: {
    padding: theme.spacing.xs,
  },
  optionsList: {
    maxHeight: 300,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  selectedOption: {
    backgroundColor: theme.colors.inputBackground,
  },
  optionText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    flex: 1,
  },
  selectedOptionText: {
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
});
