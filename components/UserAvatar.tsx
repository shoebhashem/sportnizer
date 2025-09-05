import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import React, { useState } from 'react';
import {
    Alert,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

import { theme } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebaseConfig.js';
import Button from './Button';

export default function UserAvatar() {
  const { user } = useAuth();
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);

  if (!user) return null;

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut(auth);
              setModalVisible(false);
              router.replace('/login' as any);
            } catch (error) {
              console.error('Error signing out:', error);
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleEditProfile = () => {
    setModalVisible(false);
    // TODO: Navigate to edit profile screen
    Alert.alert('Coming Soon', 'Edit profile feature will be available soon!');
  };

  const getInitials = (email: string) => {
    const name = email.split('@')[0];
    return name.charAt(0).toUpperCase();
  };

  const getUserDisplayName = () => {
    if (user.displayName) {
      return user.displayName;
    }
    // Extract name from email (part before @)
    const emailName = user.email?.split('@')[0] || 'User';
    return emailName.charAt(0).toUpperCase() + emailName.slice(1).toLowerCase();
  };

  return (
    <>
      {/* Avatar Button */}
      <TouchableOpacity
        style={styles.avatarButton}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <View style={styles.avatar}>
          {user.photoURL ? (
            // TODO: Implement Image component for profile pictures
            <FontAwesome name="user" size={20} color={theme.colors.primary} />
          ) : (
            <Text style={styles.avatarText}>
              {getInitials(user.email || 'U')}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Profile Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <View style={styles.modalAvatar}>
                  {user.photoURL ? (
                    <FontAwesome name="user" size={32} color={theme.colors.primary} />
                  ) : (
                    <Text style={styles.modalAvatarText}>
                      {getInitials(user.email || 'U')}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setModalVisible(false)}
                >
                  <FontAwesome name="times" size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* User Info */}
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{getUserDisplayName()}</Text>
                <Text style={styles.userEmail}>{user.email}</Text>
                <Text style={styles.userRole}>Member</Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionButtons}>
                <Button
                  label="Edit Profile"
                  onPress={handleEditProfile}
                  icon="edit"
                  theme="secondary"
                />
              </View>

              {/* Sign Out Button */}
              <View style={styles.signOutSection}>
                <TouchableOpacity
                  style={styles.signOutButton}
                  onPress={handleSignOut}
                >
                  <FontAwesome name="sign-out" size={16} color={theme.colors.error} />
                  <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  avatarButton: {
    padding: 4,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.inputBorder,
  },
  avatarText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    width: '85%',
    maxWidth: 320,
    paddingVertical: 24,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  modalAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: theme.colors.inputBorder,
  },
  modalAvatarText: {
    color: theme.colors.primary,
    fontSize: 24,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: 24,
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  userRole: {
    fontSize: 12,
    color: theme.colors.secondary,
    backgroundColor: theme.colors.secondary + '20',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  actionButtons: {
    marginBottom: 24,
  },
  signOutSection: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
    paddingTop: 16,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.error + '10',
    borderWidth: 1,
    borderColor: theme.colors.error + '30',
  },
  signOutText: {
    color: theme.colors.error,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
