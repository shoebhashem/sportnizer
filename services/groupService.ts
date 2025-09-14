import { addDoc, collection, doc, getDoc, getDocs, getFirestore, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getCurrentUser } from './authService';

const db = getFirestore();

// Predefined sport types
export const SPORT_TYPES = [
  'Football',
  'Basketball', 
  'Volleyball',
  'Tennis',
  'Soccer',
  'Hockey',
  'Baseball',
  'Swimming',
  'Running',
  'Cycling',
  'Other'
];

// Create a new group
export const createGroup = async (groupData: {
  name: string;
  sportType: string;
  ageGroup: string;
  location: string;
  customStats: string[];
}) => {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return { success: false, error: { code: 'auth/no-user', message: 'No authenticated user' } };
    }

    // Check if user has reached group creation limit
    const userRef = doc(db, 'users', currentUser.uid);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const groupsCreated = userData.groupsCreated || 0;
      
      // Enforce limit of 3 groups per user (as per cost optimization)
      if (groupsCreated >= 3) {
        return { 
          success: false, 
          error: { 
            code: 'limit/max-groups-reached', 
            message: 'You have reached the maximum limit of 3 groups. Please contact support if you need to create more groups.' 
          } 
        };
      }
    }

    // Convert ageGroup string to number
    let ageGroupNumber = 2; // Default to adults
    if (groupData.ageGroup.includes('Children/Youth')) {
      ageGroupNumber = 1;
    }
    // Note: ageGroup 3 (Mixed) removed for MVP simplicity

    // Create group document
    const groupDocData = {
      name: groupData.name.trim(),
      sportType: groupData.sportType,
      ageGroup: ageGroupNumber,
      location: groupData.location.trim(),
      createdBy: currentUser.uid,
      createdAt: serverTimestamp(),
      membersCount: 1, // Creator is automatically a member
      customStats: groupData.customStats.filter(stat => stat.trim() !== '').slice(0, 3) // Max 3 custom stats
    };

    // Add group to groups collection
    const groupRef = await addDoc(collection(db, 'groups'), groupDocData);

    // Add creator as admin member in subcollection (with document ID as user ID)
    await setDoc(doc(db, 'groups', groupRef.id, 'members', currentUser.uid), {
      role: 'admin',
      joinedAt: serverTimestamp()
    });

    // Update or create user document
    const userUpdateData: any = {
      groupsCreated: increment(1)
    };

    // If user document exists, we need to handle groupsJoined array
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const currentGroupsJoined = userData.groupsJoined || [];
      
      // Add new group membership with admin role
      const newMembership = {
        groupId: groupRef.id,
        roles: ['admin'],
        joinedAt: new Date(),
        status: 'active'
      };
      
      userUpdateData.groupsJoined = [...currentGroupsJoined, newMembership];
      await updateDoc(userRef, userUpdateData);
    } else {
      // Create user document if it doesn't exist using setDoc
      const newUserData = {
        name: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
        email: currentUser.email,
        groupsJoined: [{
          groupId: groupRef.id,
          roles: ['admin'],
          joinedAt: new Date(),
          status: 'active'
        }],
        groupsCreated: 1,
        eventsInvited: [], // Initialize empty array for event tracking
        createdAt: serverTimestamp()
      };
      await setDoc(userRef, newUserData);
    }

    return { 
      success: true, 
      groupId: groupRef.id,
      groupData: groupDocData
    };

  } catch (error: any) {
    console.error('Error creating group:', error);
    return { 
      success: false, 
      error: {
        code: error.code || 'unknown',
        message: error.message || 'An error occurred while creating the group'
      }
    };
  }
};

// Get user's created groups count (for validation)
export const getUserGroupsCount = async (userId: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return userData.groupsCreated || 0;
    }
    
    return 0;
  } catch (error) {
    console.error('Error getting user groups count:', error);
    return 0;
  }
};

// Coach Management Functions

export interface Coach {
  uid: string;
  email: string;
  name: string;
  role: 'coach';
  addedAt: any;
  addedBy: string;
  isExternal: boolean;
}

export interface CoachInvitation {
  groupId: string;
  groupName: string;
  invitedEmail: string;
  invitedBy: string;
  invitationCode: string;
  createdAt: any;
  expiresAt: any;
  status: 'pending' | 'accepted' | 'expired';
}

