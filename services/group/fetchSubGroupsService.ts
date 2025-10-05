import { collection, doc, getDoc, getDocs, getFirestore } from 'firebase/firestore';

export interface SubGroup {
  id: string;
  name: string;
  memberIds: string[];
  createdBy?: string;
  createdAt?: any;
  description?: string;
}

/**
 * Service to fetch subgroups from the subgroups subcollection
 */
export const fetchSubGroups = async (
  clubId: string,
  groupId: string
): Promise<SubGroup[]> => {
  try {
    const db = getFirestore();
    
    // Fetch subgroups from clubs/{clubId}/groups/{groupId}/subgroups
    const subgroupsSnapshot = await getDocs(
      collection(db, 'clubs', clubId, 'groups', groupId, 'subgroups')
    );
    
    const subgroupsData: SubGroup[] = [];
    
    // Handle case where subcollection doesn't exist (empty snapshot)
    if (subgroupsSnapshot.empty) {
      console.log(`No subgroups found in subgroups subcollection for group ${groupId}`);
      return [];
    }
    
    subgroupsSnapshot.forEach((subgroupDoc) => {
      const data = subgroupDoc.data();
      
      const subgroup: SubGroup = {
        id: subgroupDoc.id,
        name: data.name || '',
        memberIds: data.memberIds || [],
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        description: data.description || ''
      };
      
      subgroupsData.push(subgroup);
    });
    
    return subgroupsData;
  } catch (error) {
    console.error('Error fetching subgroups:', error);
    // Return empty array instead of throwing error to gracefully handle missing subcollection
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
 */
export const getSubGroupMembers = async (
  clubId: string,
  groupId: string,
  subGroupName: string
): Promise<string[]> => {
  try {
    const subgroups = await fetchSubGroups(clubId, groupId);
    const subgroup = subgroups.find(sg => sg.name === subGroupName);
    return subgroup ? subgroup.memberIds : [];
  } catch (error) {
    console.error('Error fetching subgroup members:', error);
    return [];
  }
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
