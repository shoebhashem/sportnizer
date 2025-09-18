import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { handleCorsOptions, setCorsHeaders, validateHttpMethod } from '../utils/cors';
import { validateInvitationStatus } from '../utils/validation';

export const getInvitationDetails = onRequest(
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
      console.log(`Getting invitation details for token: ${invitationToken}`);

      if (!invitationToken) {
        res.status(400).json({ 
          success: false, 
          error: 'Invitation token is required' 
        });
        return;
      }

      // Get invitation details
      const invitationDoc = await admin.firestore()
        .collection('invitations')
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

      res.status(200).json({ 
        success: true, 
        invitation: {
          groupName: invitationData!.groupName,
          inviterName: invitationData!.inviterName,
          email: invitationData!.email,
          createdAt: invitationData!.createdAt,
        }
      });

    } catch (error) {
      console.error('Error getting invitation details:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
);
