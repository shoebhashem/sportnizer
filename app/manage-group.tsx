import Button from '@/components/Button';
import { theme } from '@/constants/theme';
import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ManageGroupScreen() {
  const handleGoBack = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Manage Group</Text>
          <Text style={styles.subtitle}>Manage your sports group settings and members</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.placeholderContainer}>
            <Text style={styles.placeholderText}>
              Group management features will be implemented here
            </Text>
          </View>

          <View style={styles.buttonContainer}>
            <Button
              label="Go Back"
              onPress={handleGoBack}
              theme="secondary"
            />
          </View>
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
    width: '100%',
  },
  placeholderContainer: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xl,
  },
  placeholderText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonContainer: {
    width: '100%',
  },
});
