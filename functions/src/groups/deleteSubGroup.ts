import * as admin from 'firebase-admin';
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { DeleteSubGroupRequest, DeleteSubGroupResponse } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

/**
 * Delete a subgroup and its allMembers collection
 * 
 * Architecture: Deletes /clubs/{clubId}/groups/{groupId}/subgroups/{subgroupId}
 * Permissions: admin, coach, group creator, or club admin
 * 
 * This is a clean delete - only removes the subgroup document and its subcollections.
 * No need to update individual member documents since we don't use belongsToSubGroups array.
 */
export const deleteSubGroup = onCall(
  {
    region: config.region,
  },
  async (request): Promise<DeleteSubGroupResponse> => {
    try {
      const { uid, clubId, groupId, subGroupId } = request.data as DeleteSubGroupRequest;

      // Validate required fields
      validateRequiredFields(request.data, ['uid', 'clubId', 'groupId', 'subGroupId']);

      // Verify user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const db = admin.firestore();

      // Verify subgroup exists
      const subgroupRef = db
        .collection('clubs')
        .doc(clubId)
        .collection('groups')
        .doc(groupId)
        .collection('subgroups')
        .doc(subGroupId);

      const subgroupDoc = await subgroupRef.get();
      
      if (!subgroupDoc.exists) {
        throw new HttpsError('not-found', 'Subgroup not found');
      }

      const subgroupData = subgroupDoc.data();
      const subgroupName = subgroupData?.name || 'Unknown';

      // Verify group exists and check permissions
      const groupRef = db.collection('clubs').doc(clubId).collection('groups').doc(groupId);
      const groupDoc = await groupRef.get();
      
      if (!groupDoc.exists) {
        throw new HttpsError('not-found', 'Group not found');
      }

      const groupData = groupDoc.data();

      // Check user permissions
      const groupMembersDoc = await db
        .collection('clubs')
        .doc(clubId)
        .collection('groups')
        .doc(groupId)
        .collection('allMembers')
        .doc('members')
        .get();

      const clubMembersDoc = await db
        .collection('clubs')
        .doc(clubId)
        .collection('allMembers')
        .doc('members')
        .get();

      const isGroupCreator = groupData?.createdBy === uid;
      
      // Check group membership and roles
      let isGroupAdminOrCoach = false;
      if (groupMembersDoc.exists) {
        const groupMembers = groupMembersDoc.data()?.members || [];
        const userGroupMembership = groupMembers.find((member: any) => member.userId === uid);
        const userRoles = userGroupMembership?.roles || [];
        isGroupAdminOrCoach = userRoles.includes('admin') || userRoles.includes('coach');
      }

      // Check club admin
      let isClubAdmin = false;
      if (clubMembersDoc.exists) {
        const clubMembers = clubMembersDoc.data()?.members || [];
        const userClubMembership = clubMembers.find((member: any) => member.userId === uid);
        isClubAdmin = userClubMembership?.roles?.includes('club-admin') || false;
      }

      if (!isGroupCreator && !isGroupAdminOrCoach && !isClubAdmin) {
        throw new HttpsError(
          'permission-denied',
          'You do not have permission to delete subgroups in this group'
        );
      }

      // Get member count before deletion (for reporting)
      const subgroupMembersRef = subgroupRef.collection('allMembers').doc('members');
      const subgroupMembersDoc = await subgroupMembersRef.get();
      const memberCount = subgroupMembersDoc.exists ? 
        (subgroupMembersDoc.data()?.memberCount || 0) : 0;

      // Create batch write
      const batch = db.batch();

      // Update group document to remove subgroup metadata
      batch.update(groupRef, {
        subGroups: FieldValue.arrayRemove({
          id: subGroupId,
          name: subgroupName
        }),
        lastModifiedAt: FieldValue.serverTimestamp()
      });

      // Delete allMembers/members document
      batch.delete(subgroupMembersRef);

      // Delete subgroup document
      batch.delete(subgroupRef);

      // Commit batch
      await batch.commit();

      console.log(`✅ Subgroup deleted: ${subGroupId} (${subgroupName}) from group ${groupId}, ${memberCount} members removed`);

      return {
        success: true,
        message: `Subgroup "${subgroupName}" deleted successfully`,
        deletedMemberCount: memberCount
      };

    } catch (error) {
      console.error('❌ Error deleting subgroup:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError(
        'internal',
        `Failed to delete subgroup: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);
