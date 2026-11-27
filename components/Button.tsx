import { type ComponentProps } from 'react';
import { StyleSheet, View, Pressable, Text, ActivityIndicator } from 'react-native';
import FontAwesome from "@react-native-vector-icons/fontawesome/static";
import { theme } from '@/constants/theme';

type Props = {
  label: string;
  onPress?: () => void;
  theme?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  icon?: ComponentProps<typeof FontAwesome>['name'];
};

export default function Button({ 
  label, 
  onPress, 
  theme: buttonTheme = "secondary", 
  disabled = false, 
  loading = false,
  icon 
}: Props) {
  const isPrimary = buttonTheme === 'primary';
  // Destructive actions (delete, close, cancel a fee): red button, white text
  const isDanger = buttonTheme === 'danger';
  const contentColor = isPrimary
    ? theme.colors.primary
    : isDanger
      ? theme.colors.white
      : theme.colors.text;
  
  return (
    <View style={[
      styles.buttonContainer,
      isPrimary && styles.primaryContainer,
      disabled && styles.disabledContainer
    ]}>
      <Pressable
        style={[
          styles.button, 
          isPrimary && styles.primaryButton,
          isDanger && styles.dangerButton,
          disabled && styles.disabledButton
        ]}
        onPress={disabled || loading ? undefined : onPress}
        disabled={disabled || loading}
      >
        {loading ? (
          <ActivityIndicator 
            size="small" 
            color={contentColor} 
          />
        ) : (
          <>
            {icon && (
              <FontAwesome 
                name={icon} 
                size={18} 
                color={contentColor} 
                style={styles.buttonIcon} 
              />
            )}
            <Text style={[
              styles.buttonLabel, 
              isPrimary && styles.primaryLabel,
              isDanger && styles.dangerLabel,
              disabled && styles.disabledLabel
            ]}>
              {label}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    width: '100%',
    height: theme.layout.buttonHeight,
    marginVertical: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryContainer: {
    borderWidth: 2,
    borderColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.large,
    padding: 3,
  },
  disabledContainer: {
    opacity: 0.6,
  },
  button: {
    borderRadius: theme.borderRadius.medium,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    backgroundColor: 'transparent',
  },
  primaryButton: {
    backgroundColor: theme.colors.white,
  },
  dangerButton: {
    backgroundColor: theme.colors.error,
  },
  disabledButton: {
    backgroundColor: theme.colors.textSecondary,
  },
  buttonIcon: {
    marginRight: theme.spacing.sm,
  },
  buttonLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
  },
  primaryLabel: {
    color: theme.colors.primary,
  },
  dangerLabel: {
    color: theme.colors.white,
  },
  disabledLabel: {
    color: theme.colors.textSecondary,
  },
});
