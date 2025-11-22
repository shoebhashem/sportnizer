import { functions } from '../core/firebase';
import { httpsCallable } from 'firebase/functions';

// Import centralized type definitions
import type { 
  CreateSubGroupRequest, 
  CreateSubGroupResponse
} from '../../functions/src/types/interfaces';

/**
 * Service to create a new sub-group within a group using Firebase Function
 */
export const createSubGroupService = async (
  uid: string,
  clubId: string,
  groupId: string,
  subGroupName: string
): Promise<CreateSubGroupResponse> => {
  try {
    console.log(`Creating sub-group "${subGroupName}" in group ${groupId} of club ${clubId}`);

    const createSubGroup = httpsCallable<CreateSubGroupRequest, CreateSubGroupResponse>(
      functions,
      'createSubGroup'
    );

    const result = await createSubGroup({
      uid,
      clubId,
      groupId,
      subGroupName: subGroupName.trim()
    });

    if (!result.data.success) {
      throw new Error(result.data.error || 'Failed to create sub-group');
    }

    console.log('Sub-group created successfully:', result.data.message);
    return result.data;

  } catch (error: any) {
    console.error('Error in createSubGroupService:', error);
    
    // Re-throw with more context for the UI to handle
    throw {
      code: error.code || 'unknown',
      message: error.message || 'Failed to create sub-group'
    };
  }
};
