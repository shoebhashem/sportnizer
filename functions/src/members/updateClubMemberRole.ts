/**
 * Update Club Member Role Function
 * 
 * Adds or removes roles at the CLUB level (not group-specific).
 * Used for promoting members to club-admin or managing club-level roles.
 * 
 * Updates 2 locations:
 * 1. Club member list roles[] array (role accumulation)
 * 2. User document clubAccess[].role (permission level)
 */

import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

interface UpdateClubMemberRoleRequest {
  clubId: string;
  userId: string;
  operation: 'add' | 'remove';
  roleToAdd?: string;  // Required when operation='add'
  roleToRemove?: string;  // Required when operation='remove'
}

// Valid club-level roles
const VALID_CLUB_ROLES = ['club-admin', 'admin', 'coach', 'player', 'player-underage', 'guardian'];

export const updateClubMemberRole = onCall(
  {
    region: config.region,
  },
  async (request) => {
    try {
      const { clubId, userId, operation, roleToAdd, roleToRemove }: UpdateClubMemberRoleRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['clubId', 'userId', 'operation']);

      // Validate operation-specific fields
      if (operation === 'add' && !roleToAdd) {
        throw new HttpsError('invalid-argument', 'roleToAdd is required when operation is "add"');
      }
      if (operation === 'remove' && !roleToRemove) {
        throw new HttpsError('invalid-argument', 'roleToRemove is required when operation is "remove"');
      }

      const targetRole = operation === 'add' ? roleToAdd : roleToRemove;

      // Validate role
      if (!VALID_CLUB_ROLES.includes(targetRole!)) {
        throw new HttpsError(
          'invalid-argument',
          `Invalid role '${targetRole}'. Valid roles are: ${VALID_CLUB_ROLES.join(', ')}`
        );
      }

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      console.log(`🔄 ${operation === 'add' ? 'Adding' : 'Removing'} club-level role '${targetRole}' ${operation === 'add' ? 'to' : 'from'} user ${userId} in club ${clubId}`);

      const db = admin.firestore();

      // STEP 1: Update club member document (role accumulation)
      const clubMembersRef = db.collection('clubs').doc(clubId).collection('allMembers').doc('members');
      const clubMembersDoc = await clubMembersRef.get();

      if (!clubMembersDoc.exists) {
        throw new HttpsError('not-found', 'Club members document not found');
      }

      const clubMembersData = clubMembersDoc.data();
      const clubMembers = clubMembersData?.members || [];
      const clubMemberIndex = clubMembers.findIndex((m: any) => m.userId === userId);

      if (clubMemberIndex === -1) {
        throw new HttpsError('not-found', 'User is not a member of this club');
      }

      const clubMemberRoles = clubMembers[clubMemberIndex].roles || [];
      
      if (operation === 'add') {
        // Add role to club member list (allow duplicates for accumulation)
        clubMembers[clubMemberIndex].roles = [...clubMemberRoles, roleToAdd!];
        clubMembers[clubMemberIndex].lastModifiedAt = new Date();

        await clubMembersRef.update({
          members: clubMembers,
          version: admin.firestore.FieldValue.increment(1),
          lastModified: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ Added '${roleToAdd}' to club member roles`);
      } else {
        // Remove ONE instance of the role
        const roleIndex = clubMemberRoles.indexOf(roleToRemove!);
        if (roleIndex === -1) {
          console.log(`ℹ️ User ${userId} does not have role '${roleToRemove}' in club`);
          return {
            success: true,
            message: `User does not have the ${roleToRemove} role`,
            roleNotFound: true
          };
        }

        const updatedRoles = [...clubMemberRoles];
        updatedRoles.splice(roleIndex, 1);
        clubMembers[clubMemberIndex].roles = updatedRoles;
        clubMembers[clubMemberIndex].lastModifiedAt = new Date();

        // Check if roles array is now empty → mark inactive
        if (updatedRoles.length === 0) {
          clubMembers[clubMemberIndex].isActive = false;
          clubMembers[clubMemberIndex].inactiveSince = new Date();
          clubMembers[clubMemberIndex].scheduledForDeletion = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
          console.log(`⚠️ Member ${userId} has no roles left - marked as inactive in club`);
        }

        await clubMembersRef.update({
          members: clubMembers,
          version: admin.firestore.FieldValue.increment(1),
          lastModified: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ Removed '${roleToRemove}' from club member roles`);
      }

      console.log(`✨ Successfully ${operation === 'add' ? 'added' : 'removed'} club-level role '${targetRole}' ${operation === 'add' ? 'to' : 'from'} user ${userId}`);

      const updatedRoles = operation === 'add' 
        ? [...clubMemberRoles, targetRole!]
        : clubMemberRoles.filter((r: string, index: number) => index !== clubMemberRoles.indexOf(targetRole));

      return {
        success: true,
        message: `Successfully ${operation === 'add' ? 'added' : 'removed'} ${targetRole} role at club level`,
        updatedRoles
      };

    } catch (error: any) {
      console.error('❌ Error updating club member role:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError(
        'internal',
        `Failed to update club member role: ${error.message}`
      );
    }
  }
);
