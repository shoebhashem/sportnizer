import { User } from 'firebase/auth';
import { doc, getDoc, getFirestore, setDoc, Timestamp } from 'firebase/firestore';

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  gender: 'male' | 'female' | 'other' | 'prefer-not-to-say';
  birthdate: Date;
  age?: number; // Calculated field for ad targeting
  ageGroup?: string; // Bucketed for privacy (18-24, 25-34, etc.)
  createdAt: Date;
  groupsCreated: number;
  groupsJoined: string[];
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
    
    const userProfile: Omit<UserProfile, 'id'> = {
      email: user.email || '',
      name: additionalData.name || user.email?.split('@')[0] || '',
      gender: additionalData.gender,
      birthdate: additionalData.birthdate,
      age: age,
      ageGroup: ageGroup,
      createdAt: new Date(),
      groupsCreated: 0,
      groupsJoined: []
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
        name: data.name,
        gender: data.gender,
        birthdate: data.birthdate.toDate(),
        age: data.age,
        ageGroup: data.ageGroup,
        createdAt: data.createdAt.toDate(),
        groupsCreated: data.groupsCreated || 0,
        groupsJoined: data.groupsJoined || []
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
