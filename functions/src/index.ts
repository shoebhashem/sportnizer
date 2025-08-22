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
            status: 'pending', // pending, accepted, rejected
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
      console.log(`Processing invitation request - Token: ${invitationToken}, Email: ${userEmail}`);

      if (!invitationToken || !userEmail) {
        console.log('Missing required parameters');
        res.status(400).json({ 
          success: false, 
          error: 'Invitation token and user email are required' 
        });
        return;
      }

      // Get invitation details
      console.log(`Looking up invitation document: ${invitationToken}`);
      const invitationDoc = await admin.firestore()
        .collection('invitations')
        .doc(invitationToken)
        .get();

      if (!invitationDoc.exists) {
        console.log('Invitation document not found');
        res.status(404).json({ 
          success: false, 
          error: 'Invitation not found or expired' 
        });
        return;
      }

      const invitationData = invitationDoc.data();
      console.log('Invitation data found:', invitationData);

      if (!invitationData) {
        res.status(404).json({ 
          success: false, 
          error: 'Invalid invitation data' 
        });
        return;
      }

      // Check if invitation has already been used
      if (invitationData.used) {
        console.log('Invitation already used');
        res.status(400).json({ 
          success: false, 
          error: 'This invitation has already been used' 
        });
        return;
      }

      // Verify email matches
      console.log(`Verifying email match - Invitation: ${invitationData.email}, User: ${userEmail.trim().toLowerCase()}`);
      if (invitationData.email !== userEmail.trim().toLowerCase()) {
        console.log('Email mismatch');
        res.status(400).json({ 
          success: false, 
          error: 'Email does not match the invitation' 
        });
        return;
      }

      // Find user by email
      console.log(`Looking up user by email: ${userEmail}`);
      const userRecord = await admin.auth().getUserByEmail(userEmail);
      console.log(`User found: ${userRecord.uid}`);
      
      if (!userRecord) {
        console.log('User not found in Firebase Auth');
        res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
        return;
      }

      // Add user to the group
      console.log(`Adding user ${userRecord.uid} to group ${invitationData.groupId}`);
      const groupRef = admin.firestore().collection('groups').doc(invitationData.groupId);
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        console.log('Group not found');
        res.status(404).json({ 
          success: false, 
          error: 'Group not found' 
        });
        return;
      }

      // Add user to group members and update user profile
      console.log('Updating group with new member and user profile');
      
      const batch = admin.firestore().batch();

      // Add user to group members
      batch.update(groupRef, {
        members: admin.firestore.FieldValue.arrayUnion(userRecord.uid),
        [`memberDetails.${userRecord.uid}`]: {
          email: userEmail.trim().toLowerCase(),
          joinedAt: admin.firestore.FieldValue.serverTimestamp(),
          invitedBy: invitationData.inviterUid,
          role: 'member',
        }
      });

      // Add group to user's profile
      const userRef = admin.firestore().collection('users').doc(userRecord.uid);
      batch.set(userRef, {
        groups: admin.firestore.FieldValue.arrayUnion(invitationData.groupId),
        [`groupDetails.${invitationData.groupId}`]: {
          name: invitationData.groupName,
          joinedAt: admin.firestore.FieldValue.serverTimestamp(),
          role: 'member',
        }
      }, { merge: true });

      // Mark invitation as used
      batch.update(invitationDoc.ref, {
        used: true,
        status: 'accepted',
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        usedBy: userRecord.uid,
      });

      // Execute all updates
      await batch.commit();
      console.log('All updates completed successfully');

      // Clean up invitation after successful processing
      setTimeout(async () => {
        try {
          await invitationDoc.ref.delete();
          console.log('Invitation cleaned up');
        } catch (cleanupError) {
          console.error('Error cleaning up invitation:', cleanupError);
        }
      }, 5000); // 5 second delay

      console.log(`Successfully added user to group: ${invitationData.groupName}`);
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

export const respondToInvitation = onRequest(
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
      const { invitationToken, userEmail, action } = req.body; // action: 'accept' or 'reject'
      console.log(`Processing invitation response - Token: ${invitationToken}, Email: ${userEmail}, Action: ${action}`);

      if (!invitationToken || !userEmail || !action) {
        console.log('Missing required parameters');
        res.status(400).json({ 
          success: false, 
          error: 'Invitation token, user email, and action are required' 
        });
        return;
      }

      if (action !== 'accept' && action !== 'reject') {
        console.log('Invalid action');
        res.status(400).json({ 
          success: false, 
          error: 'Action must be "accept" or "reject"' 
        });
        return;
      }

      // Get invitation details
      console.log(`Looking up invitation document: ${invitationToken}`);
      const invitationDoc = await admin.firestore()
        .collection('invitations')
        .doc(invitationToken)
        .get();

      if (!invitationDoc.exists) {
        console.log('Invitation document not found');
        res.status(404).json({ 
          success: false, 
          error: 'Invitation not found or expired' 
        });
        return;
      }

      const invitationData = invitationDoc.data();
      console.log('Invitation data found:', invitationData);

      if (!invitationData) {
        res.status(404).json({ 
          success: false, 
          error: 'Invalid invitation data' 
        });
        return;
      }

      // Check if invitation has already been used
      if (invitationData.used || invitationData.status !== 'pending') {
        console.log('Invitation already processed');
        res.status(400).json({ 
          success: false, 
          error: 'This invitation has already been processed' 
        });
        return;
      }

      // Verify email matches
      console.log(`Verifying email match - Invitation: ${invitationData.email}, User: ${userEmail.trim().toLowerCase()}`);
      if (invitationData.email !== userEmail.trim().toLowerCase()) {
        console.log('Email mismatch');
        res.status(400).json({ 
          success: false, 
          error: 'Email does not match the invitation' 
        });
        return;
      }

      // Find user by email
      console.log(`Looking up user by email: ${userEmail}`);
      const userRecord = await admin.auth().getUserByEmail(userEmail);
      console.log(`User found: ${userRecord.uid}`);

      if (action === 'reject') {
        // Mark invitation as rejected and delete
        console.log('Marking invitation as rejected and cleaning up');
        await invitationDoc.ref.update({
          used: true,
          status: 'rejected',
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
          usedBy: userRecord.uid,
        });

        // Delete the invitation after a short delay
        setTimeout(async () => {
          await invitationDoc.ref.delete();
        }, 1000);

        res.status(200).json({ 
          success: true, 
          message: 'Invitation rejected successfully' 
        });
        return;
      }

      // Handle accept action
      console.log(`Adding user ${userRecord.uid} to group ${invitationData.groupId}`);
      const groupRef = admin.firestore().collection('groups').doc(invitationData.groupId);
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        console.log('Group not found');
        res.status(404).json({ 
          success: false, 
          error: 'Group not found' 
        });
        return;
      }

      const batch = admin.firestore().batch();

      // Add user to group members
      console.log('Adding user to group members');
      batch.update(groupRef, {
        members: admin.firestore.FieldValue.arrayUnion(userRecord.uid),
        [`memberDetails.${userRecord.uid}`]: {
          email: userEmail.trim().toLowerCase(),
          joinedAt: admin.firestore.FieldValue.serverTimestamp(),
          invitedBy: invitationData.inviterUid,
          role: 'member',
        }
      });

      // Add group to user's groups
      console.log('Adding group to user profile');
      const userRef = admin.firestore().collection('users').doc(userRecord.uid);
      batch.set(userRef, {
        groups: admin.firestore.FieldValue.arrayUnion(invitationData.groupId),
        [`groupDetails.${invitationData.groupId}`]: {
          name: invitationData.groupName,
          joinedAt: admin.firestore.FieldValue.serverTimestamp(),
          role: 'member',
        }
      }, { merge: true });

      // Mark invitation as accepted
      console.log('Marking invitation as accepted');
      batch.update(invitationDoc.ref, {
        used: true,
        status: 'accepted',
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        usedBy: userRecord.uid,
      });

      // Execute all updates
      await batch.commit();
      console.log('All updates completed successfully');

      // Clean up invitation after successful processing
      setTimeout(async () => {
        await invitationDoc.ref.delete();
        console.log('Invitation cleaned up');
      }, 5000); // 5 second delay to ensure client gets response

      res.status(200).json({ 
        success: true, 
        message: `Successfully joined ${invitationData.groupName}!`,
        groupName: invitationData.groupName
      });

    } catch (error) {
      console.error('Error responding to invitation:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
);

export const getInvitationDetails = onRequest(
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

    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

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

      if (!invitationData) {
        res.status(404).json({ 
          success: false, 
          error: 'Invalid invitation data' 
        });
        return;
      }

      // Check if invitation is still valid
      if (invitationData.used || invitationData.status !== 'pending') {
        res.status(400).json({ 
          success: false, 
          error: 'This invitation has already been processed' 
        });
        return;
      }

      res.status(200).json({ 
        success: true, 
        invitation: {
          groupName: invitationData.groupName,
          inviterName: invitationData.inviterName,
          email: invitationData.email,
          createdAt: invitationData.createdAt,
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
