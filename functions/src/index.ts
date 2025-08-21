import * as admin from 'firebase-admin';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import * as nodemailer from 'nodemailer';

admin.initializeApp();

// Initialize Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.strato.com',
  port: 587,
  secure: false, // false for 587, true for 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export const sendGroupInvitation = onCall(
  {
    region: 'europe-north1',
  },
  async (request) => {
    try {
      const { emails, groupId, groupName, inviterName } = request.data;

      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        throw new HttpsError('invalid-argument', 'Emails array is required');
      }

      if (!groupId || !groupName || !inviterName) {
        throw new HttpsError('invalid-argument', 'Group ID, group name, and inviter name are required');
      }

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const results = [];

      for (const email of emails) {
        try {
          // Generate a unique invitation token
          const invitationToken = admin.firestore().collection('invitations').doc().id;
          
          // Store invitation details in Firestore
          await admin.firestore().collection('invitations').doc(invitationToken).set({
            email: email.trim().toLowerCase(),
            groupId,
            groupName,
            inviterName,
            inviterUid: request.auth.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            used: false,
          });

          // Create invitation link
          const baseUrl = process.env.BASE_URL || 'http://localhost:8081';
          const invitationLink = `${baseUrl}/login?invite=${invitationToken}`;

          // Send email
          const mailOptions = {
            from: 'noreply@sportnizer.com',
            to: email,
            subject: `Invitation to join ${groupName} on Sportnizer`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">You're invited to join ${groupName}!</h2>
                <p>Hi there,</p>
                <p><strong>${inviterName}</strong> has invited you to join <strong>${groupName}</strong> on Sportnizer.</p>
                <p>Sportnizer helps you manage your sports groups, track events, and stay connected with your teammates.</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${invitationLink}" style="background-color: #007AFF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Join ${groupName}</a>
                </div>
                <p>If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #666;">${invitationLink}</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #888; font-size: 12px;">This invitation was sent by ${inviterName}. If you didn't expect this invitation, you can safely ignore this email.</p>
              </div>
            `,
          };

          await transporter.sendMail(mailOptions);
          
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

export const processInvitation = onRequest(
  {
    region: 'europe-north1',
    cors: true,
  },
  async (req, res) => {
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(200).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    try {
      const { invitationToken, userEmail } = req.body;

      if (!invitationToken || !userEmail) {
        res.status(400).json({ 
          success: false, 
          error: 'Invitation token and user email are required' 
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

      if (!invitationData) {
        res.status(404).json({ 
          success: false, 
          error: 'Invalid invitation data' 
        });
        return;
      }

      // Check if invitation has already been used
      if (invitationData.used) {
        res.status(400).json({ 
          success: false, 
          error: 'This invitation has already been used' 
        });
        return;
      }

      // Verify email matches
      if (invitationData.email !== userEmail.trim().toLowerCase()) {
        res.status(400).json({ 
          success: false, 
          error: 'Email does not match the invitation' 
        });
        return;
      }

      // Find user by email
      const userRecord = await admin.auth().getUserByEmail(userEmail);
      
      if (!userRecord) {
        res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
        return;
      }

      // Add user to the group
      const groupRef = admin.firestore().collection('groups').doc(invitationData.groupId);
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        res.status(404).json({ 
          success: false, 
          error: 'Group not found' 
        });
        return;
      }

      // Add user to group members
      await groupRef.update({
        members: admin.firestore.FieldValue.arrayUnion(userRecord.uid),
        [`memberDetails.${userRecord.uid}`]: {
          email: userEmail,
          joinedAt: admin.firestore.FieldValue.serverTimestamp(),
          invitedBy: invitationData.inviterUid,
        }
      });

      // Mark invitation as used
      await invitationDoc.ref.update({
        used: true,
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        usedBy: userRecord.uid,
      });

      res.status(200).json({ 
        success: true, 
        message: `Successfully added to ${invitationData.groupName}` 
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
