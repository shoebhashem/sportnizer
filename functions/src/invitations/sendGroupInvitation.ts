import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GroupInvitationRequest, InvitationResult } from '../types/interfaces';
import { config } from '../utils/config';
import { emailTransporter, groupInvitationTemplate } from '../utils/email';
import { validateArrayField, validateRequiredFields } from '../utils/validation';

export const sendGroupInvitation = onCall(
  {
    region: config.region,
  },
  async (request) => {
    try {
      const { emails, clubId, groupId, groupName, inviterName }: GroupInvitationRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['emails', 'clubId', 'groupId', 'groupName', 'inviterName']);
      validateArrayField(emails, 'emails');

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const results: InvitationResult[] = [];

      for (const email of emails) {
        try {
          // Generate a unique invitation token
          const invitationToken = admin.firestore().collection('invitations').doc().id;
          
          // Store invitation details in Firestore
          await admin.firestore().collection('invitations').doc(invitationToken).set({
            email: email.trim().toLowerCase(),
            clubId,
            groupId,
            groupName,
            inviterName,
            inviterUid: request.auth.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            used: false,
            status: 'pending',
          });

          // Create invitation link
          const invitationLink = `${config.baseUrl}/login?invite=${invitationToken}`;

          // Send email
          const mailOptions = {
            from: config.email.from,
            to: email,
            subject: `Invitation to join ${groupName} on Sportnizer`,
            html: groupInvitationTemplate(groupName, inviterName, invitationLink),
          };

          await emailTransporter.sendMail(mailOptions);
          
          results.push({
            email,
            success: true,
            invitationToken,
          });

        } catch (error) {
          console.error(`Error sending invitation to ${email}:`, error);
          results.push({
            email,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return {
        success: true,
        results,
      };

    } catch (error) {
      console.error('Error in sendGroupInvitation:', error);
      throw new HttpsError('internal', 'Failed to send invitations');
    }
  }
);
