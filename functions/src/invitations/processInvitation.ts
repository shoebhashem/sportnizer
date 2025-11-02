import cors from 'cors';
import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';

const corsHandler = cors({ origin: true });

export const processInvitation = onRequest(
  { region: 'europe-north1' },
  async (req, res) => {
    return new Promise<void>((resolve) => {
      corsHandler(req, res, async () => {
        try {
          // Only allow POST requests
          if (req.method !== 'POST') {
            res.status(405).json({ success: false, error: 'Method not allowed' });
            resolve();
            return;
          }

          const { invitationToken } = req.body;

          if (!invitationToken) {
            res.status(400).json({ 
              success: false, 
              error: 'Invitation token is required' 
            });
            resolve();
            return;
          }

          console.log('Processing invitation token validation:', invitationToken);

          // Look up the invitation in Firestore
          const invitationDoc = await admin.firestore()
            .collection('invitations')
            .doc(invitationToken)
            .get();

          if (!invitationDoc.exists) {
            console.log('Invitation not found:', invitationToken);
            res.status(404).json({ 
              success: false, 
              error: 'Invitation not found or has expired' 
            });
            resolve();
            return;
          }

          const invitationData = invitationDoc.data();

          // Check if invitation is still valid
          if (invitationData?.used) {
            console.log('Invitation already used:', invitationToken);
            res.status(400).json({ 
              success: false, 
              error: 'This invitation has already been used' 
            });
            resolve();
            return;
          }

          if (invitationData?.status !== 'pending') {
            console.log('Invitation status is not pending:', invitationData?.status);
            res.status(400).json({ 
              success: false, 
              error: 'This invitation is no longer valid' 
            });
            resolve();
            return;
          }

          // Check if invitation has expired (7 days)
          const createdAt = invitationData?.createdAt?.toDate();
          if (createdAt) {
            const daysSinceCreated = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceCreated > 7) {
              console.log('Invitation expired:', daysSinceCreated, 'days old');
              res.status(400).json({ 
                success: false, 
                error: 'This invitation has expired' 
              });
              resolve();
              return;
            }
          }

          console.log('Valid invitation found - returning details');

          // Return invitation details (READ-ONLY - no database changes)
          res.status(200).json({
            success: true,
            invitation: {
              groupName: invitationData?.groupName,
              inviterName: invitationData?.inviterName,
              clubId: invitationData?.clubId,
              groupId: invitationData?.groupId,
              email: invitationData?.email,
              status: invitationData?.status
            }
          });

        } catch (error) {
          console.error('Error processing invitation:', error);
          res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
          });
        }
        resolve();
      });
    });
  }
);
