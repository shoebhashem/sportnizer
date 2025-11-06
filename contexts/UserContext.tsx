// /contexts/UserContext.tsx

import { User as FirebaseUser, onAuthStateChanged } from "firebase/auth";
import {
    doc,
    onSnapshot,
    QueryDocumentSnapshot,
    Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import { auth, db, functions } from "../services/core/firebase";
import { storage } from "../utils/CrossPlatformStorage";

// Import domain types
import { AccessibleGroupData, fetchAccessibleGroups } from "@/services/group/fetchAccessibleGroupsService";
import { ClubMembership, GroupMembership, UserProfile } from "@/services/types/user";

// Import Firebase Function types
import type { GetUserProfileRequest, GetUserProfileResponse } from "@/functions/src/types/interfaces";

interface UserContextType {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  refreshUserProfile: () => Promise<void>;
  updateUserProfile: (updates: Partial<UserProfile>) => Promise<void>;
  clearUserData: () => Promise<void>;

  isFromCache: boolean;
  lastCacheUpdate: Date | null;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

// Helper function to convert Firestore data to UserProfile
const convertFirestoreDataToUserProfile = (snapshot: QueryDocumentSnapshot): UserProfile => {
  const data = snapshot.data();
  console.log('🔄 Converting Firestore data for user:', snapshot.id, {
    hasClubs: !!data.clubs,
    clubsCount: data.clubs?.length || 0,
    hasGroupsJoined: !!data.groupsJoined,
    groupsJoinedCount: data.groupsJoined?.length || 0
  });
  
  return {
    uid: snapshot.id,
    email: data.email,
    displayName: data.displayName || data.name || "",
    photoURL: data.photoURL || data.profilePicture,
    phoneNumber: data.phoneNumber,
    dateOfBirth: data.dateOfBirth ? data.dateOfBirth.toDate() : undefined,
    address: data.address,
    clubs:
      (data.clubs || []).map((club: any): ClubMembership => ({
        clubId: club.clubId,
        clubName: club.clubName,
        isAdmin: club.isAdmin,
        joinedAt: club.joinedAt?.toDate
          ? club.joinedAt.toDate()
          : new Date(club.joinedAt),
        lastModifiedAt: club.lastModifiedAt?.toDate
          ? club.lastModifiedAt.toDate()
          : new Date(club.lastModifiedAt),
      })) || [],
    groupsJoined:
      (data.groupsJoined || []).map((group: any): GroupMembership => ({
        clubId: group.clubId,
        groupId: group.groupId,
        groupName: group.groupName,
        roles: group.roles || [],
        joinedAt: group.joinedAt?.toDate
          ? group.joinedAt.toDate()
          : new Date(group.joinedAt),
        lastModifiedAt: group.lastModifiedAt?.toDate
          ? group.lastModifiedAt.toDate()
          : new Date(group.lastModifiedAt),
      })) || [],
    groupsCreated: data.groupsCreated ?? 0,
    events: data.events || [],
    eventsResponses: data.eventsResponses || [],
    emailVerified: data.emailVerified ?? false,
    verificationStatus: data.verificationStatus || "pending",
    createdAt: data.createdAt?.toDate() || new Date(),
    lastActive: data.lastActive?.toDate() || new Date(),
  };
};

// Storage keys for caching
const STORAGE_KEYS = {
  USER_PROFILE: "user_profile",
  CACHE_TIMESTAMP: "user_cache_timestamp",
  CACHE_VERSION: "user_cache_version",
};

const CACHE_VERSION = "2.0"; // bump when model changes
const CACHE_EXPIRY_HOURS = 24;

interface UserProviderProps {
  children: ReactNode;
}

export function UserProvider({ children }: UserProviderProps) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastCacheUpdate, setLastCacheUpdate] = useState<Date | null>(null);
  const [unsubscribeProfile, setUnsubscribeProfile] =
    useState<Unsubscribe | null>(null);

  const isAuthenticated = !!firebaseUser && !!userProfile;

  // Cache management
  const clearCache = useCallback(async () => {
    await storage.multiRemove([
      STORAGE_KEYS.USER_PROFILE,
      STORAGE_KEYS.CACHE_TIMESTAMP,
      STORAGE_KEYS.CACHE_VERSION,
    ]);
    setIsFromCache(false);
    setLastCacheUpdate(null);
  }, []);

  const saveToCache = useCallback(async (profile: UserProfile) => {
    const now = new Date();
    await storage.multiSet([
      [STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile)],
      [STORAGE_KEYS.CACHE_TIMESTAMP, now.toISOString()],
      [STORAGE_KEYS.CACHE_VERSION, CACHE_VERSION],
    ]);
    setLastCacheUpdate(now);
    setIsFromCache(false);
  }, []);

  const loadFromCache = useCallback(async (): Promise<UserProfile | null> => {
    const cachedVersion = await storage.getItem(STORAGE_KEYS.CACHE_VERSION);
    if (cachedVersion !== CACHE_VERSION) {
      await clearCache();
      return null;
    }
    const cacheTimestamp = await storage.getItem(STORAGE_KEYS.CACHE_TIMESTAMP);
    if (cacheTimestamp) {
      const cacheDate = new Date(cacheTimestamp);
      const now = new Date();
      const hoursDiff = (now.getTime() - cacheDate.getTime()) / 36e5;
      if (hoursDiff > CACHE_EXPIRY_HOURS) {
        await clearCache();
        return null;
      }
      setLastCacheUpdate(cacheDate);
    }
    const cachedData = await storage.getItem(STORAGE_KEYS.USER_PROFILE);
    return cachedData ? (JSON.parse(cachedData) as UserProfile) : null;
  }, [clearCache]);

  // Refresh user profile using Firebase Function
  const refreshUserProfile = useCallback(async () => {
    if (!firebaseUser) return;
    setIsLoading(true);
    try {
      // Use Firebase Function to fetch user profile
      const getUserProfile = httpsCallable<GetUserProfileRequest, GetUserProfileResponse>(
        functions,
        'getUserProfile'
      );
      
      const result = await getUserProfile({
        uid: firebaseUser.uid
      });
      
      if (result.data.success && result.data.userProfile) {
        // Convert the raw Firestore data to UserProfile format
        const rawData = result.data.userProfile;
        const profile: UserProfile = {
          uid: rawData.uid,
          email: rawData.email,
          displayName: rawData.displayName || rawData.name || "",
          photoURL: rawData.photoURL || rawData.profilePicture,
          phoneNumber: rawData.phoneNumber,
          dateOfBirth: rawData.dateOfBirth ? new Date(rawData.dateOfBirth.seconds * 1000) : undefined,
          address: rawData.address,
          clubs: (rawData.clubs || []).map((club: any): ClubMembership => ({
            clubId: club.clubId,
            clubName: club.clubName,
            isAdmin: club.isAdmin,
            joinedAt: club.joinedAt ? new Date(club.joinedAt.seconds * 1000) : new Date(),
            lastModifiedAt: club.lastModifiedAt ? new Date(club.lastModifiedAt.seconds * 1000) : new Date(),
          })),
          groupsJoined: (rawData.groupsJoined || []).map((group: any): GroupMembership => ({
            clubId: group.clubId,
            groupId: group.groupId,
            groupName: group.groupName,
            roles: group.roles || [],
            joinedAt: group.joinedAt ? new Date(group.joinedAt.seconds * 1000) : new Date(),
            lastModifiedAt: group.lastModifiedAt ? new Date(group.lastModifiedAt.seconds * 1000) : new Date(),
          })),
          groupsCreated: rawData.groupsCreated ?? 0,
          events: rawData.events || [],
          eventsResponses: rawData.eventsResponses || [],
          emailVerified: rawData.emailVerified ?? false,
          verificationStatus: rawData.verificationStatus || "pending",
          createdAt: rawData.createdAt ? new Date(rawData.createdAt.seconds * 1000) : new Date(),
          lastActive: rawData.lastActive ? new Date(rawData.lastActive.seconds * 1000) : new Date(),
        };
        
        setUserProfile(profile);
        await saveToCache(profile);
        console.log('✅ User profile refreshed successfully via Firebase Function');
      } else {
        console.warn('⚠️ User profile not found during refresh');
        setUserProfile(null);
        await clearCache();
      }
    } catch (error) {
      console.error('❌ Error refreshing user profile:', error);
      throw error; // Re-throw so caller can handle
    } finally {
      setIsLoading(false);
    }
  }, [firebaseUser, saveToCache, clearCache]);

  // Update user profile (optimistic update)
  const updateUserProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!userProfile || !firebaseUser) return;
      const updatedProfile = { ...userProfile, ...updates };
      setUserProfile(updatedProfile);
      await saveToCache(updatedProfile);
    },
    [userProfile, firebaseUser, saveToCache]
  );

  const clearUserData = useCallback(async () => {
    if (unsubscribeProfile) unsubscribeProfile();
    setUserProfile(null);
    setFirebaseUser(null);
    setIsFromCache(false);
    setLastCacheUpdate(null);
    await clearCache();
  }, [unsubscribeProfile, clearCache]);

  // 🔹 Auth + Firestore listener
  useEffect(() => {
    let currentUnsubscribeProfile: Unsubscribe | null = null;
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (currentUnsubscribeProfile) {
        currentUnsubscribeProfile();
        currentUnsubscribeProfile = null;
      }

      if (user) {
        const cached = await loadFromCache();
        if (cached && cached.uid === user.uid) {
          setUserProfile(cached);
        }
        const userDocRef = doc(db, "users", user.uid);
        currentUnsubscribeProfile = onSnapshot(
          userDocRef,
          (docSnapshot) => {
            if (docSnapshot.exists()) {
              const profile = convertFirestoreDataToUserProfile(docSnapshot);
              setUserProfile(profile);
              saveToCache(profile);
            } else {
              setUserProfile(null);
              clearCache();
            }
          },
          (err) => console.error("Error listening to user profile:", err)
        );
        setUnsubscribeProfile(() => currentUnsubscribeProfile);
      } else {
        setUserProfile(null);
        setFirebaseUser(null);
        clearCache();
      }
      setIsLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (currentUnsubscribeProfile) currentUnsubscribeProfile();
    };
  }, [loadFromCache, saveToCache, clearCache]);

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
export function useUserClubs() {
  const { userProfile } = useUser();
  return userProfile?.clubs || [];
}
export function useUserGroups() {
  const { userProfile } = useUser();
  return userProfile?.groupsJoined || [];
}

