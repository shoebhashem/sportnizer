import {
    Auth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
} from 'firebase/auth';
import { Functions, httpsCallable } from 'firebase/functions';

// Import centralized type definitions
import type {
    CreateUserAccountRequest,
    CreateUserAccountResponse,
    GetUserProfileRequest,
    GetUserProfileResponse,
    ResendVerificationEmailRequest,
    ResendVerificationEmailResponse
} from '../../functions/src/types/interfaces';

class AuthServiceNew {
  private auth: Auth;
  private functions: Functions;

  constructor(auth: Auth, functions: Functions) {
    this.auth = auth;
    this.functions = functions;
  }

  /**
   * Sign up a new user - Uses Firebase Auth + Firebase Function
   * 1. Creates auth account with Firebase Auth
   * 2. Creates user profile document via Firebase Function
   */
  async signUpUser(email: string, password: string, fullName: string) {
    try {
      console.log('Starting user sign up process...');

      // Step 1: Create Firebase Auth account
      const userCredential = await createUserWithEmailAndPassword(
        this.auth,
        email,
        password
      );

      const user = userCredential.user;
      console.log('Firebase Auth account created:', user.uid);

      // Step 2: Create user profile document via Firebase Function
      const createUserAccount = httpsCallable<CreateUserAccountRequest, CreateUserAccountResponse>(
        this.functions,
        'createUserAccount'
      );

      const result = await createUserAccount({
        email: email,
        fullName: fullName,
        uid: user.uid
      });

      if (!result.data.success) {
        // If Firestore creation fails, we should clean up the auth account
        // Note: In a production app, you might want to handle this differently
        console.error('Failed to create user profile:', result.data.error);
        throw new Error(result.data.error || 'Failed to create user profile');
      }

      console.log('User profile created successfully');

      return {
        success: true,
        user: user,
        message: result.data.message || 'Account created successfully'
      };

    } catch (error: any) {
      console.error('Error in signUpUser:', error);
      throw {
        success: false,
        error: error.message || 'Failed to create account'
      };
    }
  }

  /**
   * Sign in user - Uses Firebase Auth + Firebase Function for profile
   * 1. Authenticates with Firebase Auth
   * 2. Fetches user profile via Firebase Function
   */
  async signInUser(email: string, password: string) {
    try {
      console.log('Starting user sign in process...');

      // Step 1: Sign in with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(
        this.auth,
        email,
        password
      );

      const user = userCredential.user;
      console.log('Firebase Auth sign in successful:', user.uid);

      // Step 2: Get user profile via Firebase Function
      const getUserProfile = httpsCallable<GetUserProfileRequest, GetUserProfileResponse>(
        this.functions,
        'getUserProfile'
      );

      const result = await getUserProfile({
        uid: user.uid
      });

      if (!result.data.success) {
        console.error('Failed to get user profile:', result.data.error);
        throw new Error(result.data.error || 'Failed to get user profile');
      }

      const userProfile = result.data.userProfile;

      // Check if email is verified
      if (!userProfile.emailVerified) {
        console.log('Email not verified for user:', user.uid);
        
        // Sign out the user since email is not verified
        await signOut(this.auth);
        
        // Throw specific error for unverified email
        const error = new Error('Please verify your email address before signing in');
        (error as any).code = 'auth/email-not-verified';
        throw error;
      }

      console.log('User profile retrieved successfully and email verified');

      return {
        success: true,
        user: user,
        userProfile: userProfile,
        message: 'Sign in successful'
      };

    } catch (error: any) {
      console.error('Error in signInUser:', error);
      throw {
        success: false,
        error: error.message || 'Failed to sign in'
      };
    }
  }

  /**
   * Sign out user - Pure Firebase Auth operation
   */
  async signOutUser() {
    try {
      await signOut(this.auth);
      console.log('User signed out successfully');
      
      return {
        success: true,
        message: 'Signed out successfully'
      };

    } catch (error: any) {
      console.error('Error in signOutUser:', error);
      throw {
        success: false,
        error: error.message || 'Failed to sign out'
      };
    }
  }

  /**
   * Resend verification email - Uses Firebase Function
   */
  async resendVerificationEmail(email: string) {
    try {
      console.log('Resending verification email...');

      const resendVerificationEmail = httpsCallable<ResendVerificationEmailRequest, ResendVerificationEmailResponse>(
        this.functions,
        'resendVerificationEmail'
      );

      const result = await resendVerificationEmail({
        email: email
      });

      if (!result.data.success) {
        console.error('Failed to resend verification email:', result.data.error);
        throw new Error(result.data.error || 'Failed to resend verification email');
      }

      console.log('Verification email sent successfully');

      return {
        success: true,
        message: result.data.message || 'Verification email sent'
      };

    } catch (error: any) {
      console.error('Error in resendVerificationEmail:', error);
      throw {
        success: false,
        error: error.message || 'Failed to resend verification email'
      };
    }
  }

  /**
   * Get current user from Firebase Auth
   */
  getCurrentUser() {
    return this.auth.currentUser;
  }

  /**
   * Check if user is signed in
   */
  isUserSignedIn(): boolean {
    return !!this.auth.currentUser;
  }
}

export default AuthServiceNew;
