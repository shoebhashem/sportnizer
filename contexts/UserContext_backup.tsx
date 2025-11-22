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

// Helper function to convert Firestore data to UserProfile
const convertFirestoreDataToUserProfile = (snapshot: QueryDocumentSnapshot): UserProfile => {
  const data = snapshot.data();
  
  return {
    uid: snapshot.id,
    email: data.email,
    displayName: data.displayName || data.name || "",
    photoURL: data.photoURL || data.profilePicture,
    phoneNumber: data.phoneNumber,
    dateOfBirth: data.dateOfBirth ? data.dateOfBirth.toDate() : undefined,
    address: data.address,
    version: data.version || 1, // Version field for caching
    // New nested access structure per ARCHITECTURE.md
    clubAccess: (data.clubAccess || []).map((club: any) => ({
      clubId: club.clubId,
      clubName: club.clubName,
      role: club.role,
      joinedAt: club.joinedAt?.toDate ? club.joinedAt.toDate() : new Date(club.joinedAt),
      lastModifiedAt: club.lastModifiedAt?.toDate ? club.lastModifiedAt.toDate() : new Date(club.lastModifiedAt),
      groupAccess: (club.groupAccess || []).map((group: any) => ({
        groupId: group.groupId,
        groupName: group.groupName,
        roles: group.roles || [],
        joinedAt: group.joinedAt?.toDate ? group.joinedAt.toDate() : new Date(group.joinedAt),
        lastModifiedAt: group.lastModifiedAt?.toDate ? group.lastModifiedAt.toDate() : new Date(group.lastModifiedAt),
        subGroups: group.subGroups || []
      })),
      eventAccess: (club.eventAccess || []).map((event: any) => ({
        eventId: event.eventId,
        eventName: event.eventName,
        startDate: event.startDate?.toDate ? event.startDate.toDate() : new Date(event.startDate),
        startTime: event.startTime,
        location: event.location,
        response: event.response || 'pending',
        targetScope: event.targetScope || 'club',
        targetId: event.targetId
      })),
      pollAccess: (club.pollAccess || []).map((poll: any) => ({
        pollId: poll.pollId,
        pollName: poll.pollName,
        response: poll.response || 'pending',
        targetScope: poll.targetScope || 'club'
      })),
      announcementAccess: (club.announcementAccess || []).map((announcement: any) => ({
        announcementId: announcement.announcementId,
        announcementName: announcement.announcementName,
        readAt: announcement.readAt?.toDate ? announcement.readAt.toDate() : undefined,
        targetScope: announcement.targetScope || 'club'
      }))
    })),
    verificationStatus: data.verificationStatus || "pending",
    emailVerified: data.emailVerified || false,
    createdAt: data.createdAt?.toDate() || new Date(),
    lastActive: data.lastActive?.toDate() || new Date(),
  };
};

// Storage keys for caching
const STORAGE_KEYS = {
  USER_PROFILE: "user_profile_v3",
  USER_VERSION: "user_version_v3",
  CACHE_TIMESTAMP: "user_cache_timestamp_v3",
};

interface UserProviderProps {
  children: ReactNode;
}

