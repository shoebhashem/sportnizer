// /services/fetchGroupInvites.ts - Read group invitations via Firebase Functions
// Calls getUserProfile Firebase Function following three-layer architecture

import { httpsCallable } from 'firebase/functions';
import { functions } from './core/firebase';
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
}

export interface FetchGroupInvitesResponse {
  success: boolean;
  invites: GroupInviteInfo[];
  totalCount: number;
  error?: string;
}

/**
 * Fetches all pending group invitations for the current user
 * Calls getUserProfile Firebase Function to get user document with groupInvites
 */
export const fetchGroupInvites = async (userId: string): Promise<FetchGroupInvitesResponse> => {
  try {
    console.log(`📬 Fetching group invitations for user: ${userId}`);

    // Call Firebase Function to get user profile instead of direct Firestore access
    const getUserProfileFn = httpsCallable(functions, 'getUserProfile');
    const result = await getUserProfileFn({ uid: userId });
    
    const response = result.data as { success: boolean; userProfile?: UserProfile; error?: string };
    
    if (!response.success || !response.userProfile) {
      console.log(`No user profile found for userId ${userId}`);
      return { success: true, invites: [], totalCount: 0 };
    }

    const userData = response.userProfile;
    const clubAccess = userData.clubAccess || [];

    // Collect all pending invitations across all clubs
    const allInvites: GroupInviteInfo[] = [];
    
    for (const club of clubAccess) {
      const groupInvites = club.groupInvites || [];
      
      // Filter for pending invitations only
      const pendingInvites = groupInvites.filter(
        (invite: any) => invite.status === 'pending'
      );

      // Convert to display format
      for (const invite of pendingInvites) {
        allInvites.push({
          inviteId: invite.inviteId,
          groupId: invite.groupId,
          groupName: invite.groupName,
          clubId: invite.clubId || club.clubId,
          clubName: club.clubName || 'Unknown Club',
          invitedBy: invite.invitedBy,
          invitedByName: invite.invitedByName,
          createdAt: invite.createdAt,
          status: invite.status,
          message: invite.message
        });
      }
    }

    // Sort by creation date (newest first)
    allInvites.sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });

    console.log(`✅ Found ${allInvites.length} pending group invitations`);

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
 * Accepts a group invitation (delegates to Firebase Function)
 */
export const acceptGroupInvite = async (
  inviteId: string, 
  clubId: string, 
  groupId: string
): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    console.log(`✅ Accepting invitation ${inviteId} for group ${groupId}`);

    const respondToGroupInviteFn = httpsCallable(functions, 'respondToGroupInvite');
    const result = await respondToGroupInviteFn({
      inviteId,
      action: 'accept',
      clubId,
      groupId
    });

    const response = result.data as { success: boolean; message?: string; error?: string };

    if (response.success) {
      console.log(`✅ Successfully accepted invitation: ${response.message}`);
      return {
        success: true,
        message: response.message
      };
    } else {
      console.error('❌ Failed to accept invitation:', response.error);
      return {
        success: false,
        error: response.error || 'Failed to accept invitation'
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
 * Rejects a group invitation (delegates to Firebase Function)
 */
export const rejectGroupInvite = async (
  inviteId: string, 
  clubId: string, 
  groupId: string
): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    console.log(`❌ Rejecting invitation ${inviteId} for group ${groupId}`);

    const respondToGroupInviteFn = httpsCallable(functions, 'respondToGroupInvite');
    const result = await respondToGroupInviteFn({
      inviteId,
      action: 'reject',
      clubId,
      groupId
    });

    const response = result.data as { success: boolean; message?: string; error?: string };

    if (response.success) {
      console.log(`✅ Successfully rejected invitation: ${response.message}`);
      return {
        success: true,
        message: response.message
      };
    } else {
      console.error('❌ Failed to reject invitation:', response.error);
      return {
        success: false,
        error: response.error || 'Failed to reject invitation'
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
