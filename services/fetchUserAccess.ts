// /services/fetchUserAccess.ts - Read user access permissions via Firebase Functions
// Calls getUserProfile Firebase Function following three-layer architecture

import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './core/firebase';
import type { ClubAccess, UserProfile } from './types/user';

export interface UserAccessResponse {
  success: boolean;
  clubAccess: ClubAccess[];
  error?: string;
}

export interface UserProfileResponse {
  success: boolean;
  profile: UserProfile | null;
  error?: string;
}

/**
 * Fetch user's complete access permissions from user document
 * Reads from /users/{userId} and extracts clubAccess array with all nested permissions
 * 
 * This service provides a single source of truth for user permissions by reading the
 * clubAccess[] array which contains:
 * - Club-level permissions (club-admin or member)
 * - Group-level permissions (nested groupAccess[] with roles)
 * - Event-level permissions (nested eventAccess[])
 * - Poll-level permissions (nested pollAccess[])
 * - Announcement-level permissions (nested announcementAccess[])
 * 
 * @param userId - The user ID to fetch access permissions for
 * @returns Promise with user's complete clubAccess array or error
 */
export const fetchUserAccess = async (userId: string): Promise<UserAccessResponse> => {
  try {
    // Call Firebase Function instead of direct Firestore access
    const getUserProfileFn = httpsCallable(functions, 'getUserProfile');
    const result = await getUserProfileFn({ uid: userId });
    
    const response = result.data as { success: boolean; userProfile?: UserProfile; error?: string };
    
    if (!response.success || !response.userProfile) {
      console.log(`No user profile found for userId ${userId}`);
      return { success: true, clubAccess: [] };
    }

    const clubAccess: ClubAccess[] = response.userProfile.clubAccess || [];

    console.log(`✅ Fetched access permissions for user ${userId}: ${clubAccess.length} clubs`);
    
    return { 
      success: true, 
      clubAccess 
    };

  } catch (error: any) {
    console.error('❌ Error fetching user access:', error);
    return { 
      success: false, 
      clubAccess: [],
      error: error.message || 'Failed to fetch user access permissions'
    };
  }
};

/**
 * Fetch complete user profile from user document
 * Reads from /users/{userId} and returns the complete UserProfile with all fields
 * 
 * This service fetches the full user document including:
 * - Basic profile information (email, displayName, photoURL, etc.)
 * - Personal information (phoneNumber, dateOfBirth, address)
 * - Access permissions (clubAccess[] array with nested permissions)
 * - Event and response data
 * - Verification status and metadata
 * 
 * @param userId - The user ID to fetch complete profile for
 * @returns Promise with user's complete profile or error
 */
