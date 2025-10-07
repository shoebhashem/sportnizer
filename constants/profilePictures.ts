// Default profile picture URLs from Firebase Storage
export const DEFAULT_PROFILE_PICTURES = {
  adult: 'https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fadult_profile_icon.png?alt=media',
  child: 'https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fchild_profile_icon.png?alt=media',
};

/**
 * Get the appropriate default profile picture URL based on user type
 * @param needsGuardian - Whether the user is a child/youth member
 * @returns URL to the default profile picture
 */
export const getDefaultProfilePicture = (needsGuardian: boolean = false): string => {
  return needsGuardian ? DEFAULT_PROFILE_PICTURES.child : DEFAULT_PROFILE_PICTURES.adult;
};