// Add coach to group
export const addCoachToGroup = async (groupId: string, coach: Omit<Coach, 'addedAt'>) => {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return { success: false, error: { code: 'auth/no-user', message: 'No authenticated user' } };
    }

    const groupRef = doc(db, 'groups', groupId);
    const groupDoc = await getDoc(groupRef);
    
    if (!groupDoc.exists()) {
      return { success: false, error: { code: 'group/not-found', message: 'Group not found' } };
    }

    const groupData = groupDoc.data();
    const existingCoaches = groupData.coaches || [];
    
    // Check if user is already a coach
    const isAlreadyCoach = existingCoaches.some((c: Coach) => c.uid === coach.uid);
    if (isAlreadyCoach) {
      return { success: false, error: { code: 'coach/already-exists', message: 'User is already a coach' } };
    }

    // Add coach with timestamp
    const newCoach = {
      ...coach,
      addedAt: serverTimestamp()
    };

    const updatedCoaches = [...existingCoaches, newCoach];
    
    await updateDoc(groupRef, {
      coaches: updatedCoaches
    });

    return { success: true };

  } catch (error: any) {
    console.error('Error adding coach:', error);
    return { 
      success: false, 
      error: {
        code: error.code || 'unknown',
        message: error.message || 'An error occurred while adding coach'
      }
    };
  }
};

// Create coach invitation for external user
export const createCoachInvitation = async (groupId: string, invitedEmail: string) => {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return { success: false, error: { code: 'auth/no-user', message: 'No authenticated user' } };
    }

    const groupRef = doc(db, 'groups', groupId);
    const groupDoc = await getDoc(groupRef);
    
    if (!groupDoc.exists()) {
      return { success: false, error: { code: 'group/not-found', message: 'Group not found' } };
    }

    const groupData = groupDoc.data();
    const invitationCode = Math.random().toString(36).substring(2, 15);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

    const invitation: CoachInvitation = {
      groupId,
      groupName: groupData.name,
      invitedEmail,
      invitedBy: currentUser.uid,
      invitationCode,
      createdAt: serverTimestamp(),
      expiresAt,
      status: 'pending'
    };

    // Store invitation in Firestore
    await addDoc(collection(db, 'coachInvitations'), invitation);

    return { success: true, invitationCode };

  } catch (error: any) {
    console.error('Error creating coach invitation:', error);
    return { 
      success: false, 
      error: {
        code: error.code || 'unknown',
        message: error.message || 'An error occurred while creating coach invitation'
      }
    };
  }
};

// Add unconfirmed child to ageGroup 1 groups
export const addUnconfirmedChild = async (
  groupId: string, 
  childData: { name: string; birthDate?: string }
) => {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return { success: false, error: { code: 'auth/no-user', message: 'No authenticated user' } };
    }

    const groupRef = doc(db, 'groups', groupId);
    const groupDoc = await getDoc(groupRef);
    
    if (!groupDoc.exists()) {
      return { success: false, error: { code: 'group/not-found', message: 'Group not found' } };
    }

    // Check if child already exists in members subcollection
    const membersRef = collection(db, 'groups', groupId, 'members');
    const membersSnapshot = await getDocs(membersRef);
    
    const childExists = membersSnapshot.docs.some((memberDoc: any) => {
      const memberData = memberDoc.data();
      // Add null/undefined check for name
      return memberData.name && memberData.name.toLowerCase().trim() === childData.name.toLowerCase().trim();
    });
    
    if (childExists) {
      return { 
        success: false, 
        error: { 
          code: 'child/already-exists', 
          message: 'A child with this name already exists in the group' 
        } 
      };
    }

    console.log('Adding child to members subcollection:', {
      groupId,
      childName: childData.name.trim(),
      hasBirthDate: !!childData.birthDate?.trim()
    });

    // Create member document in subcollection
    const memberData: any = {
      name: childData.name.trim(),
      role: 'member',
      isConfirmed: false,
      joinedAt: serverTimestamp()
    };

    // Only add birthDate if it's provided and not empty
    if (childData.birthDate?.trim()) {
      memberData.birthDate = childData.birthDate.trim();
    }

    console.log('Member data to be added:', memberData);

    const docRef = await addDoc(membersRef, memberData);
    
    // Update group membersCount to reflect total enrolled children
    await updateDoc(groupRef, {
      membersCount: increment(1)
    });
    
    console.log('Member added successfully with ID:', docRef.id);

    return { success: true };

  } catch (error: any) {
    console.error('Error adding unconfirmed child:', error);
    return { 
      success: false, 
      error: {
        code: error.code || 'unknown',
        message: error.message || 'An error occurred while adding child'
      }
    };
  }
};
