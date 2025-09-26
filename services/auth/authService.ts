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
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

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

    // ✅ Use your custom emailVerified field instead of verificationStatus
    if (!userData.emailVerified) {
      await signOut(auth);
      return {
        success: false,
        error: {
          code: 'auth/email-not-verified',
          message:
            "Please verify your email address before signing in.\n\nCheck your email inbox and click the verification link to activate your account. If you don't see the email, check your spam folder.",
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
export const signUpUser = async (email: string, password: string, fullName: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const defaultProfilePicture =
      'https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fadult_profile_icon.png?alt=media';

    // Build typed UserProfile object
    const newUser: UserProfile = {
      uid: user.uid,
      email: email.toLowerCase(),
      fullName: fullName.trim(),
      photoURL: defaultProfilePicture,
      phoneNumber: undefined,
      dateOfBirth: undefined,
      address: undefined,
      clubs: [],
      groups: [],
      groupsCreated: 0,
      eventInvitations: [],
      emailVerified: false, // Keep using your custom field
      createdAt: new Date(),
      lastActive: new Date(),
    };

    // Save to Firestore with server timestamps
    await setDoc(doc(db, 'users', user.uid), {
      ...newUser,
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp(),
    });

    // Call your custom email verification function
    const sendEmailVerificationFunction = httpsCallable(functions, 'sendEmailVerification');
    await sendEmailVerificationFunction({
      email: email.trim(),
      uid: user.uid,
      fullName: fullName.trim(),
    });

    // Sign out until email is verified
    await signOut(auth);

    return {
      success: true,
      user,
      message:
        'Account created successfully!\n\nPlease check your email inbox and click the verification link to activate your account. You must verify your email before you can sign in.',
    };
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
