import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GroupInvitationRequest, InvitationResult } from '../types/interfaces';
import { config } from '../utils/config';
import { emailTransporter, groupInvitationWithActionsTemplate } from '../utils/email';
import { validateArrayField, validateRequiredFields } from '../utils/validation';

export const sendGroupInvitation = onCall(
  {
    region: config.region,
  },
  async (request) => {
    try {
      const { emails, clubId, clubName, groupId, groupName, inviterName }: GroupInvitationRequest = request.data;

      // Debug logging for clubName issue
      console.log('🔍 sendGroupInvitation received data:', {
        emails: emails?.length,
        clubId,
        clubName,
        clubNameType: typeof clubName,
        groupId,
        groupName,
        inviterName
      });

      // Validate required fields
      validateRequiredFields(request.data, ['emails', 'clubId', 'clubName', 'groupId', 'groupName', 'inviterName']);
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
          
          // Store invitation details in Firestore with new workflow support
          await admin.firestore().collection('invitations').doc(invitationToken).set({
            email: email.trim().toLowerCase(),
            clubId,
            clubName,
            groupId,
            groupName,
            inviterName,
            inviterUid: request.auth.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            used: false,
            status: 'pending', // 'pending', 'accepted', 'rejected'
            type: 'group_invitation', // Type to distinguish from other invitation types
            workflowVersion: '2.0', // Track new vs old invitation workflow
            respondedAt: null, // Will be set when user responds
            expiresAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)), // 7 days expiration
          });

          // Create accept and reject links with invitation token
          const acceptLink = `${config.baseUrl}/invitation/accept?token=${invitationToken}`;
          const rejectLink = `${config.baseUrl}/invitation/reject?token=${invitationToken}`;

          // Send email with accept/reject buttons
          const mailOptions = {
            from: config.email.from,
            to: email,
            subject: `Invitation to join ${groupName} on Sportnizer`,
            html: groupInvitationWithActionsTemplate(groupName, clubName, inviterName, acceptLink, rejectLink),
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
