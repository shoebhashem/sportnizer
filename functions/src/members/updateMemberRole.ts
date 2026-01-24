/**
 * Update Member Role Function
 * 
 * Adds a new role to an existing member's roles array.
 * This is used when promoting members (e.g., member → coach).
 * Updates both group/club membership and user document.
 */

import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

interface UpdateMemberRoleRequest {
  clubId: string;
  groupId: string;
  userId: string;
  roleToAdd: string;
}

// Valid roles in the system
const VALID_ROLES = ['club-admin', 'admin', 'coach', 'player', 'player-underage', 'guardian'];

// Management roles that can be assigned via this function
const ASSIGNABLE_ROLES = ['admin', 'coach'];

export const updateMemberRole = onCall(
  {
    region: config.region,
  },
  async (request) => {
    try {
      const { clubId, groupId, userId, roleToAdd }: UpdateMemberRoleRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['clubId', 'groupId', 'userId', 'roleToAdd']);

      // Validate role
      if (!VALID_ROLES.includes(roleToAdd)) {
        throw new HttpsError(
          'invalid-argument',
          `Invalid role '${roleToAdd}'. Valid roles are: ${VALID_ROLES.join(', ')}`
        );
      }

      // Only allow assignment of management roles through this function
      if (!ASSIGNABLE_ROLES.includes(roleToAdd)) {
        throw new HttpsError(
          'invalid-argument',
          `Role '${roleToAdd}' cannot be assigned via this function. Only ${ASSIGNABLE_ROLES.join(', ')} roles can be promoted.`
        );
      }

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      console.log(`🔄 Adding role '${roleToAdd}' to user ${userId} in group ${groupId}`);

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

      // Check if role already exists
      if (currentRoles.includes(roleToAdd)) {
        console.log(`ℹ️ User ${userId} already has role '${roleToAdd}'`);
        return {
          success: true,
          message: `User already has the ${roleToAdd} role`,
          alreadyHasRole: true
        };
      }

      // Add the new role
      members[memberIndex].roles = [...currentRoles, roleToAdd];
      // Note: Can't use FieldValue.serverTimestamp() inside arrays
      members[memberIndex].lastModifiedAt = new Date();

      // Update Firestore
      await groupMembersRef.update({
        members,
        version: admin.firestore.FieldValue.increment(1),
        lastModified: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Updated group member document with new role`);

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
            if (!clubMemberRoles.includes(roleToAdd)) {
              clubMembers[clubMemberIndex].roles = [...clubMemberRoles, roleToAdd];
              // Note: Can't use FieldValue.serverTimestamp() inside arrays
              clubMembers[clubMemberIndex].lastModifiedAt = new Date();

              await clubMembersRef.update({
                members: clubMembers,
                version: admin.firestore.FieldValue.increment(1),
                lastModified: admin.firestore.FieldValue.serverTimestamp()
              });

              console.log(`✅ Updated club member document with new role`);
            }
          }
        }
      } catch (clubError) {
        console.warn('⚠️ Failed to update club member document:', clubError);
        // Don't fail the entire operation if club update fails
      }

      // STEP 3: Update user's groupsJoined array
      try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (userDoc.exists) {
          const userData = userDoc.data();
          const groupsJoined = userData?.groupsJoined || [];
          
          // Find the group in user's groupsJoined array
          const groupIndex = groupsJoined.findIndex((g: any) => g.groupId === groupId);
          
          if (groupIndex >= 0) {
            const userGroupRoles = groupsJoined[groupIndex].roles || [];
            if (!userGroupRoles.includes(roleToAdd)) {
              groupsJoined[groupIndex].roles = [...userGroupRoles, roleToAdd];
              
              await userRef.update({
                groupsJoined,
                lastModifiedAt: admin.firestore.FieldValue.serverTimestamp()
              });

              console.log(`✅ Updated user document with new role`);
            }
          } else {
            console.warn(`⚠️ Group ${groupId} not found in user's groupsJoined array`);
          }
        }
      } catch (userError) {
        console.warn('⚠️ Failed to update user document:', userError);
        // Don't fail the entire operation if user update fails
      }

      console.log(`✨ Successfully added role '${roleToAdd}' to user ${userId}`);

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
            message: `You have been promoted to ${roleToAdd} role in ${groupName}`,
            clubId,
            clubName,
            groupId,
            groupName,
            priority: 'high',
            metadata: {
              action: 'role_update',
              newRole: roleToAdd,
              existingRoles: currentRoles
            }
          } as any);
          
          console.log(`✅ Role update notification created successfully`);
        }
      } catch (notifError) {
        console.warn('⚠️ Failed to create role update notification:', notifError);
        // Don't fail the entire operation if notification creation fails
      }

      return {
        success: true,
        message: `Successfully added ${roleToAdd} role`,
        updatedRoles: [...currentRoles, roleToAdd]
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
