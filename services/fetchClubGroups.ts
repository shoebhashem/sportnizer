// /services/fetchClubGroups.ts - Fetch all groups for a club
// Direct Firestore read operation (read-only, no security concerns)

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './core/firebase';

export interface ClubGroupData {
  id: string;
  name: string;
  description?: string;
  sport?: string;
  memberCount: number;
  createdBy: string;
  createdAt: any;
  isActive: boolean;
  deletionScheduledAt?: any;
}

export interface ClubGroupsResponse {
  success: boolean;
  groups: ClubGroupData[];
  error?: string;
}

/**
 * Fetch all groups within a club
 * Direct Firestore query since this is a read-only operation
 * Only active groups are returned (isActive !== false)
 */
export const fetchClubGroups = async (clubId: string): Promise<ClubGroupsResponse> => {
  try {
    console.log(`📂 Fetching groups for club ${clubId}...`);
    
    // Query all groups in the club subcollection
    // Filter to only show active groups (isActive !== false)
    const groupsRef = collection(db, 'clubs', clubId, 'groups');
    const q = query(groupsRef, where('isActive', '!=', false));
    const querySnapshot = await getDocs(q);
    
    const groups: ClubGroupData[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      groups.push({
        id: doc.id,
        name: data.name || '',
        description: data.description || '',
        sport: data.sport || '',
        memberCount: data.memberCount || 0,
        createdBy: data.createdBy || '',
        createdAt: data.createdAt,
        isActive: data.isActive !== false
      });
    });

    console.log(`✅ Fetched ${groups.length} groups for club ${clubId}`);
    return { success: true, groups };

  } catch (error: any) {
    console.error('❌ Error fetching club groups:', error);
    return { 
      success: false, 
      groups: [], 
      error: error.message || 'Failed to fetch club groups'
    };
  }
};

/**
 * Get group count for a club
 */
export const getClubGroupCount = async (clubId: string): Promise<number> => {
  const result = await fetchClubGroups(clubId);
  return result.success ? result.groups.length : 0;
};
