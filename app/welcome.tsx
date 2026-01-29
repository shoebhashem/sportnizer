import Button from '@/components/Button';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useUser } from '@/contexts/UserContext';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WelcomeScreen() {
  const { user } = useAuth();
  const { userProfile } = useUser();

  // Redirect authenticated users with clubs to home
  useEffect(() => {
    if (user && userProfile?.clubAccess && userProfile.clubAccess.length > 0) {
      router.replace('/(tabs)');
    }
  }, [user, userProfile]);

  const handleCreateClub = () => {
    if (user) {
      // User is authenticated but has no clubs - go directly to create club form
      router.replace('/create-club-form');
    } else {
      // User needs to sign up first
      router.replace('/signup?action=createClub' as any);
    }
  };

  const handleSignIn = () => {
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Logo/Icon Section */}
        <View style={styles.logoContainer}>
          <Image 
            source={require('@/assets/images/sportnizer_logo.png')} 
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.logoText}>Sportnizer</Text>
        </View>

        {/* Tagline */}
        <View style={styles.taglineContainer}>
          <Text style={styles.tagline}>Organize teams.</Text>
          <Text style={styles.tagline}>Schedule events.</Text>
          <Text style={styles.tagline}>Stay connected.</Text>
        </View>

        {/* Main Action Button */}
        <View style={styles.actionContainer}>
          <Button
            label="🏢 Create Your Club"
            theme="primary"
            onPress={handleCreateClub}
          />
          <Text style={styles.actionSubtext}>
            {user 
              ? "Set up your organization and start managing teams"
              : "Get started in minutes - no experience needed"
            }
          </Text>
        </View>

        {/* Sign In Option */}
        {!user && (
          <View style={styles.signInContainer}>
            <Text style={styles.signInText}>Already have an account?</Text>
            <TouchableOpacity onPress={handleSignIn}>
              <Text style={styles.signInLink}>Sign In →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Features List (optional) */}
        <View style={styles.featuresContainer}>
          <FeatureItem icon="✓" text="Create clubs and groups" />
          <FeatureItem icon="✓" text="Schedule events and practices" />
          <FeatureItem icon="✓" text="Communicate with teams" />
          <FeatureItem icon="✓" text="Track attendance and responses" />
        </View>
      </View>
    </SafeAreaView>
  );
}

const FeatureItem = ({ icon, text }: { icon: string; text: string }) => (
  <View style={styles.featureItem}>
    <Text style={styles.featureIcon}>{icon}</Text>
    <Text style={styles.featureText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.layout.containerPadding,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: theme.spacing.md,
    backgroundColor: 'transparent',
  },
  logoText: {
    fontSize: theme.typography.fontSize.xxlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.secondary,
  },
  taglineContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.xxl,
  },
  tagline: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.textSecondary,
    marginVertical: theme.spacing.xs,
  },
  actionContainer: {
    width: '100%',
    marginBottom: theme.spacing.xl,
  },
  actionSubtext: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  signInContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xxl,
  },
  signInText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginRight: theme.spacing.sm,
  },
  signInLink: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  featuresContainer: {
    width: '100%',
    marginTop: theme.spacing.xl,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: theme.spacing.sm,
  },
  featureIcon: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.secondary,
    marginRight: theme.spacing.md,
    width: 30,
  },
  featureText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
  },
});
