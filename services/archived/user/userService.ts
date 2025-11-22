import { User } from 'firebase/auth';
import { doc, getDoc, getFirestore, setDoc, Timestamp } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../../firebaseConfig';

// Enhanced group membership interface
export interface GroupMembership {
  groupId: string;
  roles: string[]; // e.g., ['admin', 'coach', 'member', 'guardian']
  joinedAt?: Date;
}

// Event invitation response interface
export interface EventInvitation {
  eventId: string;
  response: 'not replied' | 'accepted' | 'declined';
  invitedAt?: Date;
  respondedAt?: Date;
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  gender: 'male' | 'female' | 'other' | 'prefer-not-to-say';
  birthdate: Date;
  age?: number; // Calculated field for ad targeting
  ageGroup?: string; // Bucketed for privacy (18-24, 25-34, etc.)
  version: number; // Version field for cache optimization as per ARCHITECTURE.md
  createdAt: Date;
  groupsCreated: number;
  clubAccess: any[]; // Updated to new structure - will be empty initially
  eventsInvited: EventInvitation[]; // Track event invitation responses
  photoURL?: string; // URL to profile picture (default or uploaded) - standardized name
}

// Calculate age from birthdate
const calculateAge = (birthdate: Date): number => {
  const today = new Date();
  const birthDate = new Date(birthdate);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

// Calculate age group for privacy
const calculateAgeGroup = (age: number): string => {
  if (age < 18) return 'under-18';
  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  if (age <= 44) return '35-44';
  if (age <= 54) return '45-54';
  if (age <= 64) return '55-64';
  return '65+';
};

// Get default profile picture URL based on age
const getDefaultProfilePicture = async (age: number): Promise<string> => {
  try {
    const fileName = age < 18 ? 'defaults/child_profile_icon.png' : 'defaults/adult_profile_icon.png';
    const storageRef = ref(storage, fileName);
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  } catch (error) {
    console.error('Error getting default profile picture:', error);
    // Fallback to a default URL or empty string
    return '';
  }
};

// Create user profile in Firestore after successful authentication
export const createUserProfile = async (
  user: User, 
  additionalData: {
    name?: string;
    gender: 'male' | 'female' | 'other' | 'prefer-not-to-say';
    birthdate: Date;
  }
) => {
  try {
    const db = getFirestore();
    const userRef = doc(db, 'users', user.uid);
    
    // Calculate age and age group
    const age = calculateAge(additionalData.birthdate);
    const ageGroup = calculateAgeGroup(age);
    
    // Get default profile picture based on age
    const defaultProfilePicture = await getDefaultProfilePicture(age);
    
    const userProfile: Omit<UserProfile, 'id'> = {
      email: user.email || '',
      name: additionalData.name || user.email?.split('@')[0] || '',
      gender: additionalData.gender,
      birthdate: additionalData.birthdate,
      age: age,
      ageGroup: ageGroup,
      version: 1, // Start with version 1 as per ARCHITECTURE.md
      createdAt: new Date(),
      groupsCreated: 0,
      clubAccess: [], // Initialize as empty array according to ARCHITECTURE.md
      eventsInvited: [], // Initialize as empty EventInvitation array
      photoURL: defaultProfilePicture // Set default profile picture URL
    };

    await setDoc(userRef, {
      ...userProfile,
      createdAt: Timestamp.fromDate(userProfile.createdAt),
      birthdate: Timestamp.fromDate(userProfile.birthdate)
    });

    return { success: true, profile: { id: user.uid, ...userProfile } };
  } catch (error: any) {
    console.error('Error creating user profile:', error);
    return { 
      success: false, 
      error: {
        code: error.code,
        message: error.message
      }
    };
  }
};

// Get user profile from Firestore
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  try {
    const db = getFirestore();
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const data = userSnap.data();
      return {
        id: userSnap.id,
        email: data.email,
        name: data.displayName || data.name, // Read displayName first, then fall back to name
        gender: data.gender,
        birthdate: data.birthdate ? data.birthdate.toDate() : new Date(), // Handle null birthdate
        age: data.age,
        ageGroup: data.ageGroup,
        createdAt: data.createdAt ? data.createdAt.toDate() : new Date(), // Handle null createdAt
        groupsCreated: data.groupsCreated || 0,
        groupsJoined: data.groupsJoined || [], // Now supports GroupMembership array
        eventsInvited: data.eventsInvited || [], // Initialize if not present
        photoURL: data.photoURL
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
};

// Update user profile age (should be called periodically or on app updates)
export const updateUserAge = async (userId: string) => {
  try {
    const profile = await getUserProfile(userId);
    if (!profile) return { success: false };
    
    const newAge = calculateAge(profile.birthdate);
    const newAgeGroup = calculateAgeGroup(newAge);
    
    if (newAge !== profile.age) {
      const db = getFirestore();
      const userRef = doc(db, 'users', userId);
      
      await setDoc(userRef, {
        age: newAge,
        ageGroup: newAgeGroup
      }, { merge: true });
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error updating user age:', error);
    return { success: false };
  }
};

// Utility functions for the new schema

// Get user's roles in a specific group
export const getUserRolesInGroup = (userProfile: UserProfile, groupId: string): string[] => {
  const membership = userProfile.groupsJoined.find(group => group.groupId === groupId);
  return membership ? membership.roles : [];
};

// Check if user has a specific role in a group
export const userHasRoleInGroup = (userProfile: UserProfile, groupId: string, role: string): boolean => {
  const roles = getUserRolesInGroup(userProfile, groupId);
  return roles.includes(role);
};

// Add or update user's group membership
export const updateUserGroupMembership = (
  userProfile: UserProfile, 
  groupId: string, 
  roles: string[]
): GroupMembership[] => {
  const existingIndex = userProfile.groupsJoined.findIndex(group => group.groupId === groupId);
  
  if (existingIndex >= 0) {
    // Update existing membership
    const updated = [...userProfile.groupsJoined];
    updated[existingIndex] = {
      ...updated[existingIndex],
      roles: roles
    };
    return updated;
  } else {
    // Add new membership
    return [
      ...userProfile.groupsJoined,
      {
        groupId: groupId,
        roles: roles,
        joinedAt: new Date()
      }
    ];
  }
};

// Remove user from a group
export const removeUserFromGroup = (userProfile: UserProfile, groupId: string): GroupMembership[] => {
  return userProfile.groupsJoined.filter(group => group.groupId !== groupId);
};

// Update event invitation response
export const updateEventResponse = (
  userProfile: UserProfile,
  eventId: string,
  response: 'accepted' | 'declined'
): EventInvitation[] => {
  const existingIndex = userProfile.eventsInvited.findIndex(event => event.eventId === eventId);
  
  if (existingIndex >= 0) {
    // Update existing response
    const updated = [...userProfile.eventsInvited];
    updated[existingIndex] = {
      ...updated[existingIndex],
      response: response,
      respondedAt: new Date()
    };
    return updated;
  } else {
    // Add new event response
    return [
      ...userProfile.eventsInvited,
      {
        eventId: eventId,
        response: response,
        respondedAt: new Date()
      }
    ];
  }
};

// Get all groups where user has admin or coach role
export const getUserManagementGroups = (userProfile: UserProfile): GroupMembership[] => {
  return userProfile.groupsJoined.filter(group => 
    group.roles.some(role => ['admin', 'coach'].includes(role))
  );
};

// Get all groups where user is a guardian
export const getUserGuardianGroups = (userProfile: UserProfile): GroupMembership[] => {
  return userProfile.groupsJoined.filter(group => 
    group.roles.includes('guardian')
  );
};


// Update user profile with birthdate and recalculate age-dependent fields
export const updateUserBirthdate = async (
  userId: string, 
  birthdate: Date, 
  gender?: 'male' | 'female' | 'other' | 'prefer-not-to-say'
) => {
  try {
    const db = getFirestore();
    const userRef = doc(db, 'users', userId);
    
    // Calculate age and age group
    const age = calculateAge(birthdate);
    const ageGroup = calculateAgeGroup(age);
    
    // Get appropriate profile picture based on age
    const profilePicture = await getDefaultProfilePicture(age);
    
    const updateData: any = {
      birthdate: Timestamp.fromDate(birthdate),
      age: age,
      ageGroup: ageGroup,
      photoURL: profilePicture, // Update to age-appropriate default
    };
    
    // Include gender if provided
    if (gender) {
      updateData.gender = gender;
    }
    
    await setDoc(userRef, updateData, { merge: true });
    
    return { success: true };
  } catch (error: any) {
    console.error('Error updating user birthdate:', error);
    return { 
      success: false, 
      error: {
        code: error.code,
        message: error.message
      }
    };
  }
};


// Check if user profile is complete (has required fields filled)
export const isUserProfileComplete = (userProfile: UserProfile): boolean => {
  return userProfile.birthdate !== null && 
         userProfile.birthdate !== undefined && 
         userProfile.gender !== 'prefer-not-to-say';
};
