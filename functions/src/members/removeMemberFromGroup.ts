import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { RemoveMemberFromGroupRequest, RemoveMemberFromGroupResponse } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const removeMemberFromGroup = onCall(
  {
    region: config.region,
  },
  async (request): Promise<RemoveMemberFromGroupResponse> => {
    try {
      const { clubId, groupId, userId }: RemoveMemberFromGroupRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['clubId', 'groupId', 'userId']);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      console.log(`Removing user ${userId} from group ${groupId} in club ${clubId}`);

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
        return {
          success: false,
          error: 'User is not a member of this group'
        };
      }

      // Remove member from the array
      const updatedMembers = currentMembers.filter((member: any) => member.userId !== userId);

      // Update the members document
      await groupMemberRef.update({
        members: updatedMembers,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        memberCount: admin.firestore.FieldValue.increment(-1),
        version: admin.firestore.FieldValue.increment(1), // Increment version
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update group member count
      await groupRef.update({
        membersCount: admin.firestore.FieldValue.increment(-1),
        version: admin.firestore.FieldValue.increment(1), // Increment version
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 🆕 CASCADE: Remove member from all subgroups in this group
      console.log(`Checking for subgroups to cascade removal...`);
      
      const subgroupsSnapshot = await groupRef.collection('subgroups').get();
      
      if (!subgroupsSnapshot.empty) {
        console.log(`Found ${subgroupsSnapshot.size} subgroups - cascading removal`);
        
        for (const subgroupDoc of subgroupsSnapshot.docs) {
          const subgroupId = subgroupDoc.id;
          const subgroupMemberRef = subgroupDoc.ref
            .collection('allMembers')
            .doc('members');
          
          const subgroupMembersDoc = await subgroupMemberRef.get();
          
          if (subgroupMembersDoc.exists) {
            const subgroupMembers = subgroupMembersDoc.data()?.members || [];
            const isMemberInSubgroup = subgroupMembers.some((m: any) => m.userId === userId);
            
            if (isMemberInSubgroup) {
              const updatedSubgroupMembers = subgroupMembers.filter((m: any) => m.userId !== userId);
              
              await subgroupMemberRef.update({
                members: updatedSubgroupMembers,
                memberCount: updatedSubgroupMembers.length,
                version: admin.firestore.FieldValue.increment(1),
                lastModified: admin.firestore.FieldValue.serverTimestamp(),
              });
              
              console.log(`  ✅ Removed member from subgroup ${subgroupId}`);
            }
          }
        }
      }

      console.log(`Successfully removed member ${userId} from group ${groupId} and all subgroups`);

      return {
        success: true,
        message: `Member removed from group and all subgroups successfully`
      };

    } catch (error) {
      console.error('Error in removeMemberFromGroup:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to remove member from group');
    }
  }
);
