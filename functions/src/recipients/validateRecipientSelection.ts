import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export interface ValidateRecipientSelectionRequest {
  selection: {
    type: 'entire-club' | 'selected-groups' | 'selected-subgroups' | 'mixed';
    clubId?: string;
    groups?: {
      groupId: string;
      groupName: string;
      scope: 'entire' | 'subgroups';
      subgroupIds?: string[];
    }[];
  };
}

export interface ValidateRecipientSelectionResponse {
  success: boolean;
  isValid?: boolean;
  permissions?: {
    clubAccess: boolean;
    groupAccess: { [groupId: string]: boolean };
    subgroupAccess: { [subgroupId: string]: boolean };
  };
  error?: string;
}

export const validateRecipientSelection = onCall(
  {
    region: config.region,
  },
  async (request): Promise<ValidateRecipientSelectionResponse> => {
    try {
      const { selection }: ValidateRecipientSelectionRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['selection']);
      validateRequiredFields(selection, ['type']);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = request.auth.uid;
      console.log(`Validating recipient selection for user: ${userId}, type: ${selection.type}`);

      const db = admin.firestore();
      
      // Get user document to check permissions
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User document not found');
      }

      const userData = userDoc.data();
      const clubAccess = userData?.clubAccess || [];

      const permissions = {
        clubAccess: false,
        groupAccess: {} as { [groupId: string]: boolean },
        subgroupAccess: {} as { [subgroupId: string]: boolean }
      };

      // Validate club-level selection
      if (selection.type === 'entire-club') {
        if (!selection.clubId) {
          return {
            success: false,
            isValid: false,
            error: 'Club ID required for entire-club selection'
          };
        }

        console.log(`Validating club-level access for club: ${selection.clubId}`);

        // Check if user is club admin for this club
        const userClubAccess = clubAccess.find((club: any) => club.clubId === selection.clubId);
        const isClubAdmin = userClubAccess?.role === 'club-admin';

        permissions.clubAccess = isClubAdmin;

        if (!isClubAdmin) {
          return {
            success: true,
            isValid: false,
            permissions,
            error: 'Only club administrators can select entire club'
          };
        }
      }

      // Validate group-level selections
      if ((selection.type === 'selected-groups' || selection.type === 'mixed' || selection.type === 'selected-subgroups') && selection.groups) {
        console.log(`Validating access for ${selection.groups.length} group selections`);

        for (const group of selection.groups) {
          let hasGroupAccess = false;
          let groupClubId = '';

          // Find which club this group belongs to and check user's access
          for (const userClub of clubAccess) {
            // Check if user is club admin (has access to all groups in club)
            if (userClub.role === 'club-admin') {
              // Verify the group actually exists in this club
              const groupDoc = await db
                .collection('clubs')
                .doc(userClub.clubId)
                .collection('groups')
                .doc(group.groupId)
                .get();

              if (groupDoc.exists) {
                hasGroupAccess = true;
                groupClubId = userClub.clubId;
                break;
              }
            }

            // Check if user has specific group access
            if (userClub.groupAccess) {
              const userGroupAccess = userClub.groupAccess.find((ga: any) => ga.groupId === group.groupId);
              if (userGroupAccess) {
                const hasManagementRole = userGroupAccess.roles?.includes('coach') || 
                                         userGroupAccess.roles?.includes('admin');
                if (hasManagementRole) {
                  hasGroupAccess = true;
                  groupClubId = userClub.clubId;
                  break;
                }
              }
            }
          }

          permissions.groupAccess[group.groupId] = hasGroupAccess;

          if (!hasGroupAccess) {
            return {
              success: true,
              isValid: false,
              permissions,
              error: `No permission to select group: ${group.groupName}`
            };
          }

          // Validate subgroup access if specified
          if (group.scope === 'subgroups' && group.subgroupIds) {
            console.log(`Validating subgroup access for group ${group.groupId}: ${group.subgroupIds.join(', ')}`);

            // If user has group access, they have access to all subgroups in that group
            for (const subgroupId of group.subgroupIds) {
              // Verify subgroup exists in the group
              const subgroupDoc = await db
                .collection('clubs')
                .doc(groupClubId)
                .collection('groups')
                .doc(group.groupId)
                .collection('subgroups')
                .doc(subgroupId)
                .get();

              const subgroupExists = subgroupDoc.exists;
              permissions.subgroupAccess[subgroupId] = subgroupExists && hasGroupAccess;

              if (!subgroupExists) {
                return {
                  success: true,
                  isValid: false,
                  permissions,
                  error: `Subgroup not found: ${subgroupId} in group ${group.groupName}`
                };
              }
            }
          }
        }
      }

      console.log(`Successfully validated recipient selection for user: ${userId}`);

      return {
        success: true,
        isValid: true,
        permissions
      };

    } catch (error) {
      console.error('Error in validateRecipientSelection:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to validate recipient selection');
    }
  }
);
