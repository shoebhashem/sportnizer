// /contexts/UserContext.tsx

import { User as FirebaseUser, onAuthStateChanged } from "firebase/auth";
import {
    doc,
    getDoc,
    onSnapshot,
    QueryDocumentSnapshot,
    Unsubscribe,
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

// Import domain types
import { AccessibleGroupData, fetchAccessibleGroups } from "@/services/group/fetchAccessibleGroupsService";
import { ClubMembership, GroupMembership, UserProfile } from "@/services/types/user";

// Import versioning services
import {
    fetchClubDataWithVersioning,
    fetchClubMembersWithVersioning,
    fetchUserClubMembershipsWithVersioning
} from "@/services/versioning/clubDataService";
import {
    fetchClubEventsWithVersioning,
    fetchEventDataWithVersioning,
    fetchUserEventsWithVersioning,
    fetchUserInvitedEventsWithVersioning
} from "@/services/versioning/eventDataService";
import {
    fetchGroupDataWithVersioning,
    fetchGroupMembersWithVersioning,
    fetchUserGroupMembershipsWithVersioning
} from "@/services/versioning/groupDataService";
import { clearAllVersionCache } from "@/services/versioning/versionCheckService";

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

  // Versioned data fetching methods
  fetchClubData: (clubId: string) => Promise<any>;
  fetchClubMembers: (clubId: string) => Promise<any>;
  fetchGroupData: (clubId: string, groupId: string) => Promise<any>;
  fetchGroupMembers: (clubId: string, groupId: string) => Promise<any>;
  fetchEventData: (clubId: string, eventId: string) => Promise<any>;
  fetchClubEvents: (clubId: string) => Promise<any>;
  fetchUserEvents: () => Promise<any>;
  fetchUserInvitedEvents: () => Promise<any>;
  refreshClubMemberships: () => Promise<void>;
  refreshGroupMemberships: () => Promise<void>;
  clearVersionCache: () => Promise<void>;
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

  // Refresh Firestore profile
  const refreshUserProfile = useCallback(async () => {
    if (!firebaseUser) return;
    setIsLoading(true);
    try {
      // Force a fresh fetch from Firestore
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const docSnapshot = await getDoc(userDocRef);
      
      if (docSnapshot.exists()) {
        const profile = convertFirestoreDataToUserProfile(docSnapshot);
        setUserProfile(profile);
        await saveToCache(profile);
        console.log('✅ User profile refreshed successfully');
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

  // Versioned data fetching methods
  const fetchClubData = useCallback(async (clubId: string) => {
    return await fetchClubDataWithVersioning(clubId);
  }, []);

  const fetchClubMembers = useCallback(async (clubId: string) => {
    return await fetchClubMembersWithVersioning(clubId);
  }, []);

  const fetchGroupData = useCallback(async (clubId: string, groupId: string) => {
    return await fetchGroupDataWithVersioning(clubId, groupId);
  }, []);

  const fetchGroupMembers = useCallback(async (clubId: string, groupId: string) => {
    return await fetchGroupMembersWithVersioning(clubId, groupId);
  }, []);

  const fetchEventData = useCallback(async (clubId: string, eventId: string) => {
    return await fetchEventDataWithVersioning(clubId, eventId);
  }, []);

  const fetchClubEvents = useCallback(async (clubId: string) => {
    return await fetchClubEventsWithVersioning(clubId);
  }, []);

  const fetchUserEvents = useCallback(async () => {
    // Get accessible club IDs based on user's memberships and permissions
    if (!userProfile?.clubs || userProfile.clubs.length === 0) {
      return { success: true, data: [] };
    }

    const accessibleClubIds = userProfile.clubs.map(club => club.clubId);
    return await fetchUserEventsWithVersioning(accessibleClubIds);
  }, [userProfile]);

  const fetchUserInvitedEvents = useCallback(async () => {
    // Get user's invited events (events where they are specifically invited)
    if (!userProfile?.uid || !userProfile?.clubs || userProfile.clubs.length === 0) {
      return { success: true, data: [] };
    }

    const accessibleClubIds = userProfile.clubs.map(club => club.clubId);
    return await fetchUserInvitedEventsWithVersioning(userProfile.uid, accessibleClubIds);
  }, [userProfile]);

  const refreshClubMemberships = useCallback(async () => {
    if (!userProfile?.clubs || userProfile.clubs.length === 0) return;

    console.log('🔄 Refreshing club memberships with versioning...');
    const result = await fetchUserClubMembershipsWithVersioning(userProfile.clubs);
    
    if (result.success && result.data) {
      const updatedProfile = {
        ...userProfile,
        clubs: result.data,
      };
      setUserProfile(updatedProfile);
      await saveToCache(updatedProfile);
      console.log('✅ Club memberships refreshed successfully');
    }
  }, [userProfile, saveToCache]);

  const refreshGroupMemberships = useCallback(async () => {
    if (!userProfile?.groupsJoined || userProfile.groupsJoined.length === 0) return;

    console.log('🔄 Refreshing group memberships with versioning...');
    const result = await fetchUserGroupMembershipsWithVersioning(userProfile.groupsJoined);
    
    if (result.success && result.data) {
      const updatedProfile = {
        ...userProfile,
        groupsJoined: result.data,
      };
      setUserProfile(updatedProfile);
      await saveToCache(updatedProfile);
      console.log('✅ Group memberships refreshed successfully');
    }
  }, [userProfile, saveToCache]);

  const clearVersionCache = useCallback(async () => {
    console.log('🗑️ Clearing version cache...');
    await clearAllVersionCache();
    console.log('✅ Version cache cleared');
  }, []);

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
    // Versioned data fetching methods
    fetchClubData,
    fetchClubMembers,
    fetchGroupData,
    fetchGroupMembers,
    fetchEventData,
    fetchClubEvents,
    fetchUserEvents,
    fetchUserInvitedEvents,
    refreshClubMemberships,
    refreshGroupMemberships,
    clearVersionCache,
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

/**
 * Hook for versioned data fetching from UserContext
 */
export function useVersionedData() {
  const { 
    fetchClubData, 
    fetchClubMembers, 
    fetchGroupData, 
    fetchGroupMembers,
    fetchEventData,
    fetchClubEvents,
    fetchUserEvents,
    fetchUserInvitedEvents,
    refreshClubMemberships,
    refreshGroupMemberships,
    clearVersionCache 
  } = useUser();

  return {
    fetchClubData,
    fetchClubMembers,
    fetchGroupData,
    fetchGroupMembers,
    fetchEventData,
    fetchClubEvents,
    fetchUserEvents,
    fetchUserInvitedEvents,
    refreshClubMemberships,
    refreshGroupMemberships,
    clearVersionCache,
  };
}
