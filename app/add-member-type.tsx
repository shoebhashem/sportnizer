import Button from '@/components/Button';
import { theme } from '@/constants/theme';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

export default function AddMemberTypeScreen() {
  const { groupId, clubId, groupName, clubName } = useLocalSearchParams();

  const handleRegularMember = () => {
    // Navigate to regular member addition screen
    router.push(`/add-regular-member?groupId=${groupId}&clubId=${clubId}&groupName=${groupName}&clubName=${clubName}` as any);
  };

  const handleChildYouthMember = () => {
    // Navigate to child/youth member addition screen
    router.push(`/add-child-member?groupId=${groupId}&clubId=${clubId}&groupName=${groupName}&clubName=${clubName}` as any);
  };

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
          <Text style={styles.title}>Add Member</Text>
          <Text style={styles.subtitle}>
            Choose the type of member you want to add to {groupName || 'this group'}
          </Text>
        </View>

        <View style={styles.optionsContainer}>
          {/* Regular Member Option */}
          <View style={styles.optionCard}>
            <Text style={styles.optionTitle}>Regular Member</Text>
            <Text style={styles.optionDescription}>
              Adult members who are eligible to respond to events and communications themselves.
            </Text>
            <Button
              label="Add Regular Member"
              onPress={handleRegularMember}
              theme="primary"
            />
          </View>

          {/* Child/Youth Member Option */}
          <View style={styles.optionCard}>
            <Text style={styles.optionTitle}>Child/Youth Member</Text>
            <Text style={styles.optionDescription}>
              Young members who need guardians to handle communications and make decisions regarding events.
            </Text>
            <Button
              label="Add Child/Youth Member"
              onPress={handleChildYouthMember}
              theme="primary"
            />
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <Button
            label="Go Back"
            onPress={handleGoBack}
            theme="secondary"
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
    paddingVertical: theme.spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xxl,
  },
  title: {
    fontSize: theme.typography.fontSize.xxlarge,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  optionsContainer: {
    flex: 1,
    gap: theme.spacing.xl,
  },
  optionCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  optionTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  optionDescription: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: theme.spacing.lg,
  },
  buttonContainer: {
    marginTop: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
  },
});
