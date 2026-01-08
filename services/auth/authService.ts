import '@/firebaseConfig'; // Ensure Firebase is initialized
import { functions } from '@/services/core/firebase';
import {
    createUserWithEmailAndPassword,
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    User,
} from 'firebase/auth';
import {
    doc,
    getDoc,
    getFirestore,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { addRegularMemberToGroupService } from '../orchestration/addRegularMemberToGroup';

// ✅ Import UserProfile interface
import { UserProfile } from '@/services/types/user';

const auth = getAuth();
const db = getFirestore();

// ---------------------- SIGN IN ----------------------
export const signInUser = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Fetch user profile from Firestore
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      await signOut(auth);
      return {
        success: false,
        error: {
          code: 'auth/user-not-found',
          message: 'User profile not found in database. Please contact support.',
        },
      };
    }

    const userData = userDoc.data() as UserProfile;

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
export const signUpUser = async (email: string, password: string, fullName: string, invitationToken?: string) => {
  try {
    // Create Firebase Auth user first
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Check if user is signing up through an invitation
    const isInvitedUser = !!invitationToken;
    
    console.log(`Creating user account for ${email}, invited user: ${isInvitedUser}`);

    // Call the backend function to create user profile and handle email verification
    try {
      console.log('📝 Calling createUserAccount function');
      const createUserAccountFunction = httpsCallable(functions, 'createUserAccount');
      const result = await createUserAccountFunction({
        email: email.trim(),
        fullName: fullName.trim(),
        uid: user.uid,
        invitationToken: invitationToken || undefined,
      });

      const responseData = result.data as {
        success: boolean;
        message: string;
        error?: string;
      };

      if (!responseData.success) {
        throw new Error(responseData.error || 'Failed to create user profile');
      }

      console.log('✅ User account created successfully via function');

      if (isInvitedUser && invitationToken) {
        // For invited users, process the invitation to add them to the group
        console.log('🎯 Processing invitation for new user...');
        
        try {
          const invitationResult = await addRegularMemberToGroupService.processInvitationAfterSignup(
            invitationToken, 
            user.uid
          );
          
          if (invitationResult.success) {
            console.log('✅ Invitation processed successfully');
            return {
              success: true,
              user,
              requiresEmailVerification: false,
              message: invitationResult.message || '🎉 Account created successfully!\n\nYour account has been activated and you can start using Sportnizer right away!',
            };
          } else {
            console.warn('⚠️ Account created but invitation processing failed:', invitationResult.error);
            // Don't fail the signup, but show a warning message
            return {
              success: true,
              user,
              requiresEmailVerification: false,
              message: '🎉 Account created successfully!\n\nThere was an issue processing your invitation, but you can still use the app. Please contact support if needed.',
            };
          }
        } catch (invitationError: any) {
          console.error('❌ Error processing invitation:', invitationError);
          // Don't fail the signup, but show a warning message
          return {
            success: true,
            user,
            requiresEmailVerification: false,
            message: '🎉 Account created successfully!\n\nThere was an issue processing your invitation, but you can still use the app. Please contact support if needed.',
          };
        }
      } else if (isInvitedUser) {
        // This case shouldn't happen (invited user without token), but handle gracefully
        console.warn('⚠️ Invited user signup without invitation token');
        return {
          success: true,
          user,
          requiresEmailVerification: false,
          message: '🎉 Account created successfully!\n\nYour account has been activated and you can start using Sportnizer right away!',
        };
      } else {
        // For regular users, sign out until email is verified
        console.log('📧 Regular user account created, email verification sent');
        
        await signOut(auth);

        return {
          success: true,
          user,
          requiresEmailVerification: true,
          message: responseData.message || 'Account created successfully!\n\nPlease check your email inbox and click the verification link to activate your account. You must verify your email before you can sign in.',
        };
      }
      
    } catch (functionError: any) {
      console.error('❌ Function error:', functionError);
      console.error('Function error code:', functionError.code);
      console.error('Function error message:', functionError.message);
      
      // Delete the Firebase Auth user if function call failed
      try {
        await user.delete();
        console.log('🗑️ Cleaned up Firebase Auth user due to function error');
      } catch (deleteError) {
        console.error('Failed to cleanup Firebase Auth user:', deleteError);
      }
      
      throw new Error(`Failed to create user profile: ${functionError.message || functionError.code || 'Unknown error'}`);
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
    const resendFunction = httpsCallable(functions, 'resendVerificationEmail');
    const result = await resendFunction({ email: email.trim() });

    return {
      success: true,
      message: (result.data as any)?.message || 'Verification email sent! Please check your inbox.',
    };
  } catch (error: any) {
    console.error('Error resending verification email:', error);

    let errorMessage = 'Failed to resend verification email. Please try again.';

    if (error.code === 'functions/not-found') {
      errorMessage = 'No account found with this email address.';
    } else if (error.code === 'functions/already-exists') {
      errorMessage = 'This email address is already verified.';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: {
        code: error.code || 'unknown',
        message: errorMessage,
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
          code: 'auth/user-not-authenticated',
          message: 'No authenticated user found',
        },
      };
    }

    // Call the Firebase Function
    const updateUserProfileFunction = httpsCallable(functions, 'updateUserProfile');
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
      message: 'Profile updated successfully',
    };

  } catch (error: any) {
    console.error('Error updating user profile:', error);
    
    return {
      success: false,
      error: {
        code: error.code || 'unknown',
        message: error.message || 'Failed to update profile',
      },
    };
  }
};