export const fetchUserProfile = async (userId: string, retryCount = 0): Promise<UserProfileResponse> => {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000; // Start with 1 second
  
  try {
    // Debug: Check auth state before making function call
    console.log('🔐 fetchUserProfile - About to call getUserProfile function for userId:', userId);
    console.log('🔐 Firebase Auth current user:', auth.currentUser?.uid);
    console.log('🔐 User is authenticated:', !!auth.currentUser);
    
    // Call Firebase Function instead of direct Firestore access
    const getUserProfileFn = httpsCallable(functions, 'getUserProfile');
    const result = await getUserProfileFn({ uid: userId });
    
    const response = result.data as { success: boolean; userProfile?: any; error?: string };
    
    if (!response.success || !response.userProfile) {
      console.log(`No user profile found for userId ${userId}`);
      return { success: true, profile: null };
    }

    const userData = response.userProfile;
    
    // Convert Firebase Function response to UserProfile with proper type handling
    const profile: UserProfile = {
      uid: userData.uid || userId,
      email: userData.email || '',
      displayName: userData.displayName || userData.name || '',
      photoURL: userData.photoURL || userData.profilePicture,
      phoneNumber: userData.phoneNumber,
      dateOfBirth: userData.dateOfBirth ? new Date(userData.dateOfBirth) : undefined,
      address: userData.address || {},
      clubAccess: userData.clubAccess || [],
      groupsCreated: userData.groupsCreated || 0,
      events: userData.events || [],
      eventsResponses: userData.eventsResponses || [],
      verificationStatus: userData.verificationStatus || 'pending',
      createdAt: userData.createdAt ? new Date(userData.createdAt) : undefined,
      lastActive: userData.lastActive ? new Date(userData.lastActive) : undefined,
      version: userData.version || 1,
    };

    console.log(`✅ Fetched complete profile for user ${userId}`);
    
    return { 
      success: true, 
      profile 
    };

  } catch (error: any) {
    console.error('❌ Error fetching user profile:', error);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error message:', error.message);
    console.error('❌ Full error:', JSON.stringify(error, null, 2));
    
    // If user profile not found and we haven't exhausted retries, try again
    // This handles race condition where auth user is created but Firestore document isn't ready yet
    if (error.code === 'functions/not-found' && retryCount < MAX_RETRIES) {
      const delayMs = RETRY_DELAY_MS * Math.pow(2, retryCount); // Exponential backoff
      console.log(`⏳ User profile not found, retrying in ${delayMs}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return fetchUserProfile(userId, retryCount + 1);
    }
    
    return { 
      success: false, 
      profile: null,
      error: error.message || 'Failed to fetch user profile'
    };
  }
};

/**
 * Check if user has club-admin role for a specific club
 * 
 * @param userId - The user ID to check
 * @param clubId - The club ID to check admin access for
 * @returns Promise with boolean indicating if user is club admin
 */
export const isUserClubAdmin = async (userId: string, clubId: string): Promise<boolean> => {
  try {
    const accessResponse = await fetchUserAccess(userId);
    if (!accessResponse.success) {
      return false;
    }

    return accessResponse.clubAccess.some(club => 
      club.clubId === clubId && club.role === 'club-admin'
    );
  } catch (error) {
    console.error('❌ Error checking club admin status:', error);
    return false;
  }
};

/**
 * Check if user has specific role in a group
 * 
 * @param userId - The user ID to check
 * @param clubId - The club ID containing the group
 * @param groupId - The group ID to check role for
 * @param role - The role to check for ('admin', 'coach', 'player', 'guardian')
 * @returns Promise with boolean indicating if user has the specified role
 */
export const hasUserGroupRole = async (
  userId: string, 
  clubId: string, 
  groupId: string, 
  role: string
): Promise<boolean> => {
  try {
    const accessResponse = await fetchUserAccess(userId);
    if (!accessResponse.success) {
      return false;
    }

    const clubAccess = accessResponse.clubAccess.find(club => club.clubId === clubId);
    if (!clubAccess) {
      return false;
    }

    return clubAccess.groupAccess?.some(group => 
      group.groupId === groupId && group.roles.includes(role)
    ) || false;
  } catch (error) {
    console.error('❌ Error checking group role:', error);
    return false;
  }
};

/**
 * Check if user can manage a group (is club-admin OR has admin/coach role in group)
 * 
 * @param userId - The user ID to check
 * @param clubId - The club ID containing the group
 * @param groupId - The group ID to check management permissions for
 * @returns Promise with boolean indicating if user can manage the group
 */
export const canUserManageGroup = async (
  userId: string, 
  clubId: string, 
  groupId: string
): Promise<boolean> => {
  try {
    // Check if user is club admin (can manage all groups in club)
    const isClubAdmin = await isUserClubAdmin(userId, clubId);
    if (isClubAdmin) {
      return true;
    }

    // Check if user has admin or coach role in the specific group
    const isGroupAdmin = await hasUserGroupRole(userId, clubId, groupId, 'admin');
    const isGroupCoach = await hasUserGroupRole(userId, clubId, groupId, 'coach');

    return isGroupAdmin || isGroupCoach;
  } catch (error) {
    console.error('❌ Error checking group management permissions:', error);
    return false;
  }
};

/**
 * Get all clubs where user has club-admin role
 * 
 * @param userId - The user ID to check
 * @returns Promise with array of club IDs where user is admin
 */
export const getUserAdminClubs = async (userId: string): Promise<string[]> => {
  try {
    const accessResponse = await fetchUserAccess(userId);
    if (!accessResponse.success) {
      return [];
    }

    return accessResponse.clubAccess
      .filter(club => club.role === 'club-admin')
      .map(club => club.clubId);
  } catch (error) {
    console.error('❌ Error getting user admin clubs:', error);
    return [];
  }
};

/**
 * Get user's access summary for debugging/display purposes
 * 
 * @param userId - The user ID to get summary for
 * @returns Promise with formatted access summary
 */
export const getUserAccessSummary = async (userId: string): Promise<{
  success: boolean;
  summary?: {
    totalClubs: number;
    adminClubs: number;
    totalGroups: number;
    totalEvents: number;
    clubDetails: {
      clubId: string;
      clubName: string;
      role: string;
      groupCount: number;
      eventCount: number;
    }[];
  };
  error?: string;
}> => {
  try {
    const accessResponse = await fetchUserAccess(userId);
    if (!accessResponse.success) {
      return { success: false, error: accessResponse.error };
    }

    const clubAccess = accessResponse.clubAccess;
    
    const summary = {
      totalClubs: clubAccess.length,
      adminClubs: clubAccess.filter(club => club.role === 'club-admin').length,
      totalGroups: clubAccess.reduce((total, club) => total + (club.groupAccess?.length || 0), 0),
      totalEvents: clubAccess.reduce((total, club) => total + (club.eventAccess?.length || 0), 0),
      clubDetails: clubAccess.map(club => ({
        clubId: club.clubId,
        clubName: club.clubName,
        role: club.role,
        groupCount: club.groupAccess?.length || 0,
        eventCount: club.eventAccess?.length || 0
      }))
    };

    return { success: true, summary };
  } catch (error: any) {
    console.error('❌ Error getting user access summary:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to get access summary'
    };
  }
};