/**
 * Hook that returns all groups accessible to the current user:
 * - Groups where user is a member (from groupsJoined)
 * - All groups in clubs where user is a club-admin
 */
export function useUserAccessibleGroups() {
  const { userProfile, isLoading } = useUser();
  const [accessibleGroups, setAccessibleGroups] = useState<AccessibleGroupData[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userProfile || isLoading) {
      return;
    }

    console.log('🔄 useUserAccessibleGroups: User profile changed, refetching groups...', {
      uid: userProfile.uid,
      groupsJoinedCount: userProfile.groupsJoined?.length || 0,
      clubs: userProfile.clubs?.length || 0
    });

    const fetchGroups = async () => {
      setIsLoadingGroups(true);
      setError(null);

      try {
        const result = await fetchAccessibleGroups(userProfile);
        if (result.success) {
          console.log('✅ Successfully fetched accessible groups:', result.groups.length);
          setAccessibleGroups(result.groups);
        } else {
          setError(result.error?.message || "Failed to fetch groups");
          setAccessibleGroups([]);
        }
      } catch (err) {
        console.error("Error in useUserAccessibleGroups:", err);
        setError("Failed to fetch groups");
        setAccessibleGroups([]);
      } finally {
        setIsLoadingGroups(false);
      }
    };

    fetchGroups();
  }, [userProfile, isLoading]);

  return {
    groups: accessibleGroups,
    isLoading: isLoadingGroups,
    error,
  };
}
