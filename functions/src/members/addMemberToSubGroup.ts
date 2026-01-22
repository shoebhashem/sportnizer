import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { AddMemberToSubGroupRequest, AddMemberToSubGroupResponse } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

/**
 * Add a member to a subgroup
 * 
 * Architecture: Adds member to /clubs/{clubId}/groups/{groupId}/subgroups/{subgroupId}/allMembers/members
 * Prerequisites: Member must already be in the parent group
 * 
 * New approach:
 * - Uses subGroupId instead of subGroupName
 * - Copies full member data from group's allMembers to subgroup's allMembers
 * - No need to update belongsToSubGroups array (doesn't exist anymore)
 */
export const addMemberToSubGroup = onCall(
  {
    region: config.region,
  },
  async (request): Promise<AddMemberToSubGroupResponse> => {
    try {
      const { clubId, groupId, subGroupId, userId } = request.data as AddMemberToSubGroupRequest;

      // Validate required fields
      validateRequiredFields(request.data, ['clubId', 'groupId', 'subGroupId', 'userId']);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      console.log(`Adding user ${userId} to subgroup ${subGroupId} in group ${groupId}`);

      const db = admin.firestore();
      const currentUserId = request.auth.uid;

      // Verify group exists
      const groupRef = db
        .collection('clubs')
        .doc(clubId)
        .collection('groups')
        .doc(groupId);

      const groupDoc = await groupRef.get();
      if (!groupDoc.exists) {
        throw new HttpsError('not-found', 'Group not found');
      }

      const groupData = groupDoc.data();

      // Check permissions: only coach, admin, club-admin, or group creator can manage subgroup members
      const groupMemberRef = groupRef.collection('allMembers').doc('members');
      const groupMembersDoc = await groupMemberRef.get();
      
      if (!groupMembersDoc.exists) {
        throw new HttpsError('not-found', 'Group members document not found');
      }

      const groupMembersData = groupMembersDoc.data();
      const groupMembers = groupMembersData?.members || [];
      const currentUserMember = groupMembers.find((m: any) => m.userId === currentUserId);
      
      const isGroupCreator = groupData?.createdBy === currentUserId;
      
      console.log('Permission check:', {
        currentUserId,
        isGroupCreator,
        hasCurrentUserMember: !!currentUserMember,
        currentUserRoles: currentUserMember?.roles || 'none'
      });
      
      const hasPermission = isGroupCreator || (currentUserMember && (
        currentUserMember.roles?.includes('coach') ||
        currentUserMember.roles?.includes('admin') ||
        currentUserMember.roles?.includes('club-admin')
      ));

      if (!hasPermission) {
        console.error('Permission denied:', {
          currentUserId,
          isGroupCreator,
          hasCurrentUserMember: !!currentUserMember,
          currentUserRoles: currentUserMember?.roles
        });
        throw new HttpsError(
          'permission-denied',
          'Only coaches, admins, or group creators can manage subgroup members'
        );
      }

      // Verify subgroup exists
      const subgroupRef = groupRef.collection('subgroups').doc(subGroupId);
      const subgroupDoc = await subgroupRef.get();
      
      if (!subgroupDoc.exists) {
        throw new HttpsError('not-found', 'Subgroup not found');
      }

      // Find the member in group (groupMembers already fetched in permission check)
      const memberData = groupMembers.find((member: any) => member.userId === userId);
      if (!memberData) {
        throw new HttpsError('not-found', 'User is not a member of this group');
      }

      // Get subgroup members
      const subgroupMemberRef = subgroupRef
        .collection('allMembers')
        .doc('members');

      const subgroupMembersDoc = await subgroupMemberRef.get();
      
      let subgroupMembers: any[] = [];
      
      if (subgroupMembersDoc.exists) {
        const data = subgroupMembersDoc.data();
        subgroupMembers = data?.members || [];
      }

      // Check if user is already in this subgroup
      const alreadyInSubgroup = subgroupMembers.some((member: any) => member.userId === userId);
      if (alreadyInSubgroup) {
        return {
          success: false,
          error: 'User is already a member of this subgroup'
        };
      }

      // Add member to subgroup (copy full member data, excluding undefined values)
      const newMember: any = {
        userId: memberData.userId,
        name: memberData.name,
        roles: memberData.roles || ['member'],
        joinedAt: memberData.joinedAt || admin.firestore.FieldValue.serverTimestamp()
      };
      
      // Only include optional fields if they have actual values
      if (memberData.email !== undefined) {
        newMember.email = memberData.email;
      }
      if (memberData.photoURL !== undefined) {
        newMember.photoURL = memberData.photoURL;
      }
      if (memberData.needsGuardian !== undefined) {
        newMember.needsGuardian = memberData.needsGuardian;
      }
      if (memberData.guardianEmail !== undefined) {
        newMember.guardianEmail = memberData.guardianEmail;
      }
      if (memberData.guardianContacts !== undefined) {
        newMember.guardianContacts = memberData.guardianContacts;
      }
      
      subgroupMembers.push(newMember);

      // Update subgroup's allMembers document
      await subgroupMemberRef.set({
        members: subgroupMembers,
        memberCount: subgroupMembers.length,
        version: admin.firestore.FieldValue.increment(1),
        lastModified: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Successfully added user ${userId} to subgroup ${subGroupId}`);

      return {
        success: true,
        message: 'Member added to subgroup successfully'
      };

    } catch (error) {
      console.error('Error in addMemberToSubGroup:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to add member to subgroup');
    }
  }
);
