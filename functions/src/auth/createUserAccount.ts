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
      const { email, fullName, uid, invitationToken }: CreateUserAccountRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['email', 'fullName', 'uid']);

      // Check if user is invited
      const isInvitedUser = !!invitationToken;

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
        emailVerified: isInvitedUser, // Skip verification for invited users
        verificationStatus: isInvitedUser ? 'verified' : 'pending', // Pre-verify invited users
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Save user profile to Firestore
      await db.collection('users').doc(uid).set(userProfile);

      console.log(`User profile created for ${uid}, processing email verification...`);

      // Handle email verification based on invitation status
      if (isInvitedUser) {
        console.log('User is invited - skipping email verification');
        
        // Process the invitation if token is provided
        if (invitationToken) {
          try {
            console.log(`Processing invitation with token: ${invitationToken}`);
            
            // Get invitation document
            const invitationDoc = await db.collection('invitations').doc(invitationToken).get();
            
            if (!invitationDoc.exists) {
              console.error('Invitation not found');
              throw new HttpsError('not-found', 'Invitation not found or has expired');
            }
            
            const invitation = invitationDoc.data();
            
            // Verify email matches invitation
            if (invitation?.email?.toLowerCase() !== email.toLowerCase()) {
              console.error('Email mismatch in invitation');
              throw new HttpsError('permission-denied', 'Email address does not match the invitation');
            }
            
            // Check if invitation is already used
            if (invitation?.used) {
              console.error('Invitation already used');
              throw new HttpsError('permission-denied', 'This invitation has already been used');
            }
            
            // Mark invitation as used
            await invitationDoc.ref.update({
              used: true,
              usedAt: admin.firestore.FieldValue.serverTimestamp(),
              usedBy: uid,
              status: 'accepted'
            });
            
            // Add user to the club/group using atomic functions
            if (invitation.clubId && invitation.groupId) {
              console.log(`Adding user ${uid} to club ${invitation.clubId} and group ${invitation.groupId} via atomic functions`);
              
              try {
                // Prepare member data for the atomic functions
                const memberData = {
                  userId: uid,
                  name: fullName.trim(),
                  email: email.toLowerCase().trim(),
                  roles: invitation.roles || ['member'], // Default to 'member' role if not specified
                  addedBy: invitation.invitedBy,
                  joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                  profilePictureUrl: DEFAULT_PROFILE_PICTURE
                };
                
                const clubInfo = {
                  clubId: invitation.clubId,
                  clubName: invitation.clubName || 'Unknown Club', // Should be available in invitation
                  joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                  role: invitation.roles?.[0] || 'member'
                };
                
                const groupInfo = {
                  groupId: invitation.groupId,
                  groupName: invitation.groupName || 'Unknown Group', // Should be available in invitation
                  joinedAt: admin.firestore.FieldValue.serverTimestamp()
                };
                
                // Call atomic functions in sequence
                
                // 1. Add member to club
                console.log('Calling addMemberToClub atomic function...');
                const addMemberToClubFunction = require('../members/addMemberToClub').addMemberToClub;
                const clubResult = await addMemberToClubFunction.run({
                  auth: { uid: invitation.invitedBy },
                  data: {
                    clubId: invitation.clubId,
                    memberData
                  }
                });
                
                if (!clubResult.success) {
                  throw new Error(`Failed to add member to club: ${clubResult.error}`);
                }
                console.log('✅ Member added to club successfully');
                
                // 2. Add member to group
                console.log('Calling addMemberToGroup atomic function...');
                const addMemberToGroupFunction = require('../members/addMemberToGroup').addMemberToGroup;
                const groupResult = await addMemberToGroupFunction.run({
                  auth: { uid: invitation.invitedBy },
                  data: {
                    clubId: invitation.clubId,
                    groupId: invitation.groupId,
                    memberData
                  }
                });
                
                if (!groupResult.success) {
                  throw new Error(`Failed to add member to group: ${groupResult.error}`);
                }
                console.log('✅ Member added to group successfully');
                
                // 3. Update user club info
                console.log('Calling updateUserClubInfo atomic function...');
                const updateUserClubInfoFunction = require('../members/updateUserClubInfo').updateUserClubInfo;
                const userClubResult = await updateUserClubInfoFunction.run({
                  auth: { uid: invitation.invitedBy },
                  data: {
                    uid,
                    clubInfo,
                    role: invitation.roles?.[0] || 'member'
                  }
                });
                
                if (!userClubResult.success) {
                  throw new Error(`Failed to update user club info: ${userClubResult.error}`);
                }
                console.log('✅ User club info updated successfully');
                
                // 4. Update user group info
                console.log('Calling updateUserGroupInfo atomic function...');
                const updateUserGroupInfoFunction = require('../members/updateUserGroupInfo').updateUserGroupInfo;
                const userGroupResult = await updateUserGroupInfoFunction.run({
                  auth: { uid: invitation.invitedBy },
                  data: {
                    uid,
                    clubId: invitation.clubId,
                    groupInfo,
                    roles: invitation.roles || ['member'],
                    operation: 'add'
                  }
                });
                
                if (!userGroupResult.success) {
                  throw new Error(`Failed to update user group info: ${userGroupResult.error}`);
                }
                console.log('✅ User group info updated successfully');
                
                console.log(`✅ User ${uid} successfully added to club ${invitation.clubId} and group ${invitation.groupId} via atomic functions`);
                
              } catch (atomicFunctionError) {
                console.error('Error calling atomic functions:', atomicFunctionError);
                // Don't fail the account creation, but log the error for investigation
                const errorMessage = atomicFunctionError instanceof Error ? atomicFunctionError.message : String(atomicFunctionError);
                console.warn(`⚠️ Account created successfully for ${uid}, but failed to add to club/group via atomic functions: ${errorMessage}`);
              }
            }
            
            console.log(`Invitation processed successfully for ${uid}`);
          } catch (invitationError) {
            console.error('Error processing invitation:', invitationError);
            // Don't fail the account creation if invitation processing fails
            // The user account is still valid, they just won't be added to the group
          }
        }
      } else {
        // Send email verification for regular users
        console.log('Regular user - sending email verification');
      
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
