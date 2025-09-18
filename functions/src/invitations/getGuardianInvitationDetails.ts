import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { handleCorsOptions, setCorsHeaders, validateHttpMethod } from '../utils/cors';
import { isInvitationExpired, validateInvitationStatus } from '../utils/validation';

export const getGuardianInvitationDetails = onRequest(
  {
    region: config.region,
    cors: true,
  },
  async (req, res) => {
    // Handle CORS
    setCorsHeaders(res);
    
    if (handleCorsOptions(req, res)) return;
    
    if (!validateHttpMethod(req, res, ['GET'])) return;

    try {
      const invitationToken = req.query.token as string;
      console.log(`Getting guardian invitation details for token: ${invitationToken}`);

      if (!invitationToken) {
        res.status(400).json({ 
          success: false, 
          error: 'Invitation token is required' 
        });
        return;
      }

      // Get invitation details
      const invitationDoc = await admin.firestore()
        .collection('guardianInvitations')
        .doc(invitationToken)
        .get();

      if (!invitationDoc.exists) {
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

      // Check if expired
      if (isInvitationExpired(invitationData!.expiresAt)) {
        res.status(400).json({ 
          success: false, 
          error: 'This invitation has expired' 
        });
        return;
      }

      res.status(200).json({ 
        success: true, 
        invitation: {
          groupId: invitationData!.groupId,
          groupName: invitationData!.groupName,
          memberId: invitationData!.memberId,
          memberName: invitationData!.memberName,
          memberBirthDate: invitationData!.memberBirthDate,
          inviterName: invitationData!.inviterName,
          guardianEmails: invitationData!.guardianEmails,
          createdAt: invitationData!.createdAt,
          expiresAt: invitationData!.expiresAt,
        }
      });

    } catch (error) {
      console.error('Error getting guardian invitation details:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
);
