// /services/fetchClubMembers.ts - Read club members directly from Firestore
// Fetches from /clubs/{clubId}/allMembers/members/

import { doc, getDoc, getFirestore } from 'firebase/firestore';
import type { ClubMemberData } from './types/club';

export interface ClubMembersResponse {
  success: boolean;
  members: ClubMemberData[];
  error?: string;
}

/**
 * Fetch all members of a club
 * Reads from /clubs/{clubId}/allMembers/members/
 */
export const fetchClubMembers = async (clubId: string): Promise<ClubMembersResponse> => {
  try {
    const db = getFirestore();
    const membersDocRef = doc(db, 'clubs', clubId, 'allMembers', 'members');
    const membersDoc = await getDoc(membersDocRef);

    if (!membersDoc.exists()) {
      console.log(`No members document found for club ${clubId}`);
      return { success: true, members: [] };
    }

    const data = membersDoc.data();
    const members: ClubMemberData[] = data?.members || [];

    console.log(`Fetched ${members.length} members for club ${clubId}`);
    return { success: true, members };

  } catch (error: any) {
    console.error('❌ Error fetching club members:', error);
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
