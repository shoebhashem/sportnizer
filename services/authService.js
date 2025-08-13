import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from "firebase/auth";

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

// Sign up with email and password
export const signUpUser = async (email: string, password: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
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
