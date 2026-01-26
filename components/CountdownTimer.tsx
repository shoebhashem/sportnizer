import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface CountdownTimerProps {
  deletionScheduledAt: number; // Unix timestamp in milliseconds
  onExpire?: () => void;
  compact?: boolean;
}

export default function CountdownTimer({
  deletionScheduledAt,
  onExpire,
  compact = false,
}: CountdownTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      const diff = deletionScheduledAt - now;

      if (diff <= 0) {
        setIsExpired(true);
        setTimeRemaining('Expired');
        if (onExpire) {
          onExpire();
        }
        return;
      }

      // Calculate days, hours, minutes
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (compact) {
        setTimeRemaining(`${days}d ${hours}h`);
      } else {
        setTimeRemaining(`${days} days, ${hours} hours, ${minutes} minutes`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [deletionScheduledAt, onExpire, compact]);

  if (isExpired) {
    return (
      <View style={[styles.container, styles.expiredContainer]}>
        <Ionicons name="alert-circle" size={16} color={theme.colors.error} />
        <Text style={styles.expiredText}>Grace period expired</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Ionicons name="time-outline" size={compact ? 14 : 16} color={theme.colors.secondary} />
      <Text style={compact ? styles.compactText : styles.text}>
        {timeRemaining} remaining
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  expiredContainer: {
    gap: theme.spacing.xs,
  },
  text: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  compactText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  expiredText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.error,
    fontWeight: theme.typography.fontWeight.medium,
  },
});
