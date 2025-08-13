import { StyleSheet, View, Pressable, Text, ActivityIndicator } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { theme } from '@/constants/theme';

type Props = {
  label: string;
  onPress?: () => void;
  theme?: "primary" | "secondary";
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof FontAwesome.glyphMap;
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
          disabled && styles.disabledButton
        ]}
        onPress={disabled || loading ? undefined : onPress}
        disabled={disabled || loading}
      >
        {loading ? (
          <ActivityIndicator 
            size="small" 
            color={isPrimary ? theme.colors.primary : theme.colors.text} 
          />
        ) : (
          <>
            {icon && (
              <FontAwesome 
                name={icon} 
                size={18} 
                color={isPrimary ? theme.colors.primary : theme.colors.text} 
                style={styles.buttonIcon} 
              />
            )}
            <Text style={[
              styles.buttonLabel, 
              isPrimary && styles.primaryLabel,
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
  disabledLabel: {
    color: theme.colors.textSecondary,
  },
});
