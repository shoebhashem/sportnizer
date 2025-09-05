import Button from '@/components/Button';
import { theme } from '@/constants/theme';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EventsScreen() {
  const router = useRouter();
  
  const handleCreateEvent = () => {
    router.push('/create-event' as any);
  };

  const handleRecurringEvents = () => {
    // TODO: Implement recurring events functionality
    console.log('Schedule recurring events');
  };

  const handleCreatePoll = () => {
    // TODO: Implement poll creation functionality
    console.log('Create poll');
  };

  const handleMakeAnnouncement = () => {
    // TODO: Implement announcement functionality
    console.log('Make announcement');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <Button
            label="Schedule one-time event"
            onPress={handleCreateEvent}
            theme="primary"
            icon="plus"
          />

          <Button
            label="Schedule recurring events"
            onPress={handleRecurringEvents}
            theme="primary"
            icon="refresh"
          />

          <Button
            label="Create poll"
            onPress={handleCreatePoll}
            theme="primary"
            icon="bar-chart"
          />

          <Button
            label="Make announcement"
            onPress={handleMakeAnnouncement}
            theme="primary"
            icon="bullhorn"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.layout.containerPadding,
    paddingBottom: theme.spacing.xl,
  },
  actionsContainer: {
    marginTop: theme.spacing.xl,
    width: '100%',
  },
});
