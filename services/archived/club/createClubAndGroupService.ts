import { createGroup } from '../group/createGroupServiceNew';
import { createClub } from './createClubServiceNew';

export interface CreateClubAndGroupResponse {
  success: boolean;
  clubId?: string;
  groupId?: string;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Creates a new club and then creates a group within that club
 * This orchestrates the two Firebase Functions for the "new club + group" scenario
 */
export const createClubAndGroup = async (
  clubName: string,
  groupName: string,
  sportType: string
): Promise<CreateClubAndGroupResponse> => {
  try {
    // Step 1: Create the club
    const clubResult = await createClub(clubName);
    
    if (!clubResult.success || !clubResult.clubId) {
      return {
        success: false,
        error: clubResult.error || {
          code: 'club/creation-failed',
          message: 'Failed to create club'
        }
      };
    }

    // Step 2: Create the group in the new club
    const groupResult = await createGroup(clubResult.clubId, groupName, sportType);
    
    if (!groupResult.success) {
      // If group creation fails, we don't rollback the club (by design)
      // The user can manually create the group later or try again
      return {
        success: false,
        clubId: clubResult.clubId, // Return clubId so UI can handle partial success
        error: groupResult.error || {
          code: 'group/creation-failed',
          message: 'Club created successfully, but failed to create group. You can try creating the group again.'
        }
      };
    }

    return {
      success: true,
      clubId: clubResult.clubId,
      groupId: groupResult.groupId,
      message: `Club "${clubName}" and group "${groupName}" created successfully!`
    };

  } catch (error: any) {
    console.error('Error in createClubAndGroup:', error);
    return {
      success: false,
      error: {
        code: 'unknown',
        message: 'An unexpected error occurred while creating club and group.'
      }
    };
  }
};
