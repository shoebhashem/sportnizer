import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { ProcessGuardianInvitationRequest } from '../types/interfaces';
import { config } from '../utils/config';
import { handleCorsOptions, setCorsHeaders, validateHttpMethod } from '../utils/cors';
import { createOrUpdateUserWithGroup, findOrCreateUserByEmail } from '../utils/userManagement';
import { isInvitationExpired, validateInvitationStatus, validateRequiredFields } from '../utils/validation';

export const processGuardianInvitation = onRequest(
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
      const { 
        invitationToken, 
        guardianEmail, 
        guardianName, 
        guardianPhone, 
        relationship 
      }: ProcessGuardianInvitationRequest = req.body;
      
      console.log(`Processing guardian invitation - Token: ${invitationToken}, Email: ${guardianEmail}`);

      // Validate required fields
      validateRequiredFields(req.body, ['invitationToken', 'guardianEmail', 'guardianName', 'relationship']);

      // Get invitation details
      const invitationDoc = await admin.firestore()
        .collection('guardianInvitations')
        .doc(invitationToken)
        .get();

      if (!invitationDoc.exists) {
        console.log('Guardian invitation not found');
        res.status(404).json({ 
          success: false, 
          error: 'Invitation not found or expired' 
        });
        return;
      }

      const invitationData = invitationDoc.data();

      // Validate invitation status
      try {
        validateInvitationStatus(invitationData);
      } catch (error: any) {
        res.status(400).json({ 
          success: false, 
          error: error.message 
        });
        return;
      }

      // Check if invitation has expired
      if (isInvitationExpired(invitationData!.expiresAt)) {
        res.status(400).json({ 
          success: false, 
          error: 'This invitation has expired' 
        });
        return;
      }

      // Find or create guardian user account
      console.log('Finding or creating user by email:', guardianEmail.toLowerCase());
      const guardianUser = await findOrCreateUserByEmail(guardianEmail.toLowerCase(), guardianName);
      console.log('Guardian user ready:', guardianUser.uid);

      // Get group information to determine club
      const groupDoc = await admin.firestore()
        .collection('groups')
        .doc(invitationData!.groupId)
        .get();
      
      const groupData = groupDoc.data();
      const clubId = groupData?.clubId || 'unknown';
      const clubName = groupData?.clubName || 'Unknown Club';

      // Create or update user with group membership
      await createOrUpdateUserWithGroup(
        guardianUser, 
        invitationData!.groupId,
        invitationData!.groupName,
        clubId,
        clubName,
        'guardian',
        {
          name: guardianName,
          email: guardianEmail.toLowerCase(),
          emailVerified: guardianUser.emailVerified || false,
        }
      );

      const batch = admin.firestore().batch();

      // Update member to confirmed status
      const memberRef = admin.firestore()
        .collection('groups')
        .doc(invitationData!.groupId)
        .collection('members')
        .doc(invitationData!.memberId);
      
      batch.update(memberRef, {
        isConfirmed: true,
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        confirmedBy: guardianUser.uid,
      });

      // Add guardian to member's guardians subcollection
      const guardianRef = admin.firestore()
        .collection('groups')
        .doc(invitationData!.groupId)
        .collection('members')
        .doc(invitationData!.memberId)
        .collection('guardians')
        .doc(guardianUser.uid);

      batch.set(guardianRef, {
        guardianUserId: guardianUser.uid,
        relationship,
        contactEmail: guardianEmail.toLowerCase(),
        contactPhone: guardianPhone || '',
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
        addedViaInvitation: invitationToken,
      });

      // Mark invitation as used
      batch.update(invitationDoc.ref, {
        used: true,
        status: 'accepted',
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        usedBy: guardianUser.uid,
      });

      // Execute all updates
      await batch.commit();
      console.log('Guardian confirmation completed successfully');

      // Clean up invitation after successful processing
      setTimeout(async () => {
        try {
          await invitationDoc.ref.delete();
          console.log('Guardian invitation cleaned up');
        } catch (cleanupError) {
          console.error('Error cleaning up guardian invitation:', cleanupError);
        }
      }, 5000);

      res.status(200).json({ 
        success: true, 
        message: `Successfully confirmed ${invitationData!.memberName}'s participation in ${invitationData!.groupName}`,
        memberName: invitationData!.memberName,
        groupName: invitationData!.groupName,
        groupId: invitationData!.groupId,
        memberId: invitationData!.memberId
      });

    } catch (error) {
      console.error('Error processing guardian invitation:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
);
