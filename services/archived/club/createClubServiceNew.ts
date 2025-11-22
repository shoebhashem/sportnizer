import { httpsCallable } from 'firebase/functions';
import { getCurrentUser } from '../auth/authService';
import { functions } from '../core/firebase';

export interface CreateClubServiceResponse {
  success: boolean;
  clubId?: string;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Creates a new club using Firebase Functions
 */
export const createClub = async (clubName: string): Promise<CreateClubServiceResponse> => {
  try {
    const user = getCurrentUser();
    if (!user) {
      return {
        success: false,
        error: { code: "auth/no-user", message: "You must be signed in to create a club." },
      };
    }

    const createNewClub = httpsCallable(functions, 'createNewClub');
    
    const result = await createNewClub({
      clubName: clubName.trim(),
      uid: user.uid
    });

    const response = result.data as any;

    if (response.success) {
      return {
        success: true,
        clubId: response.clubId,
        message: response.message
      };
    } else {
      return {
        success: false,
        error: {
          code: 'club/creation-failed',
          message: response.error || 'Failed to create club'
        }
      };
    }

  } catch (error: any) {
    console.error('Error calling createNewClub function:', error);
    
    // Handle Firebase Functions errors
    if (error.code) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message || 'Failed to create club. Please try again.'
        }
      };
    }

    return {
      success: false,
      error: {
        code: 'unknown',
        message: 'Failed to create club. Please try again.'
      }
    };
  }
};
