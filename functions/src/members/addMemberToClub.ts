import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { AddMemberToClubRequest, FunctionResponse } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const addMemberToClub = onCall(
  {
    region: config.region,
  },
  async (request): Promise<FunctionResponse> => {
    try {
      const { clubId, memberData }: AddMemberToClubRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['clubId', 'memberData']);
      
      // For youth members, email is optional; for regular members, email is required
      // Check if needsGuardian is explicitly true (not just truthy)
      const requiredMemberFields = memberData.needsGuardian === true
        ? ['userId', 'roles', 'name', 'addedBy'] // Youth members don't need email
        : ['userId', 'roles', 'name', 'email', 'addedBy']; // Regular members need email
      
      validateRequiredFields(memberData, requiredMemberFields);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      console.log(`Adding member ${memberData.userId} to club ${clubId}`);

      // Get current club allMembers document
      const clubMemberRef = admin.firestore()
        .collection('clubs')
        .doc(clubId)
        .collection('allMembers')
        .doc('members');

      const clubMembersDoc = await clubMemberRef.get();
      if (!clubMembersDoc.exists) {
        throw new HttpsError('not-found', 'Club members document not found');
      }

      const clubMembersData = clubMembersDoc.data();
      const currentMembers = clubMembersData?.members || [];

      // Check if user is already a member of the club
      const existingMember = currentMembers.find((m: any) => m.userId === memberData.userId);
      if (existingMember) {
        return {
          success: false,
          error: 'User is already a member of this club'
        };
      }

      // Add member to club using arrayUnion
      await clubMemberRef.update({
        members: admin.firestore.FieldValue.arrayUnion(memberData),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        memberCount: admin.firestore.FieldValue.increment(1),
        version: admin.firestore.FieldValue.increment(1), // Increment version
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update club total count
      await admin.firestore().collection('clubs').doc(clubId).update({
        totalCounts: admin.firestore.FieldValue.increment(1),
        version: admin.firestore.FieldValue.increment(1), // Increment version
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Successfully added member ${memberData.userId} to club ${clubId}`);

      return {
        success: true,
        message: `Member added to club successfully`
      };

    } catch (error) {
      console.error('Error in addMemberToClub:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to add member to club');
    }
  }
);
