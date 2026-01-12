import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export interface RespondToEmailInviteRequest {
  token: string;
  action: 'accept' | 'reject';
  userInfo?: {
    email?: string;
    displayName?: string;
    phoneNumber?: string;
  };
}

export interface RespondToEmailInviteResponse {
  success: boolean;
  action: 'accepted' | 'rejected' | 'expired' | 'already_used' | 'error';
  message: string;
  redirectUrl?: string;
  requiresSignup?: boolean;
  invitationDetails?: {
    groupName: string;
    clubName: string;
    inviterName: string;
  };
  error?: string;
}

export const respondToEmailInvite = onCall(
  {
    region: config.region,
  },
  async (request): Promise<RespondToEmailInviteResponse> => {
    try {
      const { token, action, userInfo }: RespondToEmailInviteRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['token', 'action']);

      if (!['accept', 'reject'].includes(action)) {
        throw new HttpsError('invalid-argument', 'Action must be either "accept" or "reject"');
      }

      console.log(`📧 Processing email invitation response: ${action} for token ${token}`);

      const db = admin.firestore();
      
      // Get invitation document
      const inviteRef = db.collection('invitations').doc(token);
      const inviteDoc = await inviteRef.get();
      
      if (!inviteDoc.exists) {
        throw new HttpsError('not-found', 'Invitation not found or expired');
      }

      const inviteData = inviteDoc.data();
      
      // Verify invitation is valid and not expired
      if (inviteData?.used) {
        return {
          success: false,
          action: 'already_used',
          message: 'This invitation has already been used'
        };
      }

      // Check expiration
      const expiresAt = inviteData?.expiresAt?.toDate();
      if (expiresAt && expiresAt < new Date()) {
        return {
          success: false,
          action: 'expired',
          message: 'This invitation has expired'
        };
      }

      const invitationDetails = {
        groupName: inviteData?.groupName || 'Unknown Group',
        clubName: inviteData?.clubName || 'Unknown Club',
        inviterName: inviteData?.inviterName || 'Someone'
      };

      // Handle different invitation statuses
      if (inviteData?.status === 'accepted_pending_signup') {
        // This invitation was already processed during signup
        // Return success since the intended outcome (user joins group) has already happened
        console.log(`� Invitation was already processed during signup, returning success`);
        
        return {
          success: true,
          action: 'accepted',
          message: `Welcome to ${invitationDetails.groupName}! Your membership was already processed during account creation.`,
          invitationDetails,
          requiresSignup: false
        };
      }

      if (inviteData?.status !== 'pending') {
        return {
          success: false,
          action: 'already_used',
          message: `This invitation has already been ${inviteData?.status}`
        };
      }

      if (action === 'reject') {
        console.log(`❌ User rejected email invitation to group ${invitationDetails.groupName}`);
        
        // Mark invitation as rejected
        await inviteRef.update({
          status: 'rejected',
          used: true,
          respondedAt: admin.firestore.FieldValue.serverTimestamp(),
          userResponse: action
        });

        return {
          success: true,
          action: 'rejected',
          message: `You have declined the invitation to join ${invitationDetails.groupName}`,
          invitationDetails
        };

      } else { // action === 'accept'
        console.log(`✅ User accepted email invitation to group ${invitationDetails.groupName}`);
        
        // Check if user exists by email
        let userId = null;
        if (request.auth?.uid) {
          userId = request.auth.uid;
        } else if (inviteData?.email) {
          // Try to find user by email
          try {
            const userRecord = await admin.auth().getUserByEmail(inviteData.email);
            userId = userRecord.uid;
          } catch {
            console.log('User not found, will need to sign up first');
          }
        }

        if (!userId) {
          // User needs to sign up first
          await inviteRef.update({
            status: 'accepted_pending_signup',
            respondedAt: admin.firestore.FieldValue.serverTimestamp(),
            userResponse: action,
            userInfo: userInfo || {}
          });

          return {
            success: true,
            action: 'accepted',
            message: `Welcome! Please create your account to join ${invitationDetails.groupName}`,
            requiresSignup: true,
            redirectUrl: `/signup?invite=${token}`,
            invitationDetails
          };
        } else {
          // User exists, add them to the group directly
          try {
            // Mark invitation as used
            await inviteRef.update({
              status: 'accepted',
              used: true,
              respondedAt: admin.firestore.FieldValue.serverTimestamp(),
              userResponse: action,
              acceptedByUserId: userId
            });

            // Add user to club and group using direct database operations
            // CRITICAL: Must add to club BEFORE adding to group
            try {
              // Step 1: Check if user is already a club member
              const clubMemberRef = admin.firestore()
                .collection('clubs')
                .doc(inviteData.clubId)
                .collection('allMembers')
                .doc('members');

              const clubMembersDoc = await clubMemberRef.get();
              let isAlreadyClubMember = false;
              
              if (clubMembersDoc.exists) {
                const clubMembersData = clubMembersDoc.data();
                const currentMembers = clubMembersData?.members || [];
                isAlreadyClubMember = currentMembers.some((m: any) => m.userId === userId);
              }

              // Step 2: Add to club allMembers collection (only if not already a member)
              if (!isAlreadyClubMember) {
                console.log(`📋 Adding user ${userId} to club ${inviteData.clubId} membership`);
                
                const clubMemberData = {
                  userId: userId,
                  name: userInfo?.displayName || inviteData.email?.split('@')[0] || 'Unknown User',
                  email: inviteData.email || '',
                  roles: ['member'],
                  joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                  photoURL: '',
                  needsGuardian: false,
                  guardiansContacts: [],
                  addedBy: inviteData.inviterUid
                };

                await clubMemberRef.update({
                  members: admin.firestore.FieldValue.arrayUnion(clubMemberData),
                  lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                  memberCount: admin.firestore.FieldValue.increment(1),
                  version: admin.firestore.FieldValue.increment(1),
                  lastModified: admin.firestore.FieldValue.serverTimestamp(),
                });

                // Update club total count
                await admin.firestore().collection('clubs').doc(inviteData.clubId).update({
                  totalCounts: admin.firestore.FieldValue.increment(1),
                  version: admin.firestore.FieldValue.increment(1),
                  lastModified: admin.firestore.FieldValue.serverTimestamp(),
                });

                console.log('✅ User added to club membership successfully');
              } else {
                console.log(`ℹ️ User ${userId} is already a member of club ${inviteData.clubId}`);
              }

              // Step 3: Add to group allMembers collection (only proceed if club membership is confirmed)
              console.log(`🎯 Adding user ${userId} to group ${inviteData.groupId} membership`);
              
              const groupMemberData = {
                userId: userId,
                name: userInfo?.displayName || inviteData.email?.split('@')[0] || 'Unknown User',
                email: inviteData.email || '',
                roles: ['player'],
                joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                photoURL: '',
                needsGuardian: false,
                belongsToSubGroups: [],
                guardiansContacts: [],
                addedBy: inviteData.inviterUid
              };

              const groupMemberRef = admin.firestore()
                .collection('clubs')
                .doc(inviteData.clubId)
                .collection('groups')
                .doc(inviteData.groupId)
                .collection('allMembers')
                .doc('members');

              await groupMemberRef.update({
                members: admin.firestore.FieldValue.arrayUnion(groupMemberData),
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                memberCount: admin.firestore.FieldValue.increment(1),
                version: admin.firestore.FieldValue.increment(1),
                lastModified: admin.firestore.FieldValue.serverTimestamp(),
              });

              console.log('✅ User added to group membership successfully');

              // Step 4: Update user document with club and group access
              const userRef = admin.firestore().collection('users').doc(userId);
              const userDoc = await userRef.get();
              
              if (userDoc.exists) {
                const userData = userDoc.data();
                let clubAccess = userData?.clubAccess || [];
                
                // Find existing club access or create new one
                let clubIndex = clubAccess.findIndex((club: any) => club.clubId === inviteData.clubId);
                
                if (clubIndex >= 0) {
                  // Club exists, update it
                  clubAccess[clubIndex].role = 'member';
                  clubAccess[clubIndex].joinedAt = admin.firestore.FieldValue.serverTimestamp();
                  
                  if (!clubAccess[clubIndex].groupAccess) {
                    clubAccess[clubIndex].groupAccess = [];
                  }
                  
                  // Add group access if not exists
                  const existingGroup = clubAccess[clubIndex].groupAccess.find(
                    (group: any) => group.groupId === inviteData.groupId
                  );
                  
                  if (!existingGroup) {
                    clubAccess[clubIndex].groupAccess.push({
                      groupId: inviteData.groupId,
                      groupName: inviteData.groupName,
                      roles: ['player'],
                      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                      subGroups: []
                    });
                  }
                  
                } else {
                  // Club doesn't exist, create new entry
                  clubAccess.push({
                    clubId: inviteData.clubId,
                    clubName: inviteData.clubName,
                    role: 'member',
                    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                    lastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                    groupAccess: [{
                      groupId: inviteData.groupId,
                      groupName: inviteData.groupName,
                      roles: ['player'],
                      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                      subGroups: []
                    }]
                  });
                }
                
                // Update user document
                await userRef.update({
                  clubAccess: clubAccess,
                  lastModified: admin.firestore.FieldValue.serverTimestamp(),
                  version: admin.firestore.FieldValue.increment(1)
                });
              }

            } catch (membershipError) {
              console.error('❌ Error adding user to club/group membership:', membershipError);
              throw new HttpsError('internal', 'Failed to add user to club/group membership. Club membership must be established before group membership.');
            }

            return {
              success: true,
              action: 'accepted',
              message: `Welcome to ${invitationDetails.groupName}! You can now access the app.`,
              redirectUrl: '/dashboard',
              invitationDetails
            };

          } catch (error) {
            console.error('Error adding user to group:', error);
            
            // Revert invitation status
            await inviteRef.update({
              status: 'pending',
              respondedAt: null,
              userResponse: null,
              error: error instanceof Error ? error.message : 'Unknown error'
            });

            return {
              success: false,
              action: 'error',
              message: 'Failed to add you to the group. Please try again or contact support.',
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        }
      }

    } catch (error) {
      console.error('Error in respondToEmailInvite:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to process invitation response');
    }
  }
);
