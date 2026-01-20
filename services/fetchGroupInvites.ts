// /services/fetchGroupInvites.ts - Read group invitations via Firebase Functions
// Calls getUserProfile Firebase Function following three-layer architecture

import { httpsCallable } from 'firebase/functions';
import { functions } from './core/firebase';
import { addRegularMemberToGroupService } from './orchestration/addRegularMemberToGroup';
import type { UserProfile } from './types';

export interface GroupInviteInfo {
  inviteId: string;
  groupId: string;
  groupName: string;
  clubId: string;
  clubName: string;
  invitedBy: string;
  invitedByName?: string;
  createdAt: any; // Firestore timestamp
  status: 'pending' | 'accepted' | 'rejected';
  message?: string;
  invitationType?: string;
  youthData?: {
    childName: string;
    dateOfBirth: string;
    relationship: string;
  };
}

export interface FetchGroupInvitesResponse {
  success: boolean;
  invites: GroupInviteInfo[];
  totalCount: number;
  error?: string;
}

/**
 * Fetches all pending group invitations for the current user from unified invitations collection
 * Uses Firebase Functions to query the invitations collection for this user's pending invites
 */
export const fetchGroupInvites = async (userId: string): Promise<FetchGroupInvitesResponse> => {
  try {
    console.log(`📬 Fetching group invitations for user: ${userId}`);

    // Get user profile to get their email for invitation lookup
    const getUserProfileFn = httpsCallable(functions, 'getUserProfile');
    const result = await getUserProfileFn({ uid: userId });
    
    const response = result.data as { success: boolean; userProfile?: UserProfile; error?: string };
    
    if (!response.success || !response.userProfile) {
      console.log(`No user profile found for userId ${userId}`);
      return { success: true, invites: [], totalCount: 0 };
    }

    const userEmail = response.userProfile.email;
    if (!userEmail) {
      console.log(`No email found for user ${userId}`);
      return { success: true, invites: [], totalCount: 0 };
    }

    // 🎯 UNIFIED: Query invitations collection for this user's pending invites
    // Look for invitations where:
    // - email matches user's email AND status is 'pending' (existing user flow)
    // - OR userId matches AND status is 'accepted_pending_signup' (new user flow - though this shouldn't happen in this context)
    const { getDocs, query, where, collection, or } = await import('firebase/firestore');
    const { db } = await import('./core/firebase');
    
    const invitationsQuery = query(
      collection(db, 'invitations'),
      or(
        where('email', '==', userEmail.toLowerCase()),
        where('userId', '==', userId)
      )
    );

    const invitationsSnapshot = await getDocs(invitationsQuery);
    const allInvites: GroupInviteInfo[] = [];

    invitationsSnapshot.forEach((doc) => {
      const inviteData = doc.data();
      
      // Only include pending invitations for existing users
      // Exclude youth invitations - guardians should never see these in their invitation list
      // Youth invitations are handled automatically during guardian signup
      if (inviteData.status === 'pending' && inviteData.invitationType !== 'youth_member') {
        allInvites.push({
          inviteId: doc.id, // Use document ID as invitation token
          groupId: inviteData.groupId,
          groupName: inviteData.groupName,
          clubId: inviteData.clubId,
          clubName: inviteData.clubName,
          invitedBy: inviteData.inviterUid,
          invitedByName: inviteData.inviterName,
          createdAt: inviteData.createdAt,
          status: inviteData.status,
          message: inviteData.message
        });
      }
    });

    // Sort by creation date (newest first)
    allInvites.sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });

    console.log(`✅ Found ${allInvites.length} pending group invitations from unified collection`);

    return {
      success: true,
      invites: allInvites,
      totalCount: allInvites.length
    };

  } catch (error) {
    console.error('❌ Error fetching group invites:', error);
    return {
      success: false,
      invites: [],
      totalCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

/**
 * Accepts a group invitation (uses unified orchestration service for both user types)
 */
export const acceptGroupInvite = async (
  inviteId: string, 
  clubId: string, 
  groupId: string
): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    console.log(`✅ Accepting invitation ${inviteId} for group ${groupId}`);

    // 🎯 UNIFIED: Call unified orchestration service for both new and existing users
    // This uses the same processInvitationAfterUserResponse that handles signup flow
    
    // Get current user ID (required for the unified function)
    const { getAuth } = await import('firebase/auth');
    const auth = getAuth();
    
    if (!auth.currentUser) {
      return {
        success: false,
        error: 'User must be authenticated'
      };
    }

    const result = await addRegularMemberToGroupService.processInvitationAfterUserResponse(
      inviteId,             // invitation token (works for both flows)
      auth.currentUser.uid, // user ID (existing user ID for this case)
      'accept'              // action: accept the invitation
    );

    if (result.success) {
      console.log(`✅ Successfully accepted invitation: ${result.message}`);
      return {
        success: true,
        message: result.message
      };
    } else {
      console.error('❌ Failed to accept invitation:', result.error);
      return {
        success: false,
        error: result.error || 'Failed to accept invitation'
      };
    }

  } catch (error) {
    console.error('❌ Error accepting invitation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

/**
 * Rejects a group invitation (uses unified orchestration service for both user types)
 */
export const rejectGroupInvite = async (
  inviteId: string, 
  clubId: string, 
  groupId: string
): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    console.log(`❌ Rejecting invitation ${inviteId} for group ${groupId}`);

    // 🎯 UNIFIED: Call unified orchestration service for both new and existing users
    // This uses the same processInvitationAfterUserResponse that handles signup flow
    
    // Get current user ID (required for the unified function)
    const { getAuth } = await import('firebase/auth');
    const auth = getAuth();
    
    if (!auth.currentUser) {
      return {
        success: false,
        error: 'User must be authenticated'
      };
    }

    const result = await addRegularMemberToGroupService.processInvitationAfterUserResponse(
      inviteId,             // invitation token (works for both flows)
      auth.currentUser.uid, // user ID (existing user ID for this case)
      'reject'              // action: reject the invitation
    );

    if (result.success) {
      console.log(`✅ Successfully rejected invitation: ${result.message}`);
      return {
        success: true,
        message: result.message
      };
    } else {
      console.error('❌ Failed to reject invitation:', result.error);
      return {
        success: false,
        error: result.error || 'Failed to reject invitation'
      };
    }

  } catch (error) {
    console.error('❌ Error rejecting invitation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};
