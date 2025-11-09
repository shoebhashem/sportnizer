import { doc, getDoc, getFirestore } from 'firebase/firestore';

export interface SubGroup {
  id: string;
  name: string;
  memberIds: string[];
  createdBy?: string;
  createdAt?: any;
  description?: string;
}

/**
 * Service to fetch subgroups from the group document subGroups array
 */
export const fetchSubGroups = async (
  clubId: string,
  groupId: string
): Promise<SubGroup[]> => {
  try {
    const db = getFirestore();
    
    // Fetch the main group document to get subGroups array
    const groupDoc = await getDoc(doc(db, 'clubs', clubId, 'groups', groupId));
    
    if (!groupDoc.exists()) {
      console.log(`Group ${groupId} not found`);
      return [];
    }
    
    const data = groupDoc.data();
    const subGroupNames = data.subGroups || [];
    
    // Convert string array to SubGroup objects
    const subgroupsData: SubGroup[] = subGroupNames.map((name: string, index: number) => ({
      id: `subgroup_${index}`, // Generate a simple ID
      name: name,
      memberIds: [], // We'll calculate this from members' belongsToSubGroups
      createdBy: data.createdBy, // Use group creator as fallback
      createdAt: data.createdAt,
      description: ''
    }));
    
    return subgroupsData;
  } catch (error) {
    console.error('Error fetching subgroups:', error);
    return [];
  }
};

/**
 * Get subgroup names array from the main group document
 */
export const getGroupSubGroupNames = async (
  clubId: string,
  groupId: string
): Promise<string[]> => {
  try {
    const db = getFirestore();
    
    // Fetch the main group document to get subGroups array
    const groupDoc = await getDoc(doc(db, 'clubs', clubId, 'groups', groupId));
    
    if (groupDoc.exists()) {
      const data = groupDoc.data();
      return data.subGroups || [];
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching subgroup names:', error);
    return [];
  }
};

/**
 * Get members belonging to a specific subgroup
 * This now looks at member's belongsToSubGroups array instead of subgroup memberIds
 */
export const getSubGroupMembers = async (
  clubId: string,
  groupId: string,
  subGroupName: string
): Promise<string[]> => {
  // memberIds are now calculated in the UI from members' belongsToSubGroups
  return [];
};

/**
 * Get count of members in a subgroup
 */
export const getSubGroupMemberCount = async (
  clubId: string,
  groupId: string,
  subGroupName: string
): Promise<number> => {
  try {
    const memberIds = await getSubGroupMembers(clubId, groupId, subGroupName);
    return memberIds.length;
  } catch (error) {
    console.error('Error getting subgroup member count:', error);
    return 0;
  }
};
