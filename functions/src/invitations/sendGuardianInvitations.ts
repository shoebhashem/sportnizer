import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { InvitationResult, SendGuardianInvitationsRequest } from '../types/interfaces';
import { config } from '../utils/config';
import { emailTransporter, guardianInvitationTemplate } from '../utils/email';
import { validateArrayField, validateRequiredFields } from '../utils/validation';

export const sendGuardianInvitations = onCall(
  {
    region: config.region,
  },
  async (request) => {
    try {
      const { groupId, selectedMemberIds, guardianEmails }: SendGuardianInvitationsRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['groupId', 'selectedMemberIds', 'guardianEmails']);
      validateArrayField(selectedMemberIds, 'selectedMemberIds');
      validateArrayField(guardianEmails, 'guardianEmails');

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // Get group details
      const groupDoc = await admin.firestore().collection('groups').doc(groupId).get();
      if (!groupDoc.exists) {
        throw new HttpsError('not-found', 'Group not found');
      }

      const groupData = groupDoc.data();
      const groupName = groupData?.name || 'Unknown Group';

      // Get inviter details
      const inviterDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
      const inviterName = inviterDoc.exists ? inviterDoc.data()?.name || 'Unknown' : 'Unknown';

      const results: InvitationResult[] = [];
      const batch = admin.firestore().batch();

      for (const memberId of selectedMemberIds) {
        try {
          // Get member details
          const memberDoc = await admin.firestore()
            .collection('groups')
            .doc(groupId)
            .collection('members')
            .doc(memberId)
            .get();

          if (!memberDoc.exists) {
            results.push({
              memberId,
              success: false,
              error: 'Member not found',
            });
            continue;
          }

          const memberData = memberDoc.data();
          const memberName = memberData?.name || 'Unknown Member';

          // Generate unique invitation token
          const invitationToken = admin.firestore().collection('guardianInvitations').doc().id;
          
          // Store invitation details in Firestore
          const invitationData = {
            groupId,
            groupName,
            memberId,
            memberName,
            memberBirthDate: memberData?.birthDate || null,
            guardianEmails: guardianEmails.map((email: string) => email.trim().toLowerCase()),
            inviterUid: request.auth.uid,
            inviterName,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + config.expiration.guardianInvitation),
            status: 'pending',
            used: false,
          };

          await admin.firestore().collection('guardianInvitations').doc(invitationToken).set(invitationData);

          // Update member with invitation token
          batch.update(admin.firestore()
            .collection('groups')
            .doc(groupId)
            .collection('members')
            .doc(memberId), {
            invitationToken,
            guardianEmails: guardianEmails.map((email: string) => email.trim().toLowerCase()),
          });

          // Create invitation link
          const invitationLink = `${config.baseUrl}/guardian-invite?token=${invitationToken}`;

          // Send email to each guardian
          for (const guardianEmail of guardianEmails) {
            const mailOptions = {
              from: config.email.from,
              to: guardianEmail.trim(),
              subject: `Confirm ${memberName}'s participation in ${groupName}`,
              html: guardianInvitationTemplate(memberName, groupName, inviterName, invitationLink),
            };

            await emailTransporter.sendMail(mailOptions);
          }
          
          results.push({
            memberId,
            memberName,
            success: true,
            invitationToken,
            guardianEmails,
          });

        } catch (error) {
          console.error(`Error sending guardian invitation for member ${memberId}:`, error);
          results.push({
            memberId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Execute batch updates
      await batch.commit();

      return {
        success: true,
        results,
      };

    } catch (error) {
      console.error('Error in sendGuardianInvitations:', error);
      throw new HttpsError('internal', 'Failed to send guardian invitations');
    }
  }
);
