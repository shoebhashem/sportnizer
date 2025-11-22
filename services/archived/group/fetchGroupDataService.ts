import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { GroupData } from '../types/group';

/**
 * Service to fetch group basic information
 */
export const fetchGroupData = async (
  clubId: string,
  groupId: string
): Promise<GroupData | null> => {
  try {
    const db = getFirestore();
    
    // Fetch group basic info from clubs/{clubId}/groups/{groupId}
    const groupDoc = await getDoc(doc(db, 'clubs', clubId, 'groups', groupId));
    
    if (groupDoc.exists()) {
      const data = groupDoc.data();
      
      const groupData: GroupData = {
        id: groupDoc.id, // Include the document ID
        name: data.name || '',
        sportType: data.sportType || '',
        description: data.description || '',
        createdBy: data.createdBy || '',
        createdAt: data.createdAt,
        isActive: data.isActive !== false, // Default to true if not specified
        memberCount: data.memberCount || 0,
        maxCount: data.maxCount,
        subGroups: data.subGroups || [],
        ageGroup: data.ageGroup
      };
      
      return groupData;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching group data:', error);
    throw new Error('Failed to fetch group data');
  }
};

/**
 * Check if user can manage the group (is admin, coach, or creator)
 */
export const canUserManageGroup = (
  groupData: GroupData | null,
  userId: string,
  userRoles: string[]
): boolean => {
  if (!groupData || !userId) return false;
  
  // Check if user is the creator
  if (groupData.createdBy === userId) return true;
  
  // Check if user has admin or coach role
  return userRoles.includes('admin') || userRoles.includes('coach');
};
