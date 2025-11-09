import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { AddMemberToSubGroupRequest, AddMemberToSubGroupResponse } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const addMemberToSubGroup = onCall(
  {
    region: config.region,
  },
  async (request): Promise<AddMemberToSubGroupResponse> => {
    try {
      const { clubId, groupId, subGroupName, userId }: AddMemberToSubGroupRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['clubId', 'groupId', 'subGroupName', 'userId']);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      console.log(`Adding user ${userId} to subgroup ${subGroupName} in group ${groupId}`);

      // Verify group exists
      const groupRef = admin.firestore()
        .collection('clubs')
        .doc(clubId)
        .collection('groups')
        .doc(groupId);

      const groupDoc = await groupRef.get();
      if (!groupDoc.exists) {
        throw new HttpsError('not-found', 'Group not found');
      }

      // Get current group allMembers document
      const groupMemberRef = admin.firestore()
        .collection('clubs')
        .doc(clubId)
        .collection('groups')
        .doc(groupId)
        .collection('allMembers')
        .doc('members');

      const groupMembersDoc = await groupMemberRef.get();
      if (!groupMembersDoc.exists) {
        throw new HttpsError('not-found', 'Group members document not found');
      }

      const groupMembersData = groupMembersDoc.data();
      const currentMembers = groupMembersData?.members || [];

      // Find the specific member by userId
      const memberIndex = currentMembers.findIndex((member: any) => member.userId === userId);
      if (memberIndex === -1) {
        throw new HttpsError('not-found', 'User is not a member of this group');
      }

      const member = currentMembers[memberIndex];
      const currentSubGroups = member.belongsToSubGroups || [];

      // Check if user is already in this subgroup
      if (currentSubGroups.includes(subGroupName)) {
        return {
          success: false,
          error: 'User is already a member of this subgroup'
        };
      }

      // Update the member's belongsToSubGroups array
      const updatedMember = {
        ...member,
        belongsToSubGroups: [...currentSubGroups, subGroupName]
      };

      // Replace the member in the array
      const updatedMembers = [...currentMembers];
      updatedMembers[memberIndex] = updatedMember;

      // Update the document with the new members array
      await groupMemberRef.update({
        members: updatedMembers,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`Successfully added user ${userId} to subgroup ${subGroupName}`);

      return {
        success: true,
        message: `Member added to subgroup ${subGroupName} successfully`,
        subGroupName: subGroupName
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
