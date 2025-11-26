// /contexts/UserContext.tsx - Simplified version with user document version caching only

import { User as FirebaseUser, onAuthStateChanged } from "firebase/auth";
import {
    doc,
    updateDoc,
} from "firebase/firestore";
import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import { auth, db } from "../services/core/firebase";
import { storage } from "../utils/CrossPlatformStorage";

// Import domain types and services
import { fetchUserProfile } from "@/services/fetchUserAccess";
import { UserProfile } from "@/services/types/user";

// User Context Interface - Simplified for user document only
interface UserContextType {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isFromCache: boolean;
  lastCacheUpdate: Date | null;

  // User profile management
  refreshUserProfile: () => Promise<void>;
  updateUserProfile: (updates: Partial<UserProfile>) => Promise<void>;
  clearUserData: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

// Constants for version-based caching
const STORAGE_KEYS = {
  USER_PROFILE: 'user_profile_v2',
  USER_VERSION: 'user_version_v2',
  CACHE_TIMESTAMP: 'cache_timestamp_v2',
} as const;

interface UserProviderProps {
  children: ReactNode;
}

export function UserProvider({ children }: UserProviderProps) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastCacheUpdate, setLastCacheUpdate] = useState<Date | null>(null);

  const isAuthenticated = !!firebaseUser;

  // Cache management for user document only
  const clearCache = useCallback(async () => {
    await storage.multiRemove([
      STORAGE_KEYS.USER_PROFILE,
      STORAGE_KEYS.USER_VERSION,
      STORAGE_KEYS.CACHE_TIMESTAMP,
    ]);
    setIsFromCache(false);
    setLastCacheUpdate(null);
    console.log('🗑️ User cache cleared');
  }, []);

  const saveToCache = useCallback(async (profile: UserProfile) => {
    const now = new Date();
    await storage.multiSet([
      [STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile)],
      [STORAGE_KEYS.USER_VERSION, profile.version?.toString() || "1"],
      [STORAGE_KEYS.CACHE_TIMESTAMP, now.toISOString()],
    ]);
    setLastCacheUpdate(now);
    console.log(`💾 User profile cached with version ${profile.version}`);
  }, []);

  const loadFromCache = useCallback(async (): Promise<{ profile: UserProfile | null, cachedVersion: number }> => {
    try {
      const cachedData = await storage.getItem(STORAGE_KEYS.USER_PROFILE);
      const cachedVersionStr = await storage.getItem(STORAGE_KEYS.USER_VERSION);
      const cacheTimestamp = await storage.getItem(STORAGE_KEYS.CACHE_TIMESTAMP);
      
      if (!cachedData || !cachedVersionStr) {
        return { profile: null, cachedVersion: 0 };
      }

      const cachedVersion = parseInt(cachedVersionStr, 10) || 0;
      const profile = JSON.parse(cachedData) as UserProfile;
      
      if (cacheTimestamp) {
        const cacheDate = new Date(cacheTimestamp);
        setLastCacheUpdate(cacheDate);
      }

      console.log(`📱 Loaded user profile from cache, version: ${cachedVersion}`);
      return { profile, cachedVersion };
    } catch (error) {
      console.error('❌ Error loading from cache:', error);
      return { profile: null, cachedVersion: 0 };
    }
  }, []);

  // Update user profile in Firestore and update cache
  const updateUserProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!firebaseUser || !userProfile) {
        throw new Error("No authenticated user or profile");
      }

      const userRef = doc(db, "users", firebaseUser.uid);
      
      // Increment version for cache invalidation
      const updatedData = {
        ...updates,
        version: (userProfile.version || 1) + 1,
        lastActive: new Date(),
      };

      await updateDoc(userRef, updatedData);

      const updatedProfile: UserProfile = {
        ...userProfile,
        ...updatedData,
      };

      setUserProfile(updatedProfile);
      await saveToCache(updatedProfile);
    },
    [userProfile, firebaseUser, saveToCache]
  );

  const clearUserData = useCallback(async () => {
    setUserProfile(null);
    setFirebaseUser(null);
    setIsFromCache(false);
    setLastCacheUpdate(null);
    await clearCache();
  }, [clearCache]);

  // Version-based user profile fetching using fetchUserProfile service
  const checkAndFetchUserProfile = useCallback(async (): Promise<void> => {
    if (!firebaseUser) return;

    try {
      setIsLoading(true);
      
      // Load cached data first
      const { profile: cachedProfile, cachedVersion } = await loadFromCache();
      
      // Use fetchUserProfile service to get user document
      const userResponse = await fetchUserProfile(firebaseUser.uid);
      
      if (!userResponse.success || !userResponse.profile) {
        console.warn("❌ User document not found or error occurred:", userResponse.error);
        setUserProfile(null);
        return;
      }

      const currentVersion = userResponse.profile.version || 1;
      
      // If cached version matches current version, use cached data
      if (cachedProfile && cachedVersion >= currentVersion) {
        console.log(`📱 Using cached user profile (version ${cachedVersion})`);
        console.log(`📱 Cached profile clubAccess:`, cachedProfile.clubAccess);
        setUserProfile(cachedProfile);
        setIsFromCache(true);
        return;
      }

      // Version mismatch or no cache - use fresh data from service
      console.log(`🔄 Using fresh user profile from service (cached: ${cachedVersion}, current: ${currentVersion})`);
      console.log(`🔄 Fresh profile clubAccess:`, userResponse.profile.clubAccess);
      
      // Save to cache and update state
      await saveToCache(userResponse.profile);
      setUserProfile(userResponse.profile);
      setIsFromCache(false);
      
    } catch (error) {
      console.error("❌ Error checking/fetching user profile:", error);
      // Fallback to cached data if available
      const { profile: cachedProfile } = await loadFromCache();
      if (cachedProfile) {
        setUserProfile(cachedProfile);
        setIsFromCache(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [firebaseUser, loadFromCache, saveToCache]);

  // Auth state listener
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (user) {
        await checkAndFetchUserProfile();
      } else {
        setUserProfile(null);
        setIsFromCache(false);
        setLastCacheUpdate(null);
        await clearCache();
      }
    });

    return unsubscribeAuth;
  }, [checkAndFetchUserProfile, clearCache]);

  // Expose checkAndFetchUserProfile as refreshUserProfile
  const refreshUserProfile = useCallback(async () => {
    await checkAndFetchUserProfile();
  }, [checkAndFetchUserProfile]);

  const value: UserContextType = {
    firebaseUser,
    userProfile,
    isLoading,
    isAuthenticated,
    isFromCache,
    lastCacheUpdate,
    refreshUserProfile,
    updateUserProfile,
    clearUserData,
  };

  return (
    <UserContext.Provider value={value}>{children}</UserContext.Provider>
  );
}

// Hooks
export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within a UserProvider");
  return ctx;
}

export function useUserProfile() {
  const { userProfile, isLoading } = useUser();
  return { userProfile, isLoading };
}
