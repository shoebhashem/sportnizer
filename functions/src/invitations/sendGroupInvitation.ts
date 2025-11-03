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
      const { emails, clubId, clubName, groupId, groupName, inviterName }: GroupInvitationRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['emails', 'clubId', 'clubName', 'groupId', 'groupName', 'inviterName']);
      validateArrayField(emails, 'emails');

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // Check if group exists and get current members
      const groupMembersRef = admin.firestore()
        .collection('clubs')
        .doc(clubId)
        .collection('groups')
        .doc(groupId)
        .collection('allMembers')
        .doc('members');
      
      const groupMembersDoc = await groupMembersRef.get();
      const currentMembers: any[] = groupMembersDoc.exists ? groupMembersDoc.data()?.members || [] : [];
      
      // Extract current member emails for comparison
      const currentMemberEmails = currentMembers.map(member => member.email?.toLowerCase()).filter(Boolean);

      const results: InvitationResult[] = [];

      for (const email of emails) {
        try {
          const normalizedEmail = email.trim().toLowerCase();
          
          // Check if email is already a member of the group
          if (currentMemberEmails.includes(normalizedEmail)) {
            console.log(`Email ${normalizedEmail} is already a member of group ${groupId}`);
            results.push({
              email,
              success: false,
              error: 'User is already a member of this group',
            });
            continue;
          }

          // Check for existing pending invitations
          const existingInvitationQuery = await admin.firestore()
            .collection('invitations')
            .where('email', '==', normalizedEmail)
            .where('groupId', '==', groupId)
            .where('status', '==', 'pending')
            .where('used', '==', false)
            .get();

          if (!existingInvitationQuery.empty) {
            console.log(`Pending invitation already exists for ${normalizedEmail} in group ${groupId}`);
            results.push({
              email,
              success: false,
              error: 'Invitation already sent to this email address',
            });
            continue;
          }

          // Generate a unique invitation token
          const invitationToken = admin.firestore().collection('invitations').doc().id;
          
          // Store invitation details in Firestore
          await admin.firestore().collection('invitations').doc(invitationToken).set({
            email: normalizedEmail,
            clubId,
            clubName,
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
            to: normalizedEmail,
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
