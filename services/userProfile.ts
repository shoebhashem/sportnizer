// /services/userProfile.ts - User profile service
// Wrapper for getUserProfile Firebase Function

import { httpsCallable } from 'firebase/functions';
import { functions } from './core/firebase';

/**
 * Fetch user profile by user ID
 * Calls the getUserProfile Firebase Function
 */
export const getUserProfile = async (uid: string): Promise<{
  success: boolean;
  userProfile?: any;
  error?: string;
}> => {
  try {
    const getUserProfileFn = httpsCallable(functions, 'getUserProfile');
    const result = await getUserProfileFn({ uid });
    return result.data as { success: boolean; userProfile?: any; error?: string };
  } catch (error: any) {
    console.error('❌ Error fetching user profile:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch user profile'
    };
  }
};
