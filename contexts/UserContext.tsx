// /contexts/UserContext.tsx

import { User as FirebaseUser, onAuthStateChanged } from "firebase/auth";
import {
    doc,
    getDoc,
    QueryDocumentSnapshot,
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
import { UserProfile } from "@/services/types/user";

// Import versioning services
import {
    fetchClubDataWithVersioning,
    fetchClubMembersWithVersioning
} from "@/services/versioning/clubDataService";
import {
    fetchClubEventsWithVersioning,
    fetchEventDataWithVersioning
} from "@/services/versioning/eventDataService";
import {
    fetchGroupDataWithVersioning,
    fetchGroupMembersWithVersioning
} from "@/services/versioning/groupDataService";
import { clearAllVersionCache } from "@/services/versioning/versionCheckService";

// Types for UserContext master document (enriched with full data)
interface UserClubMembership {
  clubId: string;
  clubName: string;
  role: string; // User's role in club
  joinedAt: Date;
  lastModifiedAt: Date;
  // Enriched data from club document
  clubData?: any; // Full club document data
}

interface UserGroupMembership {
  clubId: string;
  groupId: string;
  groupName: string;
  roles: string[]; // User's roles in group
  joinedAt: Date;
  lastModifiedAt: Date;
  // Enriched data from group document  
  groupData?: any; // Full group document data
}

interface UserContextType {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  userClubs: UserClubMembership[];
  userGroups: UserGroupMembership[];
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
  refreshUserMemberships: () => Promise<void>;
  buildUserClubsFromAccess: () => Promise<void>;
  buildUserGroupsFromAccess: () => Promise<void>;
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
    // New access-based structure - supports backward compatibility
    clubAccess: (data.clubAccess || data.clubs || []).map((club: any) => ({
      clubId: club.clubId,
      clubName: club.clubName,
      role: club.role || (club.isAdmin ? 'club-admin' : 'member'),
      joinedAt: club.joinedAt?.toDate ? club.joinedAt.toDate() : new Date(club.joinedAt),
      lastModifiedAt: club.lastModifiedAt?.toDate ? club.lastModifiedAt.toDate() : new Date(club.lastModifiedAt),
    })),
    groupAccess: (data.groupAccess || data.groupsJoined || []).map((group: any) => ({
      groupId: group.groupId,
      groupName: group.groupName,
      clubId: group.clubId,
      roles: group.roles || [],
      joinedAt: group.joinedAt?.toDate ? group.joinedAt.toDate() : new Date(group.joinedAt),
      lastModifiedAt: group.lastModifiedAt?.toDate ? group.lastModifiedAt.toDate() : new Date(group.lastModifiedAt),
    })),
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
  const [userClubs, setUserClubs] = useState<UserClubMembership[]>([]);
  const [userGroups, setUserGroups] = useState<UserGroupMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastCacheUpdate, setLastCacheUpdate] = useState<Date | null>(null);
  // Removed unsubscribeProfile - no longer using real-time listeners

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
    // No longer need to handle unsubscribeProfile
    setUserProfile(null);
    setUserClubs([]);
    setUserGroups([]);
    setFirebaseUser(null);
    setIsFromCache(false);
    setLastCacheUpdate(null);
    await clearCache();
  }, [clearCache]);

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
    // TODO: Implement with userClubs state instead of userProfile.clubs
    return { success: true, data: [] };
  }, []);

  const fetchUserInvitedEvents = useCallback(async () => {
    // TODO: Implement with userClubs state instead of userProfile.clubs
    return { success: true, data: [] };
  }, []);

  // Build master document: Fetch and enrich user's club access with full club data
  const buildUserClubsFromAccess = useCallback(async () => {
    if (!userProfile?.clubAccess || userProfile.clubAccess.length === 0) {
      setUserClubs([]);
      return;
    }

    console.log('🏢 Building user clubs from clubAccess...');
    
    try {
      const enrichedClubs: UserClubMembership[] = [];
      
      for (const clubAccess of userProfile.clubAccess) {
        try {
          // Fetch club data with versioning
          const clubDataResult = await fetchClubDataWithVersioning(clubAccess.clubId);
          
          enrichedClubs.push({
            clubId: clubAccess.clubId,
            clubName: clubAccess.clubName,
            role: clubAccess.role,
            joinedAt: clubAccess.joinedAt,
            lastModifiedAt: clubAccess.lastModifiedAt,
            clubData: clubDataResult.success ? clubDataResult.data : null,
          });
        } catch (clubError) {
          console.warn(`⚠️ Failed to fetch club ${clubAccess.clubId}, adding basic info only:`, clubError);
          
          // Add basic club info even if fetch fails (e.g., offline mode)
          enrichedClubs.push({
            clubId: clubAccess.clubId,
            clubName: clubAccess.clubName,
            role: clubAccess.role,
            joinedAt: clubAccess.joinedAt,
            lastModifiedAt: clubAccess.lastModifiedAt,
            clubData: null, // No enriched data available
          });
        }
      }
      
      setUserClubs(enrichedClubs);
      console.log(`✅ Built ${enrichedClubs.length} user clubs from access`);
      
    } catch (error) {
      console.error('❌ Error building user clubs:', error);
      // Even if there's an error, try to set basic clubs from access without enriched data
      const basicClubs = userProfile.clubAccess.map(clubAccess => ({
        clubId: clubAccess.clubId,
        clubName: clubAccess.clubName,
        role: clubAccess.role,
        joinedAt: clubAccess.joinedAt,
        lastModifiedAt: clubAccess.lastModifiedAt,
        clubData: null,
      }));
      setUserClubs(basicClubs);
      console.log(`⚠️ Set ${basicClubs.length} basic clubs after error`);
    }
  }, [userProfile?.clubAccess]);

  // Build master document: Fetch and enrich user's group access + club-admin group access
  const buildUserGroupsFromAccess = useCallback(async () => {
    if (!userProfile) {
      setUserGroups([]);
      return;
    }

    console.log('👥 Building user groups from access...');
    
    try {
      const enrichedGroups: UserGroupMembership[] = [];
      const processedGroupIds = new Set<string>();

      // 1. Add groups from direct groupAccess
      for (const groupAccess of userProfile.groupAccess || []) {
        if (!processedGroupIds.has(groupAccess.groupId)) {
          try {
            const groupDataResult = await fetchGroupDataWithVersioning(groupAccess.clubId, groupAccess.groupId);
            
            enrichedGroups.push({
              clubId: groupAccess.clubId,
              groupId: groupAccess.groupId,
              groupName: groupAccess.groupName,
              roles: groupAccess.roles,
              joinedAt: groupAccess.joinedAt,
              lastModifiedAt: groupAccess.lastModifiedAt,
              groupData: groupDataResult.success ? groupDataResult.data : null,
            });
            
            processedGroupIds.add(groupAccess.groupId);
          } catch (groupError) {
            console.warn(`⚠️ Failed to fetch group ${groupAccess.groupId}, adding basic info only:`, groupError);
            
            // Add basic group info even if fetch fails (e.g., offline mode)
            enrichedGroups.push({
              clubId: groupAccess.clubId,
              groupId: groupAccess.groupId,
              groupName: groupAccess.groupName,
              roles: groupAccess.roles,
              joinedAt: groupAccess.joinedAt,
              lastModifiedAt: groupAccess.lastModifiedAt,
              groupData: null, // No enriched data available
            });
            
            processedGroupIds.add(groupAccess.groupId);
          }
        }
      }

      // 2. Add ALL groups from clubs where user is club-admin
      for (const clubAccess of userProfile.clubAccess || []) {
        if (clubAccess.role === 'club-admin') {
          console.log(`� User is club-admin of ${clubAccess.clubName}, fetching all groups...`);
          
          // TODO: Implement fetchAllGroupsInClub with versioning
          // This should fetch all groups in the club and add them with club-admin privileges
          // For now, this is a placeholder
        }
      }

      setUserGroups(enrichedGroups);
      console.log(`✅ Built ${enrichedGroups.length} user groups from access`);
      
    } catch (error) {
      console.error('❌ Error building user groups:', error);
    }
  }, [userProfile]);

  // Refresh both clubs and groups (master document refresh)
  const refreshUserMemberships = useCallback(async () => {
    console.log('🔄 Refreshing user memberships (master document)...');
    await Promise.all([
      buildUserClubsFromAccess(),
      buildUserGroupsFromAccess(),
    ]);
    console.log('✅ Master document refresh completed');
  }, [buildUserClubsFromAccess, buildUserGroupsFromAccess]);

  const clearVersionCache = useCallback(async () => {
    console.log('🗑️ Clearing version cache...');
    await clearAllVersionCache();
    console.log('✅ Version cache cleared');
  }, []);

  // Trigger master document build when userProfile changes
  useEffect(() => {
    if (userProfile && (userProfile.clubAccess?.length > 0 || userProfile.groupAccess?.length > 0)) {
      console.log('🔄 UserProfile updated, rebuilding master document...');
      refreshUserMemberships();
    }
  }, [userProfile, refreshUserMemberships]);

  // 🔹 Auth + Manual Profile Fetching (No Real-time Listener)
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (user) {
        // Load cached user profile first
        const cached = await loadFromCache();
        if (cached && cached.uid === user.uid) {
          setUserProfile(cached);
        }
        
        // Manually fetch fresh profile data with version checking
        // This replaces the real-time listener approach
        try {
          await refreshUserProfile();
        } catch (error) {
          console.error("Error fetching user profile:", error);
          // If fresh fetch fails, keep cached data if available
          if (!cached) {
            setUserProfile(null);
          }
        }
      } else {
        setUserProfile(null);
        setUserClubs([]);
        setUserGroups([]);
        setFirebaseUser(null);
        clearCache();
      }
      setIsLoading(false);
    });

    return () => {
      unsubscribeAuth();
    };
  }, [loadFromCache, saveToCache, clearCache, refreshUserProfile]);

  const value: UserContextType = {
    firebaseUser,
    userProfile,
    userClubs,
    userGroups,
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
    refreshUserMemberships,
    buildUserClubsFromAccess,
    buildUserGroupsFromAccess,
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
  const { userClubs } = useUser();
  return userClubs;
}
export function useUserGroups() {
  const { userGroups } = useUser();
  return userGroups;
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
      groupsJoinedCount: 0, // TODO: Implement with versioning services
      clubs: 0 // TODO: Implement with versioning services
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
    refreshUserMemberships,
    buildUserClubsFromAccess,
    buildUserGroupsFromAccess,
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
    refreshUserMemberships,
    buildUserClubsFromAccess,
    buildUserGroupsFromAccess,
    clearVersionCache,
  };
}
