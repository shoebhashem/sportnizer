import '@/firebaseConfig'; // Ensure Firebase is initialized
import { functions } from '@/services/firebase';
import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from "firebase/auth";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from 'firebase/functions';

const auth = getAuth();
const db = getFirestore();

// Sign in with email and password
export const signInUser = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Check email verification status from Firestore
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);
    const userData = userDoc.data();
    
    if (!userData?.emailVerified) {
      // Sign out the user since they're not verified
      await signOut(auth);
      return { 
        success: false, 
        error: {
          code: 'auth/email-not-verified',
          message: 'Please verify your email address before signing in.\n\nCheck your email inbox and click the verification link to activate your account. If you don\'t see the email, check your spam folder.'
        }
      };
    }
    
    return { success: true, user };
  } catch (error: any) {
    return { 
      success: false, 
      error: {
        code: error.code,
        message: error.message
      }
    };
  }
};

// Sign up with email and password
export const signUpUser = async (email: string, password: string, fullName: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Get default profile picture (assume adult for initial signup)
    const defaultProfilePicture = 'https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fadult_profile_icon.png?alt=media';

    // Create complete user document in Firestore with template fields
    await setDoc(doc(db, 'users', user.uid), {
      name: fullName,
      email: email.toLowerCase(),
      clubs: [], // Initialize as empty array - will contain {clubId, isAdmin, joinedAt, role} objects
      gender: 'prefer-not-to-say', // Default value, user can update later
      birthdate: null, // Null until user sets it
      age: null, // Will be calculated when birthdate is set
      createdAt: serverTimestamp(),
      groupsCreated: 0,
      groupsJoined: [], // Initialize as empty GroupMembership array
      eventsInvited: [], // Initialize as empty EventInvitation array
      profilePicture: defaultProfilePicture, // Set default profile picture
      emailVerified: false, // Track verification status
    });
    
    // Call custom email verification function
    const sendEmailVerificationFunction = httpsCallable(functions, 'sendEmailVerification');
    await sendEmailVerificationFunction({ 
      email: email.trim(),
      uid: user.uid,
      fullName: fullName.trim()
    });
    
    // Sign out the user immediately - they need to verify email first
    await signOut(auth);
    
    return { 
      success: true, 
      user,
      message: 'Account created successfully!\n\nPlease check your email inbox and click the verification link to activate your account. You must verify your email before you can sign in.'
    };
  } catch (error: any) {
    return { 
      success: false, 
      error: {
        code: error.code,
        message: error.message
      }
    };
  }
};

// Resend verification email
export const resendVerificationEmail = async (email: string) => {
  try {
    // Call the dedicated Firebase Function for resending verification email
    const resendFunction = httpsCallable(functions, 'resendVerificationEmail');
    const result = await resendFunction({ email: email.trim() });

    return { 
      success: true, 
      message: (result.data as any)?.message || 'Verification email sent! Please check your inbox.'
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
        message: errorMessage
      }
    };
  }
};

// Sign out
export const signOutUser = async () => {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error: any) {
    return { 
      success: false, 
      error: {
        code: error.code,
        message: error.message
      }
    };
  }
};

// Auth state listener
export const setupAuthListener = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

// Get current user
export const getCurrentUser = () => {
  return auth.currentUser;
};
