import { httpsCallable } from 'firebase/functions';
import { getCurrentUser } from '../auth/authService';
import { functions } from '../core/firebase';

export interface CreateGroupServiceResponse {
  success: boolean;
  groupId?: string;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Creates a new group using Firebase Functions
 */
export const createGroup = async (
  clubId: string,
  groupName: string,
  sportType: string
): Promise<CreateGroupServiceResponse> => {
  try {
    const user = getCurrentUser();
    if (!user) {
      return {
        success: false,
        error: { code: "auth/no-user", message: "You must be signed in to create a group." },
      };
    }

    const createNewGroup = httpsCallable(functions, 'createNewGroup');
    
    const result = await createNewGroup({
      clubId: clubId,
      groupName: groupName.trim(),
      sportType: sportType.trim(),
      uid: user.uid
    });

    const response = result.data as any;

    if (response.success) {
      return {
        success: true,
        groupId: response.groupId,
        message: response.message
      };
    } else {
      return {
        success: false,
        error: {
          code: 'group/creation-failed',
          message: response.error || 'Failed to create group'
        }
      };
    }

  } catch (error: any) {
    console.error('Error calling createNewGroup function:', error);
    
    // Handle Firebase Functions errors
    if (error.code) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message || 'Failed to create group. Please try again.'
        }
      };
    }

    return {
      success: false,
      error: {
        code: 'unknown',
        message: 'Failed to create group. Please try again.'
      }
    };
  }
};
