import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { ProcessInvitationRequest } from '../types/interfaces';
import { config } from '../utils/config';
import { handleCorsOptions, setCorsHeaders, validateHttpMethod } from '../utils/cors';
import { createOrUpdateUserWithGroup } from '../utils/userManagement';
import { validateEmailMatch, validateInvitationStatus, validateRequiredFields, validateShareableInvitationStatus } from '../utils/validation';

export const processInvitation = onRequest(
  {
    region: config.region,
    cors: true,
  },
  async (req, res) => {
    // Handle CORS
    setCorsHeaders(res);
    
    if (handleCorsOptions(req, res)) return;
    
    if (!validateHttpMethod(req, res, ['POST'])) return;

    try {
      const { invitationToken, userEmail }: ProcessInvitationRequest = req.body;
      console.log(`Processing invitation request - Token: ${invitationToken}, Email: ${userEmail}`);

      // Validate required fields
      validateRequiredFields(req.body, ['invitationToken', 'userEmail']);

      // Try to get from regular invitations first
      let invitationDoc = await admin.firestore()
        .collection('invitations')
        .doc(invitationToken)
        .get();

      let invitationType: 'email' | 'shareable' = 'email';
      let invitationData = invitationDoc.data();

      // If not found in regular invitations, try shareable invitations
      if (!invitationDoc.exists) {
        invitationDoc = await admin.firestore()
          .collection('shareableInvites')
          .doc(invitationToken)
          .get();
        
        invitationType = 'shareable';
        invitationData = invitationDoc.data();
      }

      if (!invitationDoc.exists) {
        console.log('Invitation document not found');
        res.status(404).json({ 
          success: false, 
          error: 'Invitation not found or expired' 
        });
        return;
      }
      console.log('Invitation data found:', invitationData);

      // Validate invitation status based on type
      if (invitationType === 'email') {
        validateInvitationStatus(invitationData);
        
        // Check if invitation has already been used
        if (invitationData!.used) {
          console.log('Email invitation already used');
          res.status(400).json({ 
            success: false, 
            error: 'This invitation has already been used' 
          });
          return;
        }

        // Verify email matches for email invitations
        console.log(`Verifying email match - Invitation: ${invitationData!.email}, User: ${userEmail.trim().toLowerCase()}`);
        validateEmailMatch(invitationData!.email, userEmail);
      } else {
        // Validate shareable invitation
        validateShareableInvitationStatus(invitationData);
        
        // For shareable invitations, check if user already used this invite
        if (invitationData!.usedBy?.includes(userEmail.trim().toLowerCase())) {
          console.log('User already used this shareable invitation');
          res.status(400).json({ 
            success: false, 
            error: 'You have already used this invitation' 
          });
          return;
        }
      }

      // Find user by email
      console.log(`Looking up user by email: ${userEmail}`);
      const userRecord = await admin.auth().getUserByEmail(userEmail);
      console.log(`User found: ${userRecord.uid}`);

      // Get club and group information from invitation data
      const clubId = invitationData!.clubId;
      const groupId = invitationData!.groupId;

      if (!clubId) {
        // Fallback: search for the group across all clubs (for backward compatibility)
        console.log(`Finding group ${groupId} in clubs collection`);
        
        let groupDoc: any = null;
        let foundClubId: string = '';

        const clubsSnapshot = await admin.firestore().collection('clubs').get();
        
        for (const clubDoc of clubsSnapshot.docs) {
          const tempGroupRef = admin.firestore()
            .collection('clubs')
            .doc(clubDoc.id)
            .collection('groups')
            .doc(groupId);
          
          const tempGroupDoc = await tempGroupRef.get();
          if (tempGroupDoc.exists) {
            groupDoc = tempGroupDoc;
            foundClubId = clubDoc.id;
            break;
          }
        }

        if (!groupDoc || !groupDoc.exists) {
          console.log('Group not found in any club');
          res.status(404).json({ 
            success: false, 
            error: 'Group not found' 
          });
          return;
        }

        // Use found clubId for backward compatibility
        invitationData!.clubId = foundClubId;
      }

      // Check if group exists in the specified club
      console.log(`Checking group ${groupId} in club ${clubId}`);
      const groupRef = admin.firestore()
        .collection('clubs')
        .doc(clubId)
        .collection('groups')
        .doc(groupId);
      
      const groupDoc = await groupRef.get();
      
      if (!groupDoc.exists) {
        console.log('Group not found');
        res.status(404).json({ 
          success: false, 
          error: 'Group not found' 
        });
        return;
      }

      // Add user to group and club members
      console.log('Adding user to group and club allMembers documents');
      
      const batch = admin.firestore().batch();
      const now = admin.firestore.FieldValue.serverTimestamp();
      const timestampNow = admin.firestore.Timestamp.now();

      // Prepare member data
      const memberData = {
        userId: userRecord.uid,
        roles: ['member'],
        joinedAt: timestampNow,
        photoURL: userRecord.photoURL || '',
        name: userRecord.displayName || userRecord.email?.split('@')[0] || 'User',
        email: userRecord.email || '',
        needsGuardian: false,
        guardiansContacts: [],
        belongtoSubGroups: []
      };

      const clubMemberData = {
        ...memberData,
        addedBy: invitationData!.inviterUid,
        lastModifiedAt: timestampNow
      };

      // Get current group allMembers document
      const groupMembersRef = admin.firestore()
        .doc(`clubs/${clubId}/groups/${invitationData!.groupId}/allMembers/members`);
      
      const groupMembersDoc = await groupMembersRef.get();
      
      if (groupMembersDoc.exists) {
        const groupMembersData = groupMembersDoc.data();
        const existingMembers = groupMembersData?.members || [];
        
        // Check if user is already a member
        const existingMember = existingMembers.find((m: any) => m.userId === userRecord.uid);
        
        if (!existingMember) {
          // Add to group allMembers
          batch.update(groupMembersRef, {
            members: admin.firestore.FieldValue.arrayUnion(memberData),
            lastUpdated: now,
            memberCount: admin.firestore.FieldValue.increment(1)
          });
        }
      }

      // Get current club allMembers document  
      const clubMembersRef = admin.firestore().doc(`clubs/${clubId}/allMembers/members`);
      const clubMembersDoc = await clubMembersRef.get();
      
      let isNewClubMember = true;
      
      if (clubMembersDoc.exists) {
        const clubMembersData = clubMembersDoc.data();
        const existingClubMembers = clubMembersData?.members || [];
        
        // Check if user is already a club member
        const existingClubMember = existingClubMembers.find((m: any) => m.userId === userRecord.uid);
        
        if (!existingClubMember) {
          // Add to club allMembers
          batch.update(clubMembersRef, {
            members: admin.firestore.FieldValue.arrayUnion(clubMemberData),
            lastUpdated: now,
            memberCount: admin.firestore.FieldValue.increment(1)
          });
        } else {
          isNewClubMember = false;
        }
      }

      // Update group memberCount
      batch.update(groupRef, {
        memberCount: admin.firestore.FieldValue.increment(1)
      });

      // Update club totalCounts if user is new to club
      if (isNewClubMember) {
        const clubRef = admin.firestore().doc(`clubs/${clubId}`);
        batch.update(clubRef, {
          totalCounts: admin.firestore.FieldValue.increment(1)
        });
      }

      // Update user's groupsJoined array
      const userRef = admin.firestore().doc(`users/${userRecord.uid}`);
      const userDoc = await userRef.get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        const currentGroupsJoined = userData?.groupsJoined || [];
        
        // Check if group membership already exists
        const existingMembership = currentGroupsJoined.find(
          (membership: any) => membership.groupId === invitationData!.groupId
        );
        
        if (!existingMembership) {
          const groupMembership = {
            clubId,
            groupId: invitationData!.groupId,
            groupName: invitationData!.groupName,
            roles: ['member'],
            joinedAt: new Date(),
            lastModifiedAt: new Date()
          };
          
          batch.update(userRef, {
            groupsJoined: admin.firestore.FieldValue.arrayUnion(groupMembership)
          });
        }
      } else {
        // Create user document if it doesn't exist
        await createOrUpdateUserWithGroup(userRecord, invitationData!.groupId, 'member');
      }
      
      console.log(`Added group ${invitationData!.groupId} to user ${userRecord.uid} using GroupMembership structure`);

      // Update invitation based on type
      if (invitationType === 'email') {
        // Mark email invitation as used
        batch.update(invitationDoc.ref, {
          used: true,
          status: 'accepted',
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
          usedBy: userRecord.uid,
        });
      } else {
        // Update shareable invitation usage
        batch.update(invitationDoc.ref, {
          currentUses: admin.firestore.FieldValue.increment(1),
          usedBy: admin.firestore.FieldValue.arrayUnion(userRecord.uid),
          lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUsedBy: userRecord.uid,
        });
      }

      // Execute all updates
      await batch.commit();
      console.log('All updates completed successfully');

      // Clean up email invitation after successful processing (shareable invites stay active)
      if (invitationType === 'email') {
        setTimeout(async () => {
          try {
            await invitationDoc.ref.delete();
            console.log('Email invitation cleaned up');
          } catch (cleanupError) {
            console.error('Error cleaning up invitation:', cleanupError);
          }
        }, 5000);
      }

      console.log(`Successfully added user to group: ${invitationData!.groupName}`);
      res.status(200).json({ 
        success: true, 
        message: `Successfully added to ${invitationData!.groupName}` 
      });

    } catch (error) {
      console.error('Error processing invitation:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
);
