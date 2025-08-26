import AdContainer from '@/components/AdContainer';
import Button from '@/components/Button';
import { theme } from '@/constants/theme';
import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function GroupsScreen() {
  const handleCreateGroup = () => {
    router.push('/create-group');
  };

  const handleManageTeams = () => {
    router.push('/manageteams');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>My Groups</Text>
          <Text style={styles.subtitle}>Create and manage your sports groups</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.buttonContainer}>
            <Button
              label="Create New Group"
              onPress={handleCreateGroup}
              theme="primary"
              icon="plus"
            />
            
            <Button
              label="Manage Teams"
              onPress={handleManageTeams}
              theme="secondary"
              icon="users"
            />
          </View>

          <View style={styles.infoContainer}>
            <Text style={styles.infoText}>
              🏆 Create groups for your sports teams{'\n'}
              👥 Invite members and manage roles{'\n'}
              📅 Schedule events and track attendance{'\n'}
              📊 Monitor team statistics and performance
            </Text>
          </View>
        </View>
      </ScrollView>
      
      <AdContainer position="bottom" />
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
  header: {
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  title: {
    fontSize: theme.typography.fontSize.xlarge,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.bold,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    lineHeight: 22,
  },
  content: {
    flex: 1,
    alignItems: 'center',
  },
  buttonContainer: {
    width: '100%',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  infoContainer: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.lg,
    width: '100%',
    marginTop: theme.spacing.lg,
  },
  infoText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    lineHeight: 24,
    textAlign: 'left',
  },
});
