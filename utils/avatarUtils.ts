import { ImageSourcePropType } from 'react-native';

interface Member {
  id: string;
  role: string;
  name: string;
  isConfirmed?: boolean;
  profileImageUrl?: string;
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
  if (member.profileImageUrl && member.hasCustomImage) {
    return { uri: member.profileImageUrl };
  }
  
  // Default avatars based on age group and role
  if (group.ageGroup === 1 && member.role === 'member') {
    // Children in ageGroup 1 get child avatar
    return require('@/assets/images/avatars/child-default.png');
  } else {
    // Everyone else gets adult avatar (coaches/admins in ageGroup 1, all members in ageGroup 2)
    return require('@/assets/images/avatars/adult-default.png');
  }
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
