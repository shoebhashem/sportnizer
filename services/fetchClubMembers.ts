// /services/fetchClubMembers.ts - Read club members via Firebase Functions
// Calls getClubMembers Firebase Function following three-layer architecture

import { httpsCallable } from 'firebase/functions';
import { functions } from './core/firebase';
import type { ClubMemberData } from './types/club';

export interface ClubMembersResponse {
  success: boolean;
  members: ClubMemberData[];
  error?: string;
}

/**
 * Fetch all members of a club via Firebase Function
 * Calls getClubMembers Firebase Function instead of direct Firestore access
 */
export const fetchClubMembers = async (clubId: string): Promise<ClubMembersResponse> => {
  try {
    // Call Firebase Function instead of direct Firestore access
    const getClubMembersFn = httpsCallable(functions, 'getClubMembers');
    const result = await getClubMembersFn({ clubId });
    
    const response = result.data as { success: boolean; members?: any[]; memberCount?: number; error?: string };
    
    if (!response.success) {
      console.log(`Error fetching club members: ${response.error}`);
      return { success: false, members: [], error: response.error };
    }

    const members: ClubMemberData[] = response.members || [];

    console.log(`✅ Fetched ${members.length} members for club ${clubId}`);
    return { success: true, members };

  } catch (error: any) {
    console.error('❌ Error fetching club members:', error);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error message:', error.message);
    return { 
      success: false, 
      members: [], 
      error: error.message || 'Failed to fetch club members'
    };
  }
};

/**
 * Get member count for a club
 */
export const getClubMemberCount = async (clubId: string): Promise<number> => {
  const result = await fetchClubMembers(clubId);
  return result.success ? result.members.length : 0;
};
