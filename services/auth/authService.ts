import { auth, db, functions } from "@/services/core/firebase";
import {
    createUserWithEmailAndPassword,
    EmailAuthProvider,
    updatePassword as firebaseUpdatePassword,
    onAuthStateChanged,
    reauthenticateWithCredential,
    signInWithEmailAndPassword,
    signOut,
    User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

// ✅ Import UserProfile interface
import { UserProfile } from "@/services/types/user";

// ---------------------- SIGN IN ----------------------
export const signInUser = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password,
    );
    const user = userCredential.user;

    // Fetch user profile from Firestore
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      await signOut(auth);
      return {
        success: false,
        error: {
          code: "auth/user-not-found",
          message:
            "User profile not found in database. Please contact support.",
        },
      };
    }

    const userData = userDoc.data() as UserProfile;

    // Check if email is verified (custom verification system in Firestore)
    // Invited users are pre-verified (emailVerified: true), regular users must verify first
    if (userData.emailVerified === false) {
      await signOut(auth);
      return {
        success: false,
        error: {
          code: "auth/email-not-verified",
          message:
            "Please verify your email before signing in. Check your inbox for the verification link.",
        },
      };
    }

    return { success: true, user, profile: userData };
  } catch (error: any) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    };
  }
};

// ---------------------- SIGN UP ----------------------
export interface LegalAcceptanceData {
  termsVersion: string;
  privacyVersion: string;
  acceptanceMethod: "signup" | "login_re-acceptance" | "app_prompt";
  clientInfo: {
    platform: "ios" | "android" | "web";
    appVersion: string;
  };
}

export const signUpUser = async (
  email: string,
  password: string,
  fullName: string,
  invitationToken?: string,
  legalAcceptance?: LegalAcceptanceData,
) => {
  try {
    // Create Firebase Auth user first
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );
    const user = userCredential.user;

    // Check if user is signing up through an invitation
    const isInvitedUser = !!invitationToken;

    console.log(
      `Creating user account for ${email}, invited user: ${isInvitedUser}`,
    );

    // Call the backend function to create user profile and handle email verification
    try {
      console.log("📝 Calling createUserAccount function");
      const createUserAccountFunction = httpsCallable(
        functions,
        "createUserAccount",
      );
      const result = await createUserAccountFunction({
        email: email.trim(),
        fullName: fullName.trim(),
        uid: user.uid,
        invitationToken: invitationToken || undefined,
        legalAcceptance: legalAcceptance || undefined,
      });

      const responseData = result.data as {
        success: boolean;
        message: string;
        error?: string;
      };

      if (!responseData.success) {
        throw new Error(responseData.error || "Failed to create user profile");
      }

      console.log("✅ User account created successfully via function");

      if (isInvitedUser) {
        // For invited users, keep them signed in
        console.log("✅ Invited user account created and processed");

        return {
          success: true,
          user,
          requiresEmailVerification: false,
          message:
            responseData.message ||
            "🎉 Account created successfully!\n\nYour account has been activated and you can start using Clubnizer right away!",
        };
      } else {
        // For regular users, sign out until email is verified
        console.log("📧 Regular user account created, email verification sent");

        await signOut(auth);

        return {
          success: true,
          user,
          requiresEmailVerification: true,
          message:
            responseData.message ||
            "Account created successfully!\n\nPlease check your email inbox and click the verification link to activate your account. You must verify your email before you can sign in.",
        };
      }
    } catch (functionError: any) {
      console.error("❌ Function error:", functionError);
      console.error("Function error code:", functionError.code);
      console.error("Function error message:", functionError.message);

      // Delete the Firebase Auth user if function call failed
      try {
        await user.delete();
        console.log("🗑️ Cleaned up Firebase Auth user due to function error");
      } catch (deleteError) {
        console.error("Failed to cleanup Firebase Auth user:", deleteError);
      }

      throw new Error(
        `Failed to create user profile: ${functionError.message || functionError.code || "Unknown error"}`,
      );
    }
  } catch (error: any) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    };
  }
};

// ---------------------- RESEND VERIFICATION ----------------------
export const resendVerificationEmail = async (email: string) => {
  try {
    const resendFunction = httpsCallable(functions, "resendVerificationEmail");
    const result = await resendFunction({ email: email.trim() });

    return {
      success: true,
      message:
        (result.data as any)?.message ||
        "Verification email sent! Please check your inbox.",
    };
  } catch (error: any) {
    console.error("Error resending verification email:", error);

    let errorMessage = "Failed to resend verification email. Please try again.";

    if (error.code === "functions/not-found") {
      errorMessage = "No account found with this email address.";
    } else if (error.code === "functions/already-exists") {
      errorMessage = "This email address is already verified.";
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: {
        code: error.code || "unknown",
        message: errorMessage,
      },
    };
  }
};

