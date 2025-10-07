import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Image,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

import { getDefaultProfilePicture } from '../constants/profilePictures';
import { theme } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import { signOutUser } from '../services/auth/authService';
import { getUserProfile, UserProfile } from '../services/user/userService';
import Button from './Button';
import ConfirmationModal from './ConfirmationModal';
import ProfilePictureUpload from './ProfilePictureUpload';

export default function UserAvatar() {
  const { user } = useAuth();
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Fetch user profile to get profile picture
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (user?.uid) {
        console.log('Fetching user profile for:', user.uid);
        const profile = await getUserProfile(user.uid);
        console.log('User profile loaded:', profile);
        setUserProfile(profile);
      }
    };
    
    fetchUserProfile();
  }, [user?.uid]);

  if (!user) return null;

  // Debug: Log the current state
  console.log('UserAvatar Debug:', {
    'user.photoURL': user.photoURL,
    'userProfile': userProfile,
    'userProfile?.photoURL': userProfile?.photoURL
  });

  const handleSignOutPress = () => {
    setModalVisible(false); // Close profile modal first
    setShowSignOutModal(true); // Show sign out confirmation
  };

  const handleSignOutConfirm = async () => {
    setIsSigningOut(true);
    setShowSignOutModal(false);
    
    try {
      const result = await signOutUser();
      if (result.success) {
        router.replace('/login');
      } else {
        // Show error in a simple alert for now
        alert('Failed to sign out. Please try again.');
      }
    } catch (error) {
      console.error('Sign out error:', error);
      alert('An error occurred while signing out. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleSignOutCancel = () => {
    setShowSignOutModal(false);
  };

  const handleEditProfile = () => {
    setModalVisible(false);
    setShowUploadModal(true);
  };

  const handleProfilePictureSuccess = (newImageUrl: string) => {
    // Update the userProfile state with the new image URL
    setUserProfile(prev => prev ? {
      ...prev,
      photoURL: newImageUrl
    } : null);
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
          {/* Always try to show an image first */}
          {(user.photoURL || userProfile?.photoURL) ? (
            <Image 
              source={{ uri: user.photoURL || userProfile?.photoURL || getDefaultProfilePicture(false) }} 
              style={styles.avatarImage}
              onError={(error) => {
                console.log('Failed to load profile image:', error);
              }}
              onLoad={() => {
                console.log('Profile image loaded successfully');
              }}
            />
          ) : (
            /* Show initials while loading or if no profile picture */
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
                  {user.photoURL || userProfile?.photoURL ? (
                    <Image 
                      source={{ uri: user.photoURL || userProfile?.photoURL || getDefaultProfilePicture(false) }} 
                      style={styles.modalAvatarImage}
                    />
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
                  onPress={handleSignOutPress}
                  disabled={isSigningOut}
                >
                  <FontAwesome name="sign-out" size={16} color={theme.colors.error} />
                  <Text style={styles.signOutText}>
                    {isSigningOut ? 'Signing Out...' : 'Sign Out'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Sign Out Confirmation Modal */}
      <ConfirmationModal
        visible={showSignOutModal}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmText="Sign Out"
        cancelText="Cancel"
        onConfirm={handleSignOutConfirm}
        onCancel={handleSignOutCancel}
        confirmButtonTheme="primary"
      />

      {/* Profile Picture Upload Modal */}
      <ProfilePictureUpload
        visible={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={handleProfilePictureSuccess}
        currentImageUrl={user.photoURL || userProfile?.photoURL}
      />
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
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
  modalAvatarImage: {
    width: 58,
    height: 58,
    borderRadius: 29,
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