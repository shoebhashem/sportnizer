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

      // Add user to group members subcollection (new structure)
      const memberRef = admin.firestore().collection('groups').doc(invitationData.groupId).collection('members').doc(userRecord.uid);
      batch.set(memberRef, {
        role: 'member',
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        invitedBy: invitationData.inviterUid,
      });

      // Update group member count
      batch.update(groupRef, {
        membersCount: admin.firestore.FieldValue.increment(1)
      });

      // Add group to user's profile
      const userRef = admin.firestore().collection('users').doc(userRecord.uid);
      batch.set(userRef, {
        groupsJoined: admin.firestore.FieldValue.arrayUnion(invitationData.groupId),
      }, { merge: true });
      
      console.log(`Added group ${invitationData.groupId} to user ${userRecord.uid} groupsJoined array`);

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

      // Check if invitation has expired (if expiration is set)
      if (invitationData.expiresAt) {
        const now = new Date();
        const expiresAt = invitationData.expiresAt.toDate();
        if (now > expiresAt) {
          res.status(400).json({ 
            success: false, 
            error: 'This invitation has expired' 
          });
          return;
        }
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
      let userRecord;
      try {
        userRecord = await admin.auth().getUserByEmail(userEmail);
        console.log(`User found: ${userRecord.uid}`);
      } catch (authError: any) {
        console.log('User not found in Auth:', authError?.message || authError);
        res.status(404).json({ 
          success: false, 
          error: 'User account not found. Please create an account first or sign in with the correct email address.' 
        });
        return;
      }

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

      // Add user to group members subcollection (new structure)
      console.log('Adding user to group members subcollection');
      const memberRef = admin.firestore().collection('groups').doc(invitationData.groupId).collection('members').doc(userRecord.uid);
      batch.set(memberRef, {
        role: 'member',
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        invitedBy: invitationData.inviterUid,
      });

      // Update group member count
      batch.update(groupRef, {
        membersCount: admin.firestore.FieldValue.increment(1)
      });

      // Add group to user's groups using new GroupMembership structure
      console.log('Adding group to user profile with new schema');
      const userRef = admin.firestore().collection('users').doc(userRecord.uid);
      const userDoc = await userRef.get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        const currentGroupsJoined = userData?.groupsJoined || [];
        
        // Check if it's old string array or new GroupMembership structure
        if (currentGroupsJoined.length > 0 && typeof currentGroupsJoined[0] === 'object') {
          // New GroupMembership structure - check if group already exists
          const existingMembership = currentGroupsJoined.find((membership: any) => membership.groupId === invitationData.groupId);
          if (!existingMembership) {
            const newMembership = {
              groupId: invitationData.groupId,
              roles: ['member'],
              joinedAt: new Date(),
              status: 'active'
            };
            batch.update(userRef, {
              groupsJoined: admin.firestore.FieldValue.arrayUnion(newMembership),
            });
          }
        } else {
          // Old string array structure or mixed - convert to new structure
          const newMembership = {
            groupId: invitationData.groupId,
            roles: ['member'],
            joinedAt: new Date(),
            status: 'active'
          };
          batch.update(userRef, {
            groupsJoined: admin.firestore.FieldValue.arrayUnion(newMembership),
          });
        }
      } else {
        // User exists in Auth but not in Firestore, create the document
        batch.set(userRef, {
          name: userRecord.displayName || userRecord.email?.split('@')[0] || 'User',
          email: userRecord.email?.toLowerCase(),
          emailVerified: userRecord.emailVerified || false,
          groupsJoined: [{
            groupId: invitationData.groupId,
            roles: ['member'],
            joinedAt: new Date(),
            status: 'active'
          }],
          eventsInvited: [], // Initialize empty array for event tracking
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log('Created Firestore document for existing Auth user');
      }
      
      console.log(`Added group ${invitationData.groupId} to user ${userRecord.uid} using new GroupMembership structure`);

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

// Custom Email Verification Functions
export const sendEmailVerification = onCall(
  {
    region: 'europe-north1',
  },
  async (request) => {
    try {
      const { email, uid, fullName } = request.data;

      if (!email || !uid || !fullName) {
        throw new HttpsError('invalid-argument', 'Email, UID, and full name are required');
      }

      // Clean up any existing unverified tokens for this user (to prevent spam/duplicates)
      const existingTokensQuery = await admin.firestore()
        .collection('emailVerifications')
        .where('uid', '==', uid)
        .where('verified', '==', false)
        .get();
      
      const batch = admin.firestore().batch();
      existingTokensQuery.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      if (!existingTokensQuery.empty) {
        await batch.commit();
        console.log(`Cleaned up ${existingTokensQuery.docs.length} existing unverified tokens for user:`, uid);
      }

      // Generate verification token
      const verificationToken = admin.firestore().collection('emailVerifications').doc().id;
      
      // Store verification token with expiry (24 hours)
      await admin.firestore().collection('emailVerifications').doc(verificationToken).set({
        uid,
        email: email.toLowerCase(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        verified: false,
      });

      // Create verification link - point directly to Firebase Function
      const verificationLink = `https://europe-north1-sportnizer.cloudfunctions.net/verifyEmail?token=${verificationToken}`;

      const mailOptions = {
        from: 'noreply@sportnizer.com',
        to: email,
        subject: 'Verify Your Sportnizer Account',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #007AFF; margin: 0; font-size: 28px;">Sportnizer</h1>
            </div>
            
            <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h2 style="color: #333; margin-bottom: 20px;">Welcome ${fullName}!</h2>
              
              <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 25px;">
                Thank you for signing up for Sportnizer! To complete your registration and start using the app, 
                please verify your email address by clicking the button below.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationLink}" 
                   style="background-color: #007AFF; color: white; padding: 15px 30px; text-decoration: none; 
                          border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
                  Verify Your Email
                </a>
              </div>
              
              <p style="color: #999; font-size: 14px; margin-top: 25px;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${verificationLink}" style="color: #007AFF; word-break: break-all;">${verificationLink}</a>
              </p>
              
              <p style="color: #999; font-size: 12px; margin-top: 25px;">
                This verification link will expire in 24 hours. If you didn't create an account with Sportnizer, 
                please ignore this email.
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
              <p style="color: #999; font-size: 12px;">© 2025 Sportnizer. All rights reserved.</p>
            </div>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log('Verification email sent successfully to:', email);

      return { 
        success: true, 
        message: 'Verification email sent successfully! Please check your inbox.' 
      };

    } catch (error: any) {
      console.error('Error sending verification email:', error);
      throw new HttpsError('internal', 'Failed to send verification email');
    }
  }
);

// Resend verification email function
export const resendVerificationEmail = onCall(
  {
    region: 'europe-north1',
  },
  async (request) => {
    try {
      const { email } = request.data;

      if (!email) {
        throw new HttpsError('invalid-argument', 'Email is required');
      }

      // Find user by email in Firestore
      const usersQuery = await admin.firestore()
        .collection('users')
        .where('email', '==', email.toLowerCase())
        .limit(1)
        .get();

      if (usersQuery.empty) {
        throw new HttpsError('not-found', 'No account found with this email address');
      }

      const userDoc = usersQuery.docs[0];
      const userData = userDoc.data();
      const uid = userDoc.id;

      // Check if email is already verified
      if (userData.emailVerified) {
        throw new HttpsError('already-exists', 'This email address is already verified');
      }

      // Clean up any existing unverified tokens for this user
      const existingTokensQuery = await admin.firestore()
        .collection('emailVerifications')
        .where('uid', '==', uid)
        .where('verified', '==', false)
        .get();
      
      const batch = admin.firestore().batch();
      existingTokensQuery.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      if (!existingTokensQuery.empty) {
        await batch.commit();
        console.log(`Cleaned up ${existingTokensQuery.docs.length} existing tokens for resend`);
      }

      // Generate new verification token
      const verificationToken = admin.firestore().collection('emailVerifications').doc().id;
      
      // Store verification token with expiry (24 hours)
      await admin.firestore().collection('emailVerifications').doc(verificationToken).set({
        uid,
        email: email.toLowerCase(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        verified: false,
      });

      // Create verification link
      const verificationLink = `https://europe-north1-sportnizer.cloudfunctions.net/verifyEmail?token=${verificationToken}`;

      const mailOptions = {
        from: 'noreply@sportnizer.com',
        to: email,
        subject: 'Verify Your Sportnizer Account - Resent',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #007AFF; margin: 0; font-size: 28px;">Sportnizer</h1>
            </div>
            
            <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h2 style="color: #333; margin-bottom: 20px;">Verify Your Email - Resent</h2>
              
              <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 25px;">
                You requested a new verification email for your Sportnizer account. 
                Please click the button below to verify your email address and activate your account.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationLink}" 
                   style="background-color: #007AFF; color: white; padding: 15px 30px; text-decoration: none; 
                          border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
                  Verify Your Email
                </a>
              </div>
              
              <p style="color: #999; font-size: 14px; margin-top: 25px;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${verificationLink}" style="color: #007AFF; word-break: break-all;">${verificationLink}</a>
              </p>
              
              <p style="color: #999; font-size: 12px; margin-top: 25px;">
                This verification link will expire in 24 hours. If you didn't request this email, 
                please ignore it.
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
              <p style="color: #999; font-size: 12px;">© 2025 Sportnizer. All rights reserved.</p>
            </div>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log('Verification email resent successfully to:', email);

      return { 
        success: true, 
        message: 'Verification email sent successfully! Please check your inbox.' 
      };

    } catch (error: any) {
      console.error('Error resending verification email:', error);
      throw new HttpsError('internal', 'Failed to resend verification email');
    }
  }
);

export const verifyEmail = onRequest(
  {
    region: 'europe-north1',
  },
  async (req, res) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Invalid verification token'
        });
        return;
      }

      // Get verification document
      const verificationDoc = await admin.firestore()
        .collection('emailVerifications')
        .doc(token)
        .get();

      if (!verificationDoc.exists) {
        res.status(400).json({
          success: false,
          error: 'Invalid or expired verification token'
        });
        return;
      }

      const verificationData = verificationDoc.data();
      
      // Check if already verified
      if (verificationData?.verified) {
        // Redirect to success page (signup screen)
        const baseUrl = process.env.BASE_URL || 'http://localhost:8081';
        res.redirect(`${baseUrl}/signup?verified=already`);
        return;
      }

      // Check if expired
      const now = new Date();
      const expiresAt = verificationData?.expiresAt?.toDate();
      
      if (expiresAt && now > expiresAt) {
        // Clean up expired token
        await admin.firestore()
          .collection('emailVerifications')
          .doc(token)
          .delete();
          
        res.status(400).json({
          success: false,
          error: 'Verification token has expired'
        });
        return;
      }

      // Update user document to mark email as verified
      await admin.firestore()
        .collection('users')
        .doc(verificationData?.uid)
        .update({
          emailVerified: true,
          verifiedAt: admin.firestore.FieldValue.serverTimestamp()
        });

      // Mark verification as used
      await admin.firestore()
        .collection('emailVerifications')
        .doc(token)
        .update({
          verified: true,
          verifiedAt: admin.firestore.FieldValue.serverTimestamp()
        });

      // Clean up verification document after successful verification
      await admin.firestore()
        .collection('emailVerifications')
        .doc(token)
        .delete();

      console.log('Email verified successfully for user:', verificationData?.uid);

      // Redirect to success page (signup screen with success message)
      const baseUrl = process.env.BASE_URL || 'http://localhost:8081';
      res.redirect(`${baseUrl}/signup?verified=success`);

    } catch (error: any) {
      console.error('Error verifying email:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during email verification'
      });
    }
  }
);

