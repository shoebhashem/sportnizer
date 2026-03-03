/**
 * Update Member Role Function
 * 
 * Adds a new role to an existing member's roles array.
 * This is used when promoting members (e.g., member → coach).
 * Updates both group/club membership and user document.
 */

import * as admin from 'firebase-admin';
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

interface UpdateMemberRoleRequest {
  clubId: string;
  groupId: string;
  userId: string;
  operation: 'add' | 'remove';
  roleToAdd?: string;  // Required when operation='add'
  roleToRemove?: string;  // Required when operation='remove'
}

// Valid roles in the system
const VALID_ROLES = ['club-admin', 'admin', 'coach', 'player', 'player-underage', 'guardian'];

// Roles that can be managed via this function (all group roles)
const MANAGEABLE_ROLES = ['admin', 'coach', 'player', 'player-underage'];

export const updateMemberRole = onCall(
  {
    region: config.region,
  },
  async (request) => {
    try {
      const { clubId, groupId, userId, operation, roleToAdd, roleToRemove }: UpdateMemberRoleRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['clubId', 'groupId', 'userId', 'operation']);

      // Validate operation-specific fields
      if (operation === 'add' && !roleToAdd) {
        throw new HttpsError('invalid-argument', 'roleToAdd is required when operation is "add"');
      }
      if (operation === 'remove' && !roleToRemove) {
        throw new HttpsError('invalid-argument', 'roleToRemove is required when operation is "remove"');
      }

      const targetRole = operation === 'add' ? roleToAdd : roleToRemove;

      // Validate role
      if (!VALID_ROLES.includes(targetRole!)) {
        throw new HttpsError(
          'invalid-argument',
          `Invalid role '${targetRole}'. Valid roles are: ${VALID_ROLES.join(', ')}`
        );
      }

      // Only allow management of group roles through this function
      if (!MANAGEABLE_ROLES.includes(targetRole!)) {
        throw new HttpsError(
          'invalid-argument',
          `Role '${targetRole}' cannot be managed via this function. Only ${MANAGEABLE_ROLES.join(', ')} roles can be added/removed.`
        );
      }

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      console.log(`🔄 ${operation === 'add' ? 'Adding' : 'Removing'} role '${targetRole}' ${operation === 'add' ? 'to' : 'from'} user ${userId} in group ${groupId}`);

      const db = admin.firestore();

      // STEP 1: Update group member document
      const groupMembersRef = db
        .collection('clubs').doc(clubId)
        .collection('groups').doc(groupId)
        .collection('allMembers').doc('members');

      const groupMembersDoc = await groupMembersRef.get();
      
      if (!groupMembersDoc.exists) {
        throw new HttpsError('not-found', 'Group members document not found');
      }

      const membersData = groupMembersDoc.data();
      const members = membersData?.members || [];
      const memberIndex = members.findIndex((m: any) => m.userId === userId);

      if (memberIndex === -1) {
        throw new HttpsError('not-found', 'User is not a member of this group');
      }

      const member = members[memberIndex];
      const currentRoles = member.roles || [];

      if (operation === 'add') {
        // Check if role already exists
        if (currentRoles.includes(roleToAdd!)) {
          console.log(`ℹ️ User ${userId} already has role '${roleToAdd}'`);
          return {
            success: true,
            message: `User already has the ${roleToAdd} role`,
            alreadyHasRole: true
          };
        }

        // Add the new role
        members[memberIndex].roles = [...currentRoles, roleToAdd!];
        members[memberIndex].lastModifiedAt = new Date();

        console.log(`✅ Added '${roleToAdd}' to group member roles`);
      } else {
        // Remove operation
        const roleIndex = currentRoles.indexOf(roleToRemove!);
        if (roleIndex === -1) {
          console.log(`ℹ️ User ${userId} does not have role '${roleToRemove}'`);
          return {
            success: true,
            message: `User does not have the ${roleToRemove} role`,
            roleNotFound: true
          };
        }

        // Remove ONE instance of the role (to handle duplicates correctly)
        const updatedRoles = [...currentRoles];
        updatedRoles.splice(roleIndex, 1);
        members[memberIndex].roles = updatedRoles;
        members[memberIndex].lastModifiedAt = new Date();

        console.log(`✅ Removed '${roleToRemove}' from group member roles`);
      }

      // Update Firestore
      await groupMembersRef.update({
        members,
        version: FieldValue.increment(1),
        lastModified: FieldValue.serverTimestamp()
      });

      // STEP 2: Update club member document (if exists)
      try {
        const clubMembersRef = db.collection('clubs').doc(clubId).collection('allMembers').doc('members');
        const clubMembersDoc = await clubMembersRef.get();

        if (clubMembersDoc.exists) {
          const clubMembersData = clubMembersDoc.data();
          const clubMembers = clubMembersData?.members || [];
          const clubMemberIndex = clubMembers.findIndex((m: any) => m.userId === userId);

          if (clubMemberIndex >= 0) {
            const clubMemberRoles = clubMembers[clubMemberIndex].roles || [];
            
            if (operation === 'add') {
              if (!clubMemberRoles.includes(roleToAdd!)) {
                clubMembers[clubMemberIndex].roles = [...clubMemberRoles, roleToAdd!];
                clubMembers[clubMemberIndex].lastModifiedAt = new Date();

                await clubMembersRef.update({
                  members: clubMembers,
                  version: FieldValue.increment(1),
                  lastModified: FieldValue.serverTimestamp()
                });

                console.log(`✅ Added '${roleToAdd}' to club member roles`);
              }
            } else {
              // Remove operation - remove ONE instance
              const roleIndex = clubMemberRoles.indexOf(roleToRemove!);
              if (roleIndex > -1) {
                const updatedRoles = [...clubMemberRoles];
                updatedRoles.splice(roleIndex, 1);
                clubMembers[clubMemberIndex].roles = updatedRoles;
                clubMembers[clubMemberIndex].lastModifiedAt = new Date();

                await clubMembersRef.update({
                  members: clubMembers,
                  version: FieldValue.increment(1),
                  lastModified: FieldValue.serverTimestamp()
                });

                console.log(`✅ Removed '${roleToRemove}' from club member roles`);
              }
            }
          }
        }
      } catch (clubError) {
        console.warn('⚠️ Failed to update club member document:', clubError);
        // Don't fail the entire operation if club update fails
      }

      // STEP 3: Update user's clubAccess[].groupAccess[] array
      try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (userDoc.exists) {
          const userData = userDoc.data();
          const clubAccess = userData?.clubAccess || [];
          
          // Find the club in user's clubAccess array
          const clubIndex = clubAccess.findIndex((c: any) => c.clubId === clubId);
          
          if (clubIndex >= 0) {
            const groupAccess = clubAccess[clubIndex].groupAccess || [];
            const groupIndex = groupAccess.findIndex((g: any) => g.groupId === groupId);
            
            if (groupIndex >= 0) {
              const userGroupRoles = groupAccess[groupIndex].roles || [];
              
              if (operation === 'add') {
                if (!userGroupRoles.includes(roleToAdd!)) {
                  clubAccess[clubIndex].groupAccess[groupIndex].roles = [...userGroupRoles, roleToAdd!];
                  clubAccess[clubIndex].groupAccess[groupIndex].lastModifiedAt = new Date();
                  
                  await userRef.update({
                    clubAccess,
                    lastModifiedAt: FieldValue.serverTimestamp()
                  });

                  console.log(`✅ Added '${roleToAdd}' to user document`);
                }
              } else {
                // Remove operation
                const roleIndex = userGroupRoles.indexOf(roleToRemove!);
                if (roleIndex > -1) {
                  const updatedRoles = [...userGroupRoles];
                  updatedRoles.splice(roleIndex, 1);
                  clubAccess[clubIndex].groupAccess[groupIndex].roles = updatedRoles;
                  clubAccess[clubIndex].groupAccess[groupIndex].lastModifiedAt = new Date();
                  
                  await userRef.update({
                    clubAccess,
                    lastModifiedAt: FieldValue.serverTimestamp()
                  });

                  console.log(`✅ Removed '${roleToRemove}' from user document`);
                }
              }
            } else {
              console.warn(`⚠️ Group ${groupId} not found in user's clubAccess[].groupAccess array`);
            }
          } else {
            console.warn(`⚠️ Club ${clubId} not found in user's clubAccess array`);
          }
        }
      } catch (userError) {
        console.warn('⚠️ Failed to update user document:', userError);
        // Don't fail the entire operation if user update fails
      }

      console.log(`✨ Successfully ${operation === 'add' ? 'added' : 'removed'} role '${targetRole}' ${operation === 'add' ? 'to' : 'from'} user ${userId}`);

      // STEP 4: Create notification for role update
      try {
        // Fetch group data to get group and club names
        const groupRef = db.collection('clubs').doc(clubId).collection('groups').doc(groupId);
        const groupDoc = await groupRef.get();
        
        if (groupDoc.exists) {
          const groupData = groupDoc.data();
          const groupName = groupData?.name || 'Group';
          
          // Fetch club data
          const clubRef = db.collection('clubs').doc(clubId);
          const clubDoc = await clubRef.get();
          const clubName = clubDoc.exists ? clubDoc.data()?.name || 'Club' : 'Club';
          
          // Create role update notification
          console.log(`📬 Creating role update notification for user ${userId}`);
          const { createNotificationDirect } = await import('../notifications/createNotification.js');
          
          await createNotificationDirect(userId, {
            type: 'group_invitation',
            title: 'Role Update',
            message: operation === 'add' 
              ? `You have been promoted to ${targetRole} role in ${groupName}`
              : `Your ${targetRole} role has been removed from ${groupName}`,
            clubId,
            clubName,
            groupId,
            groupName,
            priority: 'high',
            metadata: {
              action: 'role_update',
              operation,
              role: targetRole,
              previousRoles: currentRoles
            }
          } as any);
          
          console.log(`✅ Role update notification created successfully`);
        }
      } catch (notifError) {
        console.warn('⚠️ Failed to create role update notification:', notifError);
        // Don't fail the entire operation if notification creation fails
      }

      const updatedRoles = operation === 'add' 
        ? [...currentRoles, targetRole!]
        : currentRoles.filter((r: string) => r !== targetRole);

      return {
        success: true,
        message: `Successfully ${operation === 'add' ? 'added' : 'removed'} ${targetRole} role`,
        updatedRoles
      };

    } catch (error: any) {
      console.error('❌ Error updating member role:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError(
        'internal',
        `Failed to update member role: ${error.message}`
      );
    }
  }
);
