import '@/firebaseConfig'; // Ensure Firebase is initialized
import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, sendEmailVerification, signInWithEmailAndPassword, signOut, User } from "firebase/auth";

const auth = getAuth();

// Sign in with email and password
export const signInUser = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: userCredential.user };
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

// Sign up with email and password (with optional email verification)
export const signUpUser = async (email: string, password: string, sendVerification: boolean = false) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Optionally send email verification
    if (sendVerification) {
      await sendEmailVerification(userCredential.user);
    }
    
    return { 
      success: true, 
      user: userCredential.user,
      emailSent: sendVerification 
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

// Send email verification to current user
export const sendVerificationEmail = async () => {
  try {
    const user = getCurrentUser();
    if (!user) {
      return { success: false, error: { code: 'auth/no-user', message: 'No user is signed in' } };
    }
    
    await sendEmailVerification(user);
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

// Check if current user's email is verified
export const isEmailVerified = () => {
  const user = getCurrentUser();
  return user?.emailVerified || false;
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
