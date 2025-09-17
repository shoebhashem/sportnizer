import { getAuth } from 'firebase/auth';
import { doc, getFirestore, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebaseConfig';

export interface ProfilePictureUploadResult {
  success: boolean;
  profilePictureUrl?: string;
  error?: string;
}

/**
 * Get the appropriate storage path for a user's profile picture
 */
export const getUserProfilePicturePath = (userId: string): string => {
  return `users/${userId}/profile.jpg`;
};

/**
 * Get the appropriate storage path for a group member's profile picture
 */
export const getMemberProfilePicturePath = (groupId: string, memberId: string): string => {
  return `groups/${groupId}/members/${memberId}/profile.jpg`;
};

/**
 * Upload profile picture for the current user
 */
export const uploadUserProfilePicture = async (
  imageUri: string,
  userId?: string
): Promise<ProfilePictureUploadResult> => {
  try {
    const auth = getAuth();
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      return { success: false, error: 'User not authenticated' };
    }

    // Use provided userId or current user's ID
    const targetUserId = userId || currentUser.uid;
    
    // For security, only allow users to upload their own profile picture
    if (targetUserId !== currentUser.uid) {
      return { success: false, error: 'You can only upload your own profile picture' };
    }

    // Convert image URI to blob
    const response = await fetch(imageUri);
    const blob = await response.blob();

    // Create storage reference
    const storageRef = ref(storage, getUserProfilePicturePath(targetUserId));

    // Upload image
    const snapshot = await uploadBytes(storageRef, blob);
    
    // Get download URL (the extension will create resized version)
    const downloadUrl = await getDownloadURL(snapshot.ref);

    // Update user document in Firestore
    const db = getFirestore();
    const userRef = doc(db, 'users', targetUserId);
    await updateDoc(userRef, {
      profilePicture: downloadUrl,
      hasCustomImage: true,
      profilePictureUpdatedAt: new Date()
    });

    return { 
      success: true, 
      profilePictureUrl: downloadUrl 
    };

  } catch (error: any) {
    console.error('Error uploading profile picture:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to upload profile picture' 
    };
  }
};

/**
 * Upload profile picture for a group member (for guardians uploading child photos)
 */
export const uploadMemberProfilePicture = async (
  groupId: string,
  memberId: string,
  imageUri: string
): Promise<ProfilePictureUploadResult> => {
  try {
    const auth = getAuth();
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      return { success: false, error: 'User not authenticated' };
    }

    // Convert image URI to blob
    const response = await fetch(imageUri);
    const blob = await response.blob();

    // Create storage reference
    const storageRef = ref(storage, getMemberProfilePicturePath(groupId, memberId));

    // Upload image
    const snapshot = await uploadBytes(storageRef, blob);
    
    // Get download URL (the extension will create resized version)
    const downloadUrl = await getDownloadURL(snapshot.ref);

    // Update member document in Firestore
    const db = getFirestore();
    const memberRef = doc(db, 'groups', groupId, 'members', memberId);
    await updateDoc(memberRef, {
      profileImageUrl: downloadUrl,
      hasCustomImage: true,
      profilePictureUpdatedAt: new Date()
    });

    return { 
      success: true, 
      profilePictureUrl: downloadUrl 
    };

  } catch (error: any) {
    console.error('Error uploading member profile picture:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to upload profile picture' 
    };
  }
};

/**
 * Get the profile picture URL for a user (checks for resized version first)
 */
export const getUserProfilePictureUrl = async (userId: string): Promise<string | null> => {
  try {
    // Try to get the resized version first (200x200)
    const resizedRef = ref(storage, `users/${userId}/profile_200x200.jpg`);
    try {
      const resizedUrl = await getDownloadURL(resizedRef);
      return resizedUrl;
    } catch {
      // If resized version doesn't exist, get original
      const originalRef = ref(storage, `users/${userId}/profile.jpg`);
      const originalUrl = await getDownloadURL(originalRef);
      return originalUrl;
    }
  } catch (error) {
    console.error('Error getting user profile picture URL:', error);
    return null;
  }
};

/**
 * Get the profile picture URL for a group member (checks for resized version first)
 */
export const getMemberProfilePictureUrl = async (
  groupId: string, 
  memberId: string
): Promise<string | null> => {
  try {
    // Try to get the resized version first (200x200)
    const resizedRef = ref(storage, `groups/${groupId}/members/${memberId}/profile_200x200.jpg`);
    try {
      const resizedUrl = await getDownloadURL(resizedRef);
      return resizedUrl;
    } catch {
      // If resized version doesn't exist, get original
      const originalRef = ref(storage, `groups/${groupId}/members/${memberId}/profile.jpg`);
      const originalUrl = await getDownloadURL(originalRef);
      return originalUrl;
    }
  } catch (error) {
    console.error('Error getting member profile picture URL:', error);
    return null;
  }
};

/**
 * Reset user profile picture to default
 */
export const resetUserProfilePicture = async (userId?: string): Promise<ProfilePictureUploadResult> => {
  try {
    const auth = getAuth();
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      return { success: false, error: 'User not authenticated' };
    }

    const targetUserId = userId || currentUser.uid;
    
    // For security, only allow users to reset their own profile picture
    if (targetUserId !== currentUser.uid) {
      return { success: false, error: 'You can only reset your own profile picture' };
    }

    // Get default profile picture URL (you could fetch this from Firestore or use a fixed URL)
    const defaultProfilePictureUrl = 'https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fadult_profile_icon.png?alt=media';

    // Update user document in Firestore
    const db = getFirestore();
    const userRef = doc(db, 'users', targetUserId);
    await updateDoc(userRef, {
      profilePicture: defaultProfilePictureUrl,
      hasCustomImage: false,
      profilePictureUpdatedAt: new Date()
    });

    return { 
      success: true, 
      profilePictureUrl: defaultProfilePictureUrl 
    };

  } catch (error: any) {
    console.error('Error resetting profile picture:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to reset profile picture' 
    };
  }
};
