import * as admin from 'firebase-admin';
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { RemoveMemberFromSubGroupRequest, RemoveMemberFromSubGroupResponse } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

/**
 * Remove a member from a subgroup
 * 
 * Architecture: Removes member from /clubs/{clubId}/groups/{groupId}/subgroups/{subgroupId}/allMembers/members
 * 
 * New approach:
 * - Uses subGroupId instead of subGroupName
 * - Only updates subgroup's allMembers collection
 * - No need to update belongsToSubGroups array (doesn't exist anymore)
 */
export const removeMemberFromSubGroup = onCall(
  {
    region: config.region,
  },
  async (request): Promise<RemoveMemberFromSubGroupResponse> => {
    try {
      const { clubId, groupId, subGroupId, userId } = request.data as RemoveMemberFromSubGroupRequest;

      // Validate required fields
      validateRequiredFields(request.data, ['clubId', 'groupId', 'subGroupId', 'userId']);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      console.log(`Removing user ${userId} from subgroup ${subGroupId} in group ${groupId}`);

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

      // Get subgroup members
      const subgroupMemberRef = subgroupRef
        .collection('allMembers')
        .doc('members');

      const subgroupMembersDoc = await subgroupMemberRef.get();
      if (!subgroupMembersDoc.exists) {
        throw new HttpsError('not-found', 'Subgroup members document not found');
      }

      const subgroupMembersData = subgroupMembersDoc.data();
      const currentMembers = subgroupMembersData?.members || [];

      // Find the member in subgroup
      const memberIndex = currentMembers.findIndex((member: any) => member.userId === userId);
      if (memberIndex === -1) {
        return {
          success: false,
          error: 'User is not a member of this subgroup'
        };
      }

      // Remove the member from the array
      const updatedMembers = currentMembers.filter((member: any) => member.userId !== userId);

      // Update the document with the new members array
      await subgroupMemberRef.update({
        members: updatedMembers,
        memberCount: updatedMembers.length,
        version: FieldValue.increment(1),
        lastModified: FieldValue.serverTimestamp()
      });

      console.log(`✅ Successfully removed user ${userId} from subgroup ${subGroupId}`);

      return {
        success: true,
        message: 'Member removed from subgroup successfully'
      };

    } catch (error) {
      console.error('Error in removeMemberFromSubGroup:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to remove member from subgroup');
    }
  }
);
