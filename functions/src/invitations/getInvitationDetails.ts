import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { handleCorsOptions, setCorsHeaders, validateHttpMethod } from '../utils/cors';
import { validateInvitationStatus, validateShareableInvitationStatus } from '../utils/validation';

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
        res.status(404).json({ 
          success: false, 
          error: 'Invitation not found or expired' 
        });
        return;
      }

      // Validate invitation status based on type
      try {
        if (invitationType === 'email') {
          validateInvitationStatus(invitationData);
        } else {
          // Validate shareable invitation
          validateShareableInvitationStatus(invitationData);
        }
      } catch (error: any) {
        res.status(400).json({ 
          success: false, 
          error: error.message 
        });
        return;
      }

      // Get additional group information
      const groupDoc = await admin.firestore()
        .collection('groups')
        .doc(invitationData!.groupId)
        .get();

      const groupData = groupDoc.exists ? groupDoc.data() : null;

      // Return different response formats based on invitation type
      const response = {
        success: true,
        invitation: {
          invitationType,
          groupId: invitationData!.groupId,
          groupName: invitationData!.groupName,
          inviterName: invitationData!.inviterName,
          createdAt: invitationData!.createdAt,
          
          // Email invitation specific fields
          ...(invitationType === 'email' && {
            email: invitationData!.email,
          }),
          
          // Shareable invitation specific fields
          ...(invitationType === 'shareable' && {
            expiresAt: invitationData!.expiresAt,
            maxUses: invitationData!.maxUses,
            currentUses: invitationData!.currentUses,
            invitationSubType: invitationData!.invitationType, // 'group-member', 'coach', etc.
          }),
          
          // Additional group info (if available)
          ...(groupData && {
            groupInfo: {
              sportType: groupData.sportType,
              description: groupData.description,
              memberCount: groupData.memberCount,
              isActive: groupData.isActive,
            }
          })
        }
      };

      res.status(200).json(response);

    } catch (error) {
      console.error('Error getting invitation details:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
);
