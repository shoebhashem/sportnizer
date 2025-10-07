import { getDefaultProfilePicture } from '@/constants/profilePictures';
import { ImageSourcePropType } from 'react-native';

interface Member {
  id: string;
  role?: string; // Legacy field for backward compatibility
  roles?: string[]; // New field for multiple roles
  name: string;
  isConfirmed?: boolean;
  photoURL?: string; // Updated to match standardized name
  hasCustomImage?: boolean;
}

interface Group {
  id: string;
  name: string;
  createdBy: string;
  ageGroup?: number;
}

/**
 * Get the appropriate avatar source for a member
 * @param member - The member object
 * @param group - The group object
 * @returns ImageSourcePropType for the avatar
 */
export const getAvatarSource = (member: Member, group: Group): ImageSourcePropType => {
  // If member has a custom image, use it
  if (member.photoURL && member.hasCustomImage) {
    return { uri: member.photoURL };
  }
  
  // Get member role - handle both old and new schema
  let memberRole = 'member';
  if (member.roles && Array.isArray(member.roles) && member.roles.length > 0) {
    // New schema: use first role as primary
    memberRole = member.roles[0];
  } else if (member.role) {
    // Old schema: use role field
    memberRole = member.role;
  }
  
  // Default avatars based on age group and role using Firebase Storage URLs
  const needsChildAvatar = group.ageGroup === 1 && memberRole === 'member';
  return { uri: getDefaultProfilePicture(needsChildAvatar) };
};

/**
 * Get storage path for member's profile image
 * @param groupId - The group ID
 * @param memberId - The member ID
 * @returns Storage path string
 */
export const getMemberImageStoragePath = (groupId: string, memberId: string): string => {
  return `groups/${groupId}/members/${memberId}/profile.jpg`;
};

/**
 * Get full storage URL for member's profile image
 * @param groupId - The group ID
 * @param memberId - The member ID
 * @returns Full storage URL string
 */
export const getMemberImageStorageUrl = (groupId: string, memberId: string): string => {
  return `gs://sportnizer.firebasestorage.app/${getMemberImageStoragePath(groupId, memberId)}`;
};