// Guardian Invitation System
export const sendGuardianInvitations = onCall(
  {
    region: 'europe-north1',
  },
  async (request) => {
    try {
      const { groupId, selectedMemberIds, guardianEmails } = request.data;

      if (!groupId || !selectedMemberIds || !Array.isArray(selectedMemberIds) || selectedMemberIds.length === 0) {
        throw new HttpsError('invalid-argument', 'Group ID and selected member IDs are required');
      }

      if (!guardianEmails || !Array.isArray(guardianEmails) || guardianEmails.length === 0) {
        throw new HttpsError('invalid-argument', 'Guardian emails are required');
      }

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

      const results = [];
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
            expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
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
          const baseUrl = process.env.BASE_URL || 'http://localhost:8081';
          const invitationLink = `${baseUrl}/guardian-invite?token=${invitationToken}`;

          // Send email to each guardian
          for (const guardianEmail of guardianEmails) {
            const mailOptions = {
              from: 'noreply@sportnizer.com',
              to: guardianEmail.trim(),
              subject: `Confirm ${memberName}'s participation in ${groupName}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                  <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #007AFF; margin: 0; font-size: 28px;">Sportnizer</h1>
                  </div>
                  
                  <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h2 style="color: #333; margin-bottom: 20px;">Guardian Confirmation Required</h2>
                    
                    <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                      <strong>${inviterName}</strong> has added <strong>${memberName}</strong> to the group <strong>${groupName}</strong> and needs your confirmation as their guardian.
                    </p>
                    
                    <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 25px;">
                      Sportnizer helps sports groups manage events, track attendance, and stay connected. As ${memberName}'s guardian, you'll be able to:
                    </p>
                    
                    <ul style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 25px;">
                      <li>Receive event invitations on behalf of ${memberName}</li>
                      <li>Accept or decline participation in activities</li>
                      <li>Stay updated with group announcements</li>
                      <li>View ${memberName}'s schedule and activities</li>
                    </ul>
                    
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${invitationLink}" style="background-color: #007AFF; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">
                        Confirm ${memberName}'s Participation
                      </a>
                    </div>
                    
                    <p style="color: #999; font-size: 14px; margin-top: 25px;">
                      If the button doesn't work, copy and paste this link into your browser:<br>
                      <a href="${invitationLink}" style="color: #007AFF; word-break: break-all;">${invitationLink}</a>
                    </p>
                    
                    <p style="color: #999; font-size: 12px; margin-top: 25px;">
                      This invitation will expire in 14 days. If you don't recognize this group or child, you can safely ignore this email.
                    </p>
                  </div>
                  
                  <div style="text-align: center; margin-top: 20px;">
                    <p style="color: #999; font-size: 12px;">© 2025 Sportnizer. All rights reserved.</p>
                  </div>
                </div>
              `,
            };

            await transporter.sendMail(mailOptions);
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

export const processGuardianInvitation = onRequest(
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
      const { invitationToken, guardianEmail, guardianName, guardianPhone, relationship } = req.body;
      console.log(`Processing guardian invitation - Token: ${invitationToken}, Email: ${guardianEmail}`);

      if (!invitationToken || !guardianEmail || !guardianName || !relationship) {
        console.log('Missing required parameters');
        res.status(400).json({ 
          success: false, 
          error: 'Invitation token, guardian email, name, and relationship are required' 
        });
        return;
      }

      // Get invitation details
      const invitationDoc = await admin.firestore()
        .collection('guardianInvitations')
        .doc(invitationToken)
        .get();

      if (!invitationDoc.exists) {
        console.log('Guardian invitation not found');
        res.status(404).json({ 
          success: false, 
          error: 'Invitation not found or expired' 
        });
        return;
      }

      const invitationData = invitationDoc.data();

      if (!invitationData || invitationData.used || invitationData.status !== 'pending') {
        console.log('Guardian invitation already processed');
        res.status(400).json({ 
          success: false, 
          error: 'This invitation has already been processed' 
        });
        return;
      }

      // Check if invitation has expired
      const now = new Date();
      const expiresAt = invitationData.expiresAt?.toDate();
      if (expiresAt && now > expiresAt) {
        res.status(400).json({ 
          success: false, 
          error: 'This invitation has expired' 
        });
        return;
      }

      // Find or create guardian user account
      let guardianUser;
      try {
        console.log('Looking up user by email:', guardianEmail.toLowerCase());
        guardianUser = await admin.auth().getUserByEmail(guardianEmail.toLowerCase());
        console.log('Found existing user:', guardianUser.uid);
        
        // Update existing user's groupsJoined array
        const existingUserRef = admin.firestore().collection('users').doc(guardianUser.uid);
        const existingUserDoc = await existingUserRef.get();
        
        if (existingUserDoc.exists) {
          const existingUserData = existingUserDoc.data();
          const currentGroups = existingUserData?.groupsJoined || [];
          
          // Check if it's old string array or new GroupMembership structure
          if (currentGroups.length > 0 && typeof currentGroups[0] === 'object') {
            // New GroupMembership structure - check if group already exists
            const existingMembership = currentGroups.find((membership: any) => membership.groupId === invitationData.groupId);
            if (!existingMembership) {
              const newMembership = {
                groupId: invitationData.groupId,
                roles: ['guardian'],
                joinedAt: new Date(),
                status: 'active'
              };
              await existingUserRef.update({
                groupsJoined: admin.firestore.FieldValue.arrayUnion(newMembership),
              });
              console.log('Updated existing user with new group using GroupMembership structure');
            }
          } else {
            // Old string array structure - convert to new structure
            const newMembership = {
              groupId: invitationData.groupId,
              roles: ['guardian'],
              joinedAt: new Date(),
              status: 'active'
            };
            await existingUserRef.update({
              groupsJoined: admin.firestore.FieldValue.arrayUnion(newMembership),
            });
            console.log('Updated existing user with new GroupMembership structure');
          }
        } else {
          // User exists in Auth but not in Firestore, create the document
          await admin.firestore().collection('users').doc(guardianUser.uid).set({
            name: guardianName,
            email: guardianEmail.toLowerCase(),
            emailVerified: guardianUser.emailVerified || false,
            groupsJoined: [{
              groupId: invitationData.groupId,
              roles: ['guardian'],
              joinedAt: new Date(),
              status: 'active'
            }],
            eventsInvited: [], // Initialize empty array for event tracking
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log('Created Firestore document for existing Auth user with new schema');
        }
      } catch (authError: any) {
        console.log('User not found in Auth, attempting to create:', authError?.message || authError);
        // User doesn't exist, create one
        try {
          guardianUser = await admin.auth().createUser({
            email: guardianEmail.toLowerCase(),
            displayName: guardianName,
          });
          console.log('Created new Auth user:', guardianUser.uid);

          // Create user document in Firestore
          await admin.firestore().collection('users').doc(guardianUser.uid).set({
            name: guardianName,
            email: guardianEmail.toLowerCase(),
            emailVerified: false, // They'll need to verify their email
            groupsJoined: [{
              groupId: invitationData.groupId,
              roles: ['guardian'],
              joinedAt: new Date(),
              status: 'active'
            }],
            eventsInvited: [], // Initialize empty array for event tracking
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log('Created Firestore document for new user with new schema');
        } catch (createError: any) {
          console.error('Error creating user:', createError);
          res.status(500).json({ 
            success: false, 
            error: `Failed to create guardian account: ${createError?.message || createError}` 
          });
          return;
        }
      }

      const batch = admin.firestore().batch();

      // Update member to confirmed status
      const memberRef = admin.firestore()
        .collection('groups')
        .doc(invitationData.groupId)
        .collection('members')
        .doc(invitationData.memberId);
      
      batch.update(memberRef, {
        isConfirmed: true,
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        confirmedBy: guardianUser.uid,
      });

      // Add guardian to member's guardians subcollection
      const guardianRef = admin.firestore()
        .collection('groups')
        .doc(invitationData.groupId)
        .collection('members')
        .doc(invitationData.memberId)
        .collection('guardians')
        .doc(guardianUser.uid);

      batch.set(guardianRef, {
        guardianUserId: guardianUser.uid,
        relationship,
        contactEmail: guardianEmail.toLowerCase(),
        contactPhone: guardianPhone || '',
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
        addedViaInvitation: invitationToken,
      });

      // Note: Guardian user's groupsJoined was already updated above when creating/updating the user

      // Mark invitation as used
      batch.update(invitationDoc.ref, {
        used: true,
        status: 'accepted',
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        usedBy: guardianUser.uid,
      });

      // Execute all updates
      await batch.commit();
      console.log('Guardian confirmation completed successfully');

      // Clean up invitation after successful processing
      setTimeout(async () => {
        try {
          await invitationDoc.ref.delete();
          console.log('Guardian invitation cleaned up');
        } catch (cleanupError) {
          console.error('Error cleaning up guardian invitation:', cleanupError);
        }
      }, 5000);

      res.status(200).json({ 
        success: true, 
        message: `Successfully confirmed ${invitationData.memberName}'s participation in ${invitationData.groupName}`,
        memberName: invitationData.memberName,
        groupName: invitationData.groupName,
        groupId: invitationData.groupId,
        memberId: invitationData.memberId
      });

    } catch (error) {
      console.error('Error processing guardian invitation:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  }
);

export const getGuardianInvitationDetails = onRequest(
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

      // Check if expired
      const now = new Date();
      const expiresAt = invitationData.expiresAt?.toDate();
      if (expiresAt && now > expiresAt) {
        res.status(400).json({ 
          success: false, 
          error: 'This invitation has expired' 
        });
        return;
      }

      res.status(200).json({ 
        success: true, 
        invitation: {
          groupId: invitationData.groupId,
          groupName: invitationData.groupName,
          memberId: invitationData.memberId,
          memberName: invitationData.memberName,
          memberBirthDate: invitationData.memberBirthDate,
          inviterName: invitationData.inviterName,
          guardianEmails: invitationData.guardianEmails,
          createdAt: invitationData.createdAt,
          expiresAt: invitationData.expiresAt,
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
