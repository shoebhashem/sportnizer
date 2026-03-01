/**
 * Configuration utilities
 */

export const config = {
  // Base URLs
  baseUrl: process.env.BASE_URL || "http://localhost:8081",

  // Firebase region
  region: "europe-north1" as const,

  // Email settings
  email: {
    from: "noreply@clubnizer.com",
    host: "smtp.strato.com",
    port: 587,
    secure: false,
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
  },

  // Default profile pictures
  profilePictures: {
    child:
      "https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fchild_profile_icon.png?alt=media",
    adult:
      "https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fadult_profile_icon.png?alt=media",
  },

  // Expiration times
  expiration: {
    emailVerification: 24 * 60 * 60 * 1000, // 24 hours
    guardianInvitation: 14 * 24 * 60 * 60 * 1000, // 14 days
  },

  // Cloud Function URLs
  cloudFunctionUrls: {
    verifyEmail:
      "https://europe-north1-sportnizer.cloudfunctions.net/verifyEmail",
  },
};

/**
 * Get default profile picture URL based on age
 */
export const getDefaultProfilePictureUrl = (userAge?: number): string => {
  const isChild = userAge !== undefined && userAge < 18;
  return isChild ? config.profilePictures.child : config.profilePictures.adult;
};
