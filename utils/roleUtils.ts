import { useAuth } from '@/contexts/AuthContext';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';

/**
 * Hook to check if the current user has event management permissions
 * (admin or coach role in any group)
 */
export const useEventPermissions = () => {
  const { user } = useAuth();
  const [canCreateEvents, setCanCreateEvents] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkEventPermissions = useCallback(async () => {
    if (!user?.uid) {
      setCanCreateEvents(false);
      setLoading(false);
      return;
    }

    try {
      const db = getFirestore();
      
      // Get all groups where user is a member
      const groupsQuery = collection(db, 'groups');
      const groupsSnapshot = await getDocs(groupsQuery);
      
      let hasEventPermissions = false;
      
      // Check each group to see if user has admin or coach role
      for (const groupDoc of groupsSnapshot.docs) {
        const membersSnapshot = await getDocs(
          collection(db, 'groups', groupDoc.id, 'members')
        );
        
        const userMember = membersSnapshot.docs.find(doc => doc.id === user.uid);
        if (userMember) {
          const memberData = userMember.data();
          if (memberData.role === 'admin' || memberData.role === 'coach') {
            hasEventPermissions = true;
            break; // Found admin/coach role, no need to check further
          }
        }
      }
      
      setCanCreateEvents(hasEventPermissions);
    } catch (error) {
      console.error('Error checking event permissions:', error);
      setCanCreateEvents(false);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    checkEventPermissions();
  }, [checkEventPermissions]);

  return { canCreateEvents, loading, recheckPermissions: checkEventPermissions };
};

/**
 * Utility function to check if a user has event management permissions
 * @param userId - The user ID to check
 * @returns Promise<boolean> - True if user has admin/coach role in any group
 */
export const checkUserEventPermissions = async (userId: string): Promise<boolean> => {
  try {
    const db = getFirestore();
    
    // Get all groups
    const groupsQuery = collection(db, 'groups');
    const groupsSnapshot = await getDocs(groupsQuery);
    
    // Check each group for user's role
    for (const groupDoc of groupsSnapshot.docs) {
      const membersSnapshot = await getDocs(
        collection(db, 'groups', groupDoc.id, 'members')
      );
      
      const userMember = membersSnapshot.docs.find(doc => doc.id === userId);
      if (userMember) {
        const memberData = userMember.data();
        if (memberData.role === 'admin' || memberData.role === 'coach') {
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking user event permissions:', error);
    return false;
  }
};

/**
 * Get all groups where user has admin or coach permissions
 * @param userId - The user ID
 * @returns Promise<Array> - Array of groups where user can create events
 */
export const getUserEventGroups = async (userId: string) => {
  try {
    const db = getFirestore();
    const eventGroups = [];
    
    // Get all groups
    const groupsQuery = collection(db, 'groups');
    const groupsSnapshot = await getDocs(groupsQuery);
    
    // Check each group for user's role
    for (const groupDoc of groupsSnapshot.docs) {
      const membersSnapshot = await getDocs(
        collection(db, 'groups', groupDoc.id, 'members')
      );
      
      const userMember = membersSnapshot.docs.find(doc => doc.id === userId);
      if (userMember) {
        const memberData = userMember.data();
        if (memberData.role === 'admin' || memberData.role === 'coach') {
          const groupData = groupDoc.data();
          eventGroups.push({
            id: groupDoc.id,
            name: groupData.name,
            role: memberData.role,
            ...groupData
          });
        }
      }
    }
    
    return eventGroups;
  } catch (error) {
    console.error('Error getting user event groups:', error);
    return [];
  }
};
