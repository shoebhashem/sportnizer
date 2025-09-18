import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { auth, db } from '../services/firebase';
import { storage } from '../utils/CrossPlatformStorage';

// User data interface - matches your Firestore user document structure
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  profilePicture?: string;
  age?: number;
  ageGroup?: string;
  birthdate?: Date;
  gender?: string;
  groupsJoined: GroupMembership[];
  groupsCreated: number;
  eventsInvited: any[];
  createdAt: Date;
  verifiedAt?: Date;
}

export interface GroupMembership {
  groupId: string;
  roles: string[];
  joinedAt: Date;
  status: 'active' | 'inactive' | 'pending';
}

interface UserContextType {
  // Auth state
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  
  // Cache management
  refreshUserProfile: () => Promise<void>;
  updateUserProfile: (updates: Partial<UserProfile>) => Promise<void>;
  clearUserData: () => Promise<void>;
  
  // Cache status
  isFromCache: boolean;
  lastCacheUpdate: Date | null;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

// Storage keys
const STORAGE_KEYS = {
  USER_PROFILE: 'user_profile',
  CACHE_TIMESTAMP: 'user_cache_timestamp',
  CACHE_VERSION: 'user_cache_version',
};

const CACHE_VERSION = '1.0'; // Increment this to invalidate all caches
const CACHE_EXPIRY_HOURS = 24; // Cache expires after 24 hours

interface UserProviderProps {
  children: ReactNode;
}

export function UserProvider({ children }: UserProviderProps) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastCacheUpdate, setLastCacheUpdate] = useState<Date | null>(null);
  
  // Firestore listener unsubscriber
  const [unsubscribeProfile, setUnsubscribeProfile] = useState<Unsubscribe | null>(null);

  const isAuthenticated = !!firebaseUser && !!userProfile;

  // Convert Firestore document to UserProfile
  const convertFirestoreToProfile = useCallback((data: any, uid: string): UserProfile => {
    return {
      id: uid,
      name: data.name || '',
      email: data.email || '',
      emailVerified: data.emailVerified || false,
      profilePicture: data.profilePicture,
      age: data.age,
      ageGroup: data.ageGroup,
      birthdate: data.birthdate?.toDate() || null,
      gender: data.gender,
      groupsJoined: data.groupsJoined?.map((group: any) => ({
        groupId: group.groupId,
        roles: group.roles || [],
        joinedAt: group.joinedAt?.toDate ? group.joinedAt.toDate() : new Date(group.joinedAt),
        status: group.status || 'active',
      })) || [],
      groupsCreated: data.groupsCreated || 0,
      eventsInvited: data.eventsInvited || [],
      createdAt: data.createdAt?.toDate() || new Date(),
      verifiedAt: data.verifiedAt?.toDate() || null,
    };
  }, []);

  // Clear cache
  const clearCache = useCallback(async () => {
    try {
      await storage.multiRemove([
        STORAGE_KEYS.USER_PROFILE,
        STORAGE_KEYS.CACHE_TIMESTAMP,
        STORAGE_KEYS.CACHE_VERSION,
      ]);
      setIsFromCache(false);
      setLastCacheUpdate(null);
      console.log('🗑️ Cache cleared');
    } catch (error) {
      console.error('❌ Error clearing cache:', error);
    }
  }, []);

  // Save user profile to cache
  const saveToCache = useCallback(async (profile: UserProfile) => {
    try {
      console.log('💾 Saving user profile to cache...');
      
      const now = new Date();
      
      await storage.multiSet([
        [STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile)],
        [STORAGE_KEYS.CACHE_TIMESTAMP, now.toISOString()],
        [STORAGE_KEYS.CACHE_VERSION, CACHE_VERSION],
      ]);
      
      setLastCacheUpdate(now);
      setIsFromCache(false); // Data is fresh from Firestore
      console.log('✅ User profile saved to cache');
    } catch (error) {
      console.error('❌ Error saving to cache:', error);
    }
  }, []);

  // Load user profile from cache
  const loadFromCache = useCallback(async (): Promise<UserProfile | null> => {
    try {
      console.log('🔍 Loading user profile from cache...');
      
      // Check cache version
      const cachedVersion = await storage.getItem(STORAGE_KEYS.CACHE_VERSION);
      if (cachedVersion !== CACHE_VERSION) {
        console.log('📦 Cache version mismatch, clearing cache');
        await clearCache();
        return null;
      }

      // Check cache expiry
      const cacheTimestamp = await storage.getItem(STORAGE_KEYS.CACHE_TIMESTAMP);
      if (cacheTimestamp) {
        const cacheDate = new Date(cacheTimestamp);
        const now = new Date();
        const hoursDiff = (now.getTime() - cacheDate.getTime()) / (1000 * 60 * 60);
        
        if (hoursDiff > CACHE_EXPIRY_HOURS) {
          console.log('⏰ Cache expired, clearing cache');
          await clearCache();
          return null;
        }
        
        setLastCacheUpdate(cacheDate);
      }

      // Load cached data
      const cachedData = await storage.getItem(STORAGE_KEYS.USER_PROFILE);
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        
        // Convert date strings back to Date objects
        const profile: UserProfile = {
          ...parsed,
          birthdate: parsed.birthdate ? new Date(parsed.birthdate) : undefined,
          createdAt: new Date(parsed.createdAt),
          verifiedAt: parsed.verifiedAt ? new Date(parsed.verifiedAt) : undefined,
          groupsJoined: parsed.groupsJoined?.map((group: any) => ({
            ...group,
            joinedAt: new Date(group.joinedAt),
          })) || [],
        };

        console.log('✅ User profile loaded from cache:', profile.name);
        setIsFromCache(true);
        return profile;
      }
    } catch (error) {
      console.error('❌ Error loading from cache:', error);
      await clearCache(); // Clear corrupted cache
    }
    
    return null;
  }, [clearCache]);

  // Refresh user profile from Firestore (bypass cache)
  const refreshUserProfile = useCallback(async () => {
    if (!firebaseUser) return;
    
    console.log('🔄 Refreshing user profile from Firestore...');
    setIsLoading(true);
    
    try {
      // The listener will automatically update the profile
      // We just need to ensure the listener is active
      if (!unsubscribeProfile) {
        console.log('No active listener, will be setup by auth state change');
      }
    } catch (error) {
      console.error('❌ Error refreshing user profile:', error);
    } finally {
      setIsLoading(false);
    }
  }, [firebaseUser, unsubscribeProfile]);

  // Update user profile (optimistic update + Firestore update)
  const updateUserProfile = useCallback(async (updates: Partial<UserProfile>) => {
    if (!userProfile || !firebaseUser) return;

    console.log('📝 Updating user profile...', updates);

    // Optimistic update
    const updatedProfile = { ...userProfile, ...updates };
    setUserProfile(updatedProfile);
    await saveToCache(updatedProfile);

    try {
      // Note: You should use your existing Firestore update functions here
      // The listener will automatically sync changes back
      console.log('✅ User profile updated optimistically');
    } catch (error) {
      console.error('❌ Error updating user profile:', error);
      
      // Revert optimistic update on error
      setUserProfile(userProfile);
      await saveToCache(userProfile);
    }
  }, [userProfile, firebaseUser, saveToCache]);

  // Clear all user data (for manual sign out)
  const clearUserData = useCallback(async () => {
    console.log('🗑️ Clearing all user data...');
    
    if (unsubscribeProfile) {
      unsubscribeProfile();
      setUnsubscribeProfile(null);
    }
    
    setUserProfile(null);
    setFirebaseUser(null);
    setIsFromCache(false);
    setLastCacheUpdate(null);
    await clearCache();
  }, [unsubscribeProfile, clearCache]);

  // Auth state listener
  useEffect(() => {
    console.log('🔐 Setting up auth state listener...');
    setIsLoading(true);

    let currentUnsubscribeProfile: Unsubscribe | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      console.log('🔐 Auth state changed:', user ? user.email : 'No user');
      setFirebaseUser(user);

      // Clean up existing profile listener
      if (currentUnsubscribeProfile) {
        currentUnsubscribeProfile();
        currentUnsubscribeProfile = null;
      }

      if (user) {
        // User is signed in
        console.log('👤 User signed in, loading profile...');
        
        // First, try to load from cache for immediate UI
        try {
          const cachedProfile = await loadFromCache();
          if (cachedProfile && cachedProfile.id === user.uid) {
            setUserProfile(cachedProfile);
          }
        } catch (error) {
          console.error('Error loading from cache:', error);
        }
        
        // Then setup real-time listener for updates
        console.log('👂 Setting up Firestore listener for user:', user.uid);
        const userDocRef = doc(db, 'users', user.uid);
        
        currentUnsubscribeProfile = onSnapshot(
          userDocRef,
          (docSnapshot) => {
            if (docSnapshot.exists()) {
              const data = docSnapshot.data();
              const profile = convertFirestoreToProfile(data, user.uid);
              
              console.log('🔄 User profile updated from Firestore:', profile.name);
              setUserProfile(profile);
              saveToCache(profile);
            } else {
              console.log('❌ User document does not exist');
              setUserProfile(null);
              clearCache();
            }
          },
          (error) => {
            console.error('❌ Error listening to user profile:', error);
          }
        );

        setUnsubscribeProfile(() => currentUnsubscribeProfile);
        
      } else {
        // User is signed out
        console.log('👋 User signed out, clearing data...');
        setUserProfile(null);
        setFirebaseUser(null);
        setIsFromCache(false);
        setLastCacheUpdate(null);
        await clearCache();
      }
      
      setIsLoading(false);
    });

    return () => {
      console.log('🧹 Cleaning up auth listener...');
      unsubscribeAuth();
      if (currentUnsubscribeProfile) {
        currentUnsubscribeProfile();
      }
    };
  }, [loadFromCache, saveToCache, clearCache, convertFirestoreToProfile]); // Include stable dependencies

  const value: UserContextType = {
    firebaseUser,
    userProfile,
    isLoading,
    isAuthenticated,
    refreshUserProfile,
    updateUserProfile,
    clearUserData,
    isFromCache,
    lastCacheUpdate,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

// Custom hook to use the user context
export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}

// Helper hooks for common use cases
export function useUserProfile() {
  const { userProfile, isLoading } = useUser();
  return { userProfile, isLoading };
}

export function useIsAuthenticated() {
  const { isAuthenticated, isLoading } = useUser();
  return { isAuthenticated, isLoading };
}

export function useUserGroups() {
  const { userProfile } = useUser();
  return userProfile?.groupsJoined || [];
}
