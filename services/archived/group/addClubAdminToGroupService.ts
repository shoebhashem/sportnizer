import { httpsCallable } from 'firebase/functions';
import { getCurrentUser } from '../auth/authService';
import { functions } from '../core/firebase';

/**
 * Service function to add a club admin to a group as a player
 * Uses the new orchestrator function for modular operations
 */
export const addClubAdminToGroupService = async (
  clubId: string,
  groupId: string,
  roles: string[] = ['player']
) => {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return {
        success: false,
        error: { code: 'auth/no-user', message: 'You must be signed in to join a group.' }
      };
    }

    // Prepare the orchestrator request
    const orchestratorRequest = {
      operations: ['addToGroup', 'updateUserGroup'],
      clubId: clubId,
      groupId: groupId,
      uid: currentUser.uid,
      groupMemberData: {
        userId: currentUser.uid,
        roles: roles,
        joinedAt: new Date(),
        photoURL: currentUser.photoURL || '',
        name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Unknown',
        email: currentUser.email || '',
        needsGuardian: false,
        belongtoSubGroups: [],
        guardiansContacts: []
      },
      userGroupInfo: {
        groupId: groupId,
        groupName: '', // Will be filled by the function if needed
        clubId: clubId,
        roles: roles,
        joinedAt: new Date(),
        lastModifiedAt: new Date()
      }
    };

    // Call the orchestrator function
    const orchestrateMembershipOperation = httpsCallable(
      functions,
      'orchestrateMembershipOperation'
    );

    const result = await orchestrateMembershipOperation(orchestratorRequest);
    const response = result.data as any;

    if (response.success) {
      return {
        success: true,
        message: 'Successfully joined the group as a player!'
      };
    } else {
      return {
        success: false,
        error: { 
          code: 'operation/failed', 
          message: response.error || 'Failed to join group'
        }
      };
    }

  } catch (error: any) {
    console.error('Error in addClubAdminToGroupService:', error);
    return {
      success: false,
      error: {
        code: error.code || 'unknown',
        message: error.message || 'Failed to join group. Please try again.'
      }
    };
  }
};
