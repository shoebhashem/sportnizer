import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { CreateUserAccountRequest, CreateUserAccountResponse } from '../types/interfaces';
import { config } from '../utils/config';
import { emailTransporter, emailVerificationTemplate } from '../utils/email';
import { cleanupExpiredTokens } from '../utils/userManagement';
import { validateRequiredFields } from '../utils/validation';

export const createUserAccount = onCall(
  {
    region: config.region,
  },
  async (request): Promise<CreateUserAccountResponse> => {
    try {
      const { email, fullName, uid }: CreateUserAccountRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['email', 'fullName', 'uid']);

      // Verify the user is authenticated and matches the provided UID
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      if (request.auth.uid !== uid) {
        throw new HttpsError('permission-denied', 'UID mismatch');
      }

      console.log(`Creating user account for ${email} (${uid})`);

      const db = admin.firestore();

      // Check if user document already exists
      const userDoc = await db.collection('users').doc(uid).get();
      if (userDoc.exists) {
        throw new HttpsError('already-exists', 'User account already exists');
      }

      const DEFAULT_PROFILE_PICTURE = 'https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fadult_profile_icon.png?alt=media';

      // Create user profile document according to ARCHITECTURE.md
      const userProfile = {
        uid: uid,
        email: email.toLowerCase().trim(),
        displayName: fullName.trim(),
        version: 1, // Start with version 1 as per ARCHITECTURE.md
        photoURL: DEFAULT_PROFILE_PICTURE,
        phoneNumber: null, // Initially null, can be updated later
        dateOfBirth: null, // Initially null, can be updated later
        clubAccess: [], // Empty array - users join clubs later
        groupsCreated: 0,
        emailVerified: false,
        verificationStatus: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Save user profile to Firestore
      await db.collection('users').doc(uid).set(userProfile);

      console.log(`User profile created for ${uid}, now sending verification email...`);

      // Send email verification - call the email logic directly
      try {
        // Cleanup expired verification tokens first
        await cleanupExpiredTokens('emailVerifications', uid);

        // Generate verification token
        const verificationToken = admin.firestore().collection('emailVerifications').doc().id;
        const expirationDate = new Date();
        expirationDate.setHours(expirationDate.getHours() + 24); // 24 hours expiry

        // Save verification token to Firestore
        await db.collection('emailVerifications').doc(verificationToken).set({
          uid: uid,
          email: email.toLowerCase().trim(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: expirationDate,
          verified: false,
        });

        // Send verification email
        const verificationLink = `${config.cloudFunctionUrls.verifyEmail}?token=${verificationToken}`;
        
        const mailOptions = {
          from: process.env.EMAIL_FROM || 'noreply@sportnizer.com',
          to: email.toLowerCase().trim(),
          subject: 'Verify Your Sportnizer Account',
          html: emailVerificationTemplate(fullName.trim(), verificationLink),
        };

        await emailTransporter.sendMail(mailOptions);
        console.log(`Verification email sent successfully to: ${email}`);
        
      } catch (emailError) {
        console.error('Error sending verification email:', emailError);
        // Don't throw error here - user account was created successfully
        // They can resend verification email later if needed
      }

      console.log(`Successfully created user account for ${uid}`);

      return {
        success: true,
        message: 'Account created successfully! Please check your email inbox and click the verification link to activate your account. You must verify your email before you can sign in.'
      };

    } catch (error) {
      console.error('Error in createUserAccount:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to create user account');
    }
  }
);
