import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export interface RespondToGroupInviteRequest {
  inviteId: string;
  action: 'accept' | 'reject';
  clubId: string;
  groupId: string;
}

export interface RespondToGroupInviteResponse {
  success: boolean;
  action: 'accepted' | 'rejected' | 'error';
  message: string;
  error?: string;
}

export const respondToGroupInvite = onCall(
  {
    region: config.region,
  },
  async (request): Promise<RespondToGroupInviteResponse> => {
    try {
      const { inviteId, action, clubId, groupId }: RespondToGroupInviteRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['inviteId', 'action', 'clubId', 'groupId']);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      if (!['accept', 'reject'].includes(action)) {
        throw new HttpsError('invalid-argument', 'Action must be either "accept" or "reject"');
      }

      const userId = request.auth.uid;
      console.log(`User ${userId} responding to invitation ${inviteId} with action: ${action}`);

      const db = admin.firestore();
      
      // Get user document
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User document not found');
      }

      const userData = userDoc.data();
      const clubAccess = userData?.clubAccess || [];
      
      // Find the club and invitation
      const clubIndex = clubAccess.findIndex((club: any) => club.clubId === clubId);
      if (clubIndex === -1) {
        throw new HttpsError('not-found', 'Club not found in user access');
      }

      const groupInvites = clubAccess[clubIndex].groupInvites || [];
      const inviteIndex = groupInvites.findIndex((invite: any) => invite.inviteId === inviteId);
      if (inviteIndex === -1) {
        throw new HttpsError('not-found', 'Invitation not found');
      }

      const invitation = groupInvites[inviteIndex];
      
      // Verify invitation is for the correct group and is still pending
      if (invitation.groupId !== groupId) {
        throw new HttpsError('invalid-argument', 'Invitation group ID mismatch');
      }

      if (invitation.status !== 'pending') {
        throw new HttpsError('failed-precondition', 'Invitation has already been responded to');
      }

      if (action === 'accept') {
        console.log(`✅ User accepted invitation to group ${invitation.groupName}`);
        
        // Remove the invitation from groupInvites array
        clubAccess[clubIndex].groupInvites.splice(inviteIndex, 1);
        
        // If user doesn't have club access yet, add it
        if (!clubAccess[clubIndex].role) {
          clubAccess[clubIndex].role = 'member';
          clubAccess[clubIndex].joinedAt = admin.firestore.FieldValue.serverTimestamp();
        }
        
        // Add user to group access
        if (!clubAccess[clubIndex].groupAccess) {
          clubAccess[clubIndex].groupAccess = [];
        }
        
        // Check if user already has access to this group
        const existingGroupAccess = clubAccess[clubIndex].groupAccess.find(
          (group: any) => group.groupId === groupId
        );
        
        if (!existingGroupAccess) {
          clubAccess[clubIndex].groupAccess.push({
            groupId: invitation.groupId,
            groupName: invitation.groupName,
            roles: ['player'], // Default role for invited members
            joinedAt: admin.firestore.FieldValue.serverTimestamp(),
            subGroups: []
          });
        }
        
        // Update user document
        await userRef.update({
          clubAccess: clubAccess,
          lastModified: admin.firestore.FieldValue.serverTimestamp(),
          version: admin.firestore.FieldValue.increment(1)
        });

        // Add user to club and group using proper club membership verification
        try {
          // STEP 1: Check if user is already a club member
          const clubMemberRef = admin.firestore()
            .collection('clubs')
            .doc(clubId)
            .collection('allMembers')
            .doc('members');

          const clubMembersDoc = await clubMemberRef.get();
          let isAlreadyClubMember = false;

          if (clubMembersDoc.exists) {
            const clubMembersData = clubMembersDoc.data();
            const members = clubMembersData?.members || [];
            isAlreadyClubMember = members.some((member: any) => member.userId === userId);
          }

          console.log(`🔍 User ${userId} club membership check: ${isAlreadyClubMember ? 'Already member' : 'Not a member'}`);

          // STEP 2: Add to club membership if not already a member
          if (!isAlreadyClubMember) {
            console.log(`➕ Adding user ${userId} to club ${clubId} first`);
            
            const clubMemberData = {
              userId: userId,
              name: userData?.displayName || userData?.name || userData?.email?.split('@')[0] || 'Unknown User',
              email: userData?.email || '',
              roles: ['member'],
              joinedAt: admin.firestore.FieldValue.serverTimestamp(),
              photoURL: userData?.photoURL || '',
              needsGuardian: false,
              guardiansContacts: [],
              addedBy: invitation.inviterUid
            };

            await clubMemberRef.update({
              members: admin.firestore.FieldValue.arrayUnion(clubMemberData),
              lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
              memberCount: admin.firestore.FieldValue.increment(1),
              version: admin.firestore.FieldValue.increment(1),
              lastModified: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Update club total count
            await admin.firestore().collection('clubs').doc(clubId).update({
              totalCounts: admin.firestore.FieldValue.increment(1),
              version: admin.firestore.FieldValue.increment(1),
              lastModified: admin.firestore.FieldValue.serverTimestamp(),
            });

            console.log('✅ User added to club membership successfully');
          } else {
            console.log('ℹ️ User already a club member, skipping club addition');
          }

          // STEP 3: Add user to group (this always happens)
          console.log(`➕ Adding user ${userId} to group ${groupId}`);
          
          const groupMemberData = {
            userId: userId,
            name: userData?.displayName || userData?.name || userData?.email?.split('@')[0] || 'Unknown User',
            email: userData?.email || '',
            roles: ['player'],
            joinedAt: admin.firestore.FieldValue.serverTimestamp(),
            photoURL: userData?.photoURL || '',
            needsGuardian: false,
            belongsToSubGroups: [],
            guardiansContacts: [],
            addedBy: invitation.inviterUid
          };

          const groupMemberRef = admin.firestore()
            .collection('clubs')
            .doc(clubId)
            .collection('groups')
            .doc(groupId)
            .collection('allMembers')
            .doc('members');

          await groupMemberRef.update({
            members: admin.firestore.FieldValue.arrayUnion(groupMemberData),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            memberCount: admin.firestore.FieldValue.increment(1),
            version: admin.firestore.FieldValue.increment(1),
            lastModified: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log('✅ User added to group membership successfully');
          
        } catch (membershipError) {
          console.error('❌ Error adding user to club/group:', membershipError);
          throw new HttpsError('internal', 'Failed to add user to club/group membership');
        }

        return {
          success: true,
          action: 'accepted',
          message: `Successfully joined ${invitation.groupName}`
        };

      } else { // action === 'reject'
        console.log(`❌ User rejected invitation to group ${invitation.groupName}`);
        
        // Simply remove the invitation from groupInvites array
        clubAccess[clubIndex].groupInvites.splice(inviteIndex, 1);
        
        // If this was the only invitation and user has no other access to the club, remove club entry
        if (clubAccess[clubIndex].groupInvites.length === 0 && 
            (!clubAccess[clubIndex].groupAccess || clubAccess[clubIndex].groupAccess.length === 0) &&
            !clubAccess[clubIndex].role) {
          clubAccess.splice(clubIndex, 1);
        }
        
        // Update user document
        await userRef.update({
          clubAccess: clubAccess,
          lastModified: admin.firestore.FieldValue.serverTimestamp(),
          version: admin.firestore.FieldValue.increment(1)
        });

        return {
          success: true,
          action: 'rejected',
          message: `Declined invitation to ${invitation.groupName}`
        };
      }

    } catch (error) {
      console.error('Error in respondToGroupInvite:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to respond to group invitation');
    }
  }
);