// ---------------------- REQUEST PASSWORD RESET ----------------------
export const requestPasswordReset = async (email: string) => {
  try {
    const resetFunction = httpsCallable(functions, "requestPasswordReset");
    const result = await resetFunction({ email: email.trim() });

    return {
      success: true,
      message:
        (result.data as any)?.message ||
        "If an account exists with this email, a password reset link has been sent.",
    };
  } catch (error: any) {
    console.error("Error requesting password reset:", error);

    return {
      success: false,
      error: {
        code: error.code || "unknown",
        message: "Failed to send password reset email. Please try again.",
      },
    };
  }
};

// ---------------------- SIGN OUT ----------------------
export const signOutUser = async () => {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    };
  }
};

// ---------------------- AUTH LISTENER ----------------------
export const setupAuthListener = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

// ---------------------- CURRENT USER ----------------------
export const getCurrentUser = () => {
  return auth.currentUser;
};

// ---------------------- UPDATE USER PROFILE ----------------------
/**
 * Update user profile using atomic Firebase Function
 * This ensures proper version management and cache invalidation
 */
export const updateUserProfile = async (profileData: {
  displayName?: string;
  photoURL?: string;
  phoneNumber?: string | null;
  dateOfBirth?: Date | null;
}) => {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return {
        success: false,
        error: {
          code: "auth/user-not-authenticated",
          message: "No authenticated user found",
        },
      };
    }

    // Call the Firebase Function
    const updateUserProfileFunction = httpsCallable(
      functions,
      "updateUserProfile",
    );
    const result = await updateUserProfileFunction({
      userId: currentUser.uid,
      profileData,
    });

    const responseData = result.data as {
      success: boolean;
      message: string;
      userId: string;
      version: number;
      updatedFields: string[];
    };

    return {
      success: true,
      data: responseData,
      message: "Profile updated successfully",
    };
  } catch (error: any) {
    console.error("Error updating user profile:", error);

    return {
      success: false,
      error: {
        code: error.code || "unknown",
        message: error.message || "Failed to update profile",
      },
    };
  }
};

// ---------------------- CHANGE PASSWORD ----------------------
/**
 * Change the current user's password.
 *
 * 1. Re-authenticate with current credentials.
 * 2. Update password via Firebase Auth client SDK.
 * 3. Revoke all refresh tokens via backend CF (invalidates other sessions).
 * 4. Sign out — user must log in again with new password.
 */
export const changePassword = async (
  currentPassword: string,
  newPassword: string,
): Promise<{
  success: boolean;
  error?: { code: string; message: string };
}> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) {
      return {
        success: false,
        error: {
          code: "auth/user-not-authenticated",
          message: "No authenticated user found",
        },
      };
    }

    // Re-authenticate
    const credential = EmailAuthProvider.credential(
      currentUser.email,
      currentPassword,
    );
    await reauthenticateWithCredential(currentUser, credential);

    // Update password
    await firebaseUpdatePassword(currentUser, newPassword);

    // Revoke all refresh tokens server-side
    try {
      const revokeTokens = httpsCallable(functions, "revokeUserTokens");
      await revokeTokens({});
    } catch (revokeError) {
      // Non-fatal — password is already changed
      console.warn("Token revocation failed (non-fatal):", revokeError);
    }

    // NOTE: Do NOT sign out here — the caller must show a success
    // alert first and sign out from the onConfirm callback.
    // Calling signOut here fires onAuthStateChanged(null) which
    // triggers AuthGuard → Redirect before the UI can react.

    return { success: true };
  } catch (error: any) {
    console.error("Error changing password:", error);

    let message = "Failed to change password. Please try again.";
    if (
      error.code === "auth/wrong-password" ||
      error.code === "auth/invalid-credential"
    ) {
      message = "Current password is incorrect.";
    } else if (error.code === "auth/weak-password") {
      message = "New password is too weak. Use at least 6 characters.";
    } else if (error.code === "auth/requires-recent-login") {
      message =
        "Session expired. Please sign out, sign back in, and try again.";
    }

    return {
      success: false,
      error: {
        code: error.code || "unknown",
        message,
      },
    };
  }
};

// ---------------------- REQUEST EMAIL CHANGE ----------------------
/**
 * Request an email address change.
 *
 * Calls the `requestEmailChange` CF which sends a verification email
 * to the new address. The user is signed out immediately — they must
 * click the verification link, then log in with the new email.
 */
export const requestEmailChange = async (
  newEmail: string,
): Promise<{
  success: boolean;
  message?: string;
  error?: { code: string; message: string };
}> => {
  try {
    const requestChange = httpsCallable(functions, "requestEmailChange");
    const result = await requestChange({ newEmail: newEmail.trim() });
    const data = result.data as { success: boolean; message: string };

    // NOTE: Do NOT sign out here — the caller must show a success
    // alert first and sign out from the onConfirm callback.

    return { success: true, message: data.message };
  } catch (error: any) {
    console.error("Error requesting email change:", error);

    let message = "Failed to request email change. Please try again.";
    if (error.code === "functions/already-exists") {
      message = "This email address is already in use by another account.";
    } else if (error.code === "functions/invalid-argument") {
      message = error.message || "Invalid email address.";
    }

    return {
      success: false,
      error: {
        code: error.code || "unknown",
        message,
      },
    };
  }
};
