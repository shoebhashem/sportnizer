import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { AddMemberToGroupRequest, FunctionResponse } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const addMemberToGroup = onCall(
  {
    region: config.region,
  },
  async (request): Promise<FunctionResponse> => {
    try {
      const { clubId, groupId, memberData }: AddMemberToGroupRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['clubId', 'groupId', 'memberData']);
      
      // DEBUG: Log memberData to see what we're receiving
      console.log('🔍 DEBUG addMemberToGroup - memberData received:', JSON.stringify({
        needsGuardian: memberData.needsGuardian,
        needsGuardianType: typeof memberData.needsGuardian,
        hasEmail: 'email' in memberData,
        emailValue: memberData.email,
        memberDataKeys: Object.keys(memberData)
      }));
      
      // For youth members, email is optional; for regular members, email is required
      // Check if needsGuardian is explicitly true (not just truthy)
      const requiredMemberFields = memberData.needsGuardian === true
        ? ['userId', 'roles', 'name'] // Youth members don't need email
        : ['userId', 'roles', 'name', 'email']; // Regular members need email
      
      console.log('🔍 DEBUG addMemberToGroup - requiredMemberFields:', requiredMemberFields);
      
      validateRequiredFields(memberData, requiredMemberFields);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      console.log(`Adding member ${memberData.userId} to group ${groupId} in club ${clubId}`);

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

      // Check if user is already a member of the group
      const existingMember = currentMembers.find((m: any) => m.userId === memberData.userId);
      if (existingMember) {
        return {
          success: false,
          error: 'User is already a member of this group'
        };
      }

      // Add member to group using arrayUnion
      await groupMemberRef.update({
        members: admin.firestore.FieldValue.arrayUnion(memberData),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        memberCount: admin.firestore.FieldValue.increment(1),
        version: admin.firestore.FieldValue.increment(1), // Increment version
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update group member count
      await groupRef.update({
        membersCount: admin.firestore.FieldValue.increment(1),
        version: admin.firestore.FieldValue.increment(1), // Increment version
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Successfully added member ${memberData.userId} to group ${groupId}`);

      return {
        success: true,
        message: `Member added to group successfully`
      };

    } catch (error) {
      console.error('Error in addMemberToGroup:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to add member to group');
    }
  }
);