export function UserProvider({ children }: UserProviderProps) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastCacheUpdate, setLastCacheUpdate] = useState<Date | null>(null);

  const isAuthenticated = !!firebaseUser && !!userProfile;

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
    setUserProfile(null);
    setFirebaseUser(null);
    setIsFromCache(false);
    setLastCacheUpdate(null);
    await clearCache();
  }, [clearCache]);

  // Version-based user profile fetching with Firestore document version checking
  const checkAndFetchUserProfile = useCallback(async (): Promise<void> => {
    if (!firebaseUser) return;

    try {
      setIsLoading(true);
      
      // Load cached data first
      const { profile: cachedProfile, cachedVersion } = await loadFromCache();
      
      // Fetch user document to check current version
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const userSnap = await getDoc(userDocRef);
      
      if (!userSnap.exists()) {
        console.warn("❌ User document not found");
        setUserProfile(null);
        return;
      }

      const currentVersion = userSnap.data().version || 1;
      
      // If cached version matches current version, use cached data
      if (cachedProfile && cachedVersion >= currentVersion) {
        console.log(`📱 Using cached user profile (version ${cachedVersion})`);
        setUserProfile(cachedProfile);
        setIsFromCache(true);
        return;
      }

      // Version mismatch or no cache - fetch fresh data
      console.log(`🔄 Fetching fresh user profile (cached: ${cachedVersion}, current: ${currentVersion})`);
      const freshProfile = convertFirestoreDataToUserProfile(userSnap);
      
      // Save to cache and update state
      await saveToCache(freshProfile);
      setUserProfile(freshProfile);
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

      // 1. Add groups from nested clubAccess[].groupAccess[]
      for (const clubAccess of userProfile.clubAccess || []) {
        for (const groupAccess of clubAccess.groupAccess || []) {
          if (!processedGroupIds.has(groupAccess.groupId)) {
            try {
              const groupDataResult = await fetchGroupDataWithVersioning(clubAccess.clubId, groupAccess.groupId);
              
              // Prioritize name from Firestore document over cached name
              const finalGroupName = (groupDataResult.success && groupDataResult.data?.name) || 
                groupAccess.groupName || 
                `Group ${groupAccess.groupId.slice(-4)}`;
              
              console.log('🔍 Nested group name resolution:', {
                clubId: clubAccess.clubId,
                groupId: groupAccess.groupId,
                accessGroupName: groupAccess.groupName,
                docGroupName: groupDataResult.success ? groupDataResult.data?.name : null,
                finalGroupName,
                fetchSuccess: groupDataResult.success
              });
              
              enrichedGroups.push({
                clubId: clubAccess.clubId,
                groupId: groupAccess.groupId,
                groupName: finalGroupName,
                roles: groupAccess.roles,
                joinedAt: groupAccess.joinedAt,
                lastModifiedAt: groupAccess.lastModifiedAt,
                groupData: groupDataResult.success ? groupDataResult.data : null,
              });
              
              processedGroupIds.add(groupAccess.groupId);
            } catch (groupError) {
              console.warn(`⚠️ Failed to fetch nested group ${groupAccess.groupId}, adding basic info only:`, groupError);
              
              enrichedGroups.push({
                clubId: clubAccess.clubId,
                groupId: groupAccess.groupId,
                groupName: groupAccess.groupName || `Group ${groupAccess.groupId.slice(-4)}`,
                roles: groupAccess.roles,
                joinedAt: groupAccess.joinedAt,
                lastModifiedAt: groupAccess.lastModifiedAt,
                groupData: null,
              });
              
              processedGroupIds.add(groupAccess.groupId);
            }
          }
        }
      }

      // 2. Add groups from legacy flat groupAccess (for backward compatibility)
      for (const groupAccess of userProfile.groupAccess || []) {
        if (!processedGroupIds.has(groupAccess.groupId)) {
          try {
            const groupDataResult = await fetchGroupDataWithVersioning(groupAccess.clubId, groupAccess.groupId);
            
            // Prioritize name from Firestore document over cached name
            const finalGroupName = (groupDataResult.success && groupDataResult.data?.name) || 
              groupAccess.groupName || 
              `Group ${groupAccess.groupId.slice(-4)}`;
            
            console.log('🔍 Group name resolution:', {
              groupId: groupAccess.groupId,
              accessGroupName: groupAccess.groupName,
              docGroupName: groupDataResult.success ? groupDataResult.data?.name : null,
              finalGroupName,
              fetchSuccess: groupDataResult.success
            });
            
            enrichedGroups.push({
              clubId: groupAccess.clubId,
              groupId: groupAccess.groupId,
              groupName: finalGroupName,
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
