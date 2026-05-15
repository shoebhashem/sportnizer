/**
 * Event Context - Real-Time Event Management
 *
 * Implements real-time event fetching for all users:
 * - Real-time Firestore listeners for instant updates
 * - Cache for instant display on app startup
 * - Pull-to-refresh available for all users
 *
 * Benefits:
 * - Consistent UX (all users see real-time updates)
 * - Works offline (cached events)
 * - Efficient reads (listener only charged for changed documents)
 *
 * Pattern follows UserContext.tsx (version-based caching + cross-platform storage)
 */

import {
    attachEventListener,
    detachEventListener,
    Event,
    fetchEvents,
} from "@/services/event/eventListener";
import { storage } from "@/utils/CrossPlatformStorage";
import {
    getActiveClubIds,
    getActiveGroups,
    isClubAdmin,
} from "@/utils/permissionHelpers";
import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { useClubData } from "./ClubDataContext";
import { useUser } from "./UserContext";

// Event Context Interface
interface EventContextType {
  events: Event[];
  isLoading: boolean;
  isFromCache: boolean;
  lastCacheUpdate: Date | null;
  hasActiveListener: boolean;
  isPrivilegedUser: boolean;

  // Manual refresh (for pull-to-refresh)
  refreshEvents: () => Promise<void>;

  // Clear cache
  clearEventCache: () => Promise<void>;
}

const EventContext = createContext<EventContextType | undefined>(undefined);

// Constants for caching
const STORAGE_KEYS = {
  EVENTS: "events_cache_v1",
  EVENTS_VERSION: "events_version_v1",
  CACHE_TIMESTAMP: "events_cache_timestamp_v1",
  LAST_CLUB_ID: "events_last_club_id_v1",
} as const;

// Rate limiting for manual refresh (30 seconds minimum between refreshes)
const REFRESH_RATE_LIMIT_MS = 30 * 1000; // 30 seconds

interface EventProviderProps {
  children: ReactNode;
}

export function EventProvider({ children }: EventProviderProps) {
  const { firebaseUser, userProfile } = useUser();
  const { getClubPermissions } = useClubData();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastCacheUpdate, setLastCacheUpdate] = useState<Date | null>(null);
  const [hasActiveListener, setHasActiveListener] = useState(false);
  const [isPrivileged, setIsPrivileged] = useState(false);

  // Refs for cleanup and rate limiting
  const listenerUnsubscribeRef = useRef<(() => void) | null>(null);
  const lastRefreshTimeRef = useRef<number>(0);

  // Get all active club IDs from user profile (user may belong to multiple clubs)
  const activeClubIds = getActiveClubIds(userProfile);
  // Stable string key so useEffect only re-runs when club membership changes
  const clubIdsKey = activeClubIds.join(",");

  // ============================================================================
  // Cache Management
  // ============================================================================

  const clearCache = useCallback(async () => {
    await storage.multiRemove([
      STORAGE_KEYS.EVENTS,
      STORAGE_KEYS.EVENTS_VERSION,
      STORAGE_KEYS.CACHE_TIMESTAMP,
      STORAGE_KEYS.LAST_CLUB_ID,
    ]);
    setIsFromCache(false);
    setLastCacheUpdate(null);
    console.log("🗑️ Event cache cleared");
  }, []);

  const saveToCache = useCallback(
    async (eventList: Event[], clubId: string) => {
      const now = new Date();

      // Calculate max version from events (for cache invalidation)
      const maxVersion = eventList.reduce(
        (max, event) => Math.max(max, event.version || 0),
        0,
      );

      await storage.multiSet([
        [STORAGE_KEYS.EVENTS, JSON.stringify(eventList)],
        [STORAGE_KEYS.EVENTS_VERSION, maxVersion.toString()],
        [STORAGE_KEYS.CACHE_TIMESTAMP, now.toISOString()],
        [STORAGE_KEYS.LAST_CLUB_ID, clubId],
      ]);

      setLastCacheUpdate(now);
      console.log(
        `💾 Cached ${eventList.length} events (max version: ${maxVersion})`,
      );
    },
    [],
  );

  const loadFromCache = useCallback(async (): Promise<{
    events: Event[];
    cachedVersion: number;
    cacheAge: number;
    cachedClubId: string | null;
  }> => {
    try {
      const cachedData = await storage.getItem(STORAGE_KEYS.EVENTS);
      const cachedVersionStr = await storage.getItem(
        STORAGE_KEYS.EVENTS_VERSION,
      );
      const cacheTimestamp = await storage.getItem(
        STORAGE_KEYS.CACHE_TIMESTAMP,
      );
      const cachedClubId = await storage.getItem(STORAGE_KEYS.LAST_CLUB_ID);

      if (!cachedData || !cachedVersionStr) {
        return {
          events: [],
          cachedVersion: 0,
          cacheAge: Infinity,
          cachedClubId: null,
        };
      }

      const cachedVersion = parseInt(cachedVersionStr, 10) || 0;
      const eventList = JSON.parse(cachedData) as Event[];

      let cacheAge = Infinity;
      if (cacheTimestamp) {
        const cacheDate = new Date(cacheTimestamp);
        cacheAge = Date.now() - cacheDate.getTime();
        setLastCacheUpdate(cacheDate);
      }

      console.log(
        `📱 Loaded ${eventList.length} events from cache (version: ${cachedVersion}, age: ${Math.round(cacheAge / 1000)}s)`,
      );
      return { events: eventList, cachedVersion, cacheAge, cachedClubId };
    } catch (error) {
      console.error("❌ Error loading from cache:", error);
      return {
        events: [],
        cachedVersion: 0,
        cacheAge: Infinity,
        cachedClubId: null,
      };
    }
  }, []);

  // ============================================================================
  // Event Fetching
  // ============================================================================

  const fetchEventsFromFirestore = useCallback(
    async (
      userId: string,
      clubIds: string[],
      forceRefresh: boolean = false,
    ): Promise<void> => {
      // Rate limiting check
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshTimeRef.current;

      if (!forceRefresh && timeSinceLastRefresh < REFRESH_RATE_LIMIT_MS) {
        const remainingSeconds = Math.ceil(
          (REFRESH_RATE_LIMIT_MS - timeSinceLastRefresh) / 1000,
        );
        console.log(
          `⏱️ Rate limited: Please wait ${remainingSeconds}s before refreshing again`,
        );
        return;
      }

      try {
        setIsLoading(true);

        console.log(
          `🔄 Fetching events for user ${userId} across ${clubIds.length} club(s)`,
        );
        const results = await Promise.all(
          clubIds.map((clubId) => {
            const permissions = getClubPermissions(clubId);
            const visEvents = permissions.events.visibility;
            const isAdmin = isClubAdmin(userProfile, clubId);
            const isGroupAdminInClub = getActiveGroups(
              userProfile,
              clubId,
            ).some((g) => g.roles.includes("admin"));
            const isCoachInClub = getActiveGroups(userProfile, clubId).some(
              (g) => g.roles.includes("coach"),
            );
            const includeAllClubAdminEvents = isAdmin && visEvents.clubAdmin;
            const includeGroupAdminEvents =
              isGroupAdminInClub && visEvents.groupAdmin;
            const includeCoachEvents = isCoachInClub && visEvents.coach;
            return fetchEvents({
              clubId,
              userId,
              includePastEvents: true,
              includeAllClubAdminEvents,
              includeGroupAdminEvents,
              includeCoachEvents,
            });
          }),
        );

        // Merge and deduplicate across clubs
        const merged = new Map<string, Event>();
        results.flat().forEach((e) => merged.set(e.id, e));
        const eventList = Array.from(merged.values()).sort(
          (a, b) => (a.startDate?.seconds ?? 0) - (b.startDate?.seconds ?? 0),
        );

        // Update state and cache (use first clubId as cache key)
        setEvents(eventList);
        setIsFromCache(false);
        await saveToCache(eventList, clubIds[0]);

        // Update rate limit timestamp
        lastRefreshTimeRef.current = now;

        console.log(`✅ Fetched ${eventList.length} events`);
      } catch (error) {
        console.error("❌ Error fetching events:", error);

        // Fallback to cache if available
        const { events: cachedEvents } = await loadFromCache();
        if (cachedEvents.length > 0) {
          setEvents(cachedEvents);
          setIsFromCache(true);
          console.log(
            `📱 Using cached events as fallback (${cachedEvents.length} events)`,
          );
        }
      } finally {
        setIsLoading(false);
      }
    },
    [saveToCache, loadFromCache, userProfile, getClubPermissions],
  );

  // ============================================================================
  // Real-Time Listener Management
  // ============================================================================

  const setupEventListener = useCallback(
    (userId: string, clubIds: string[]) => {
      // Clean up existing listener
      if (listenerUnsubscribeRef.current) {
        listenerUnsubscribeRef.current();
        listenerUnsubscribeRef.current = null;
      }

      console.log(
        `🎧 Setting up real-time event listeners for ${clubIds.length} club(s)`,
      );

      // Shared merged state across all club listeners
      const clubEventMaps = new Map<string, Map<string, Event>>();
      clubIds.forEach((id) => clubEventMaps.set(id, new Map()));

      const emitMerged = () => {
        const merged = new Map<string, Event>();
        clubEventMaps.forEach((eventsMap) =>
          eventsMap.forEach((e, id) => merged.set(id, e)),
        );
        const eventList = Array.from(merged.values()).sort(
          (a, b) => (a.startDate?.seconds ?? 0) - (b.startDate?.seconds ?? 0),
        );
        console.log(`📡 Received ${eventList.length} events via listener`);
        setEvents(eventList);
        setIsFromCache(false);
        saveToCache(eventList, clubIds[0]);
      };

      const unsubscribers = clubIds.map((clubId) => {
        const permissions = getClubPermissions(clubId);
        const visEvents = permissions.events.visibility;

        // Determine if this user should receive the groupAdminIds query for this club
        const isAdmin = isClubAdmin(userProfile, clubId);
        const isGroupAdmin = getActiveGroups(userProfile, clubId).some((g) =>
          g.roles.includes("admin"),
        );
        const isCoach = getActiveGroups(userProfile, clubId).some((g) =>
          g.roles.includes("coach"),
        );
        const includeAllClubAdminEvents = isAdmin && visEvents.clubAdmin;
        const includeGroupAdminEvents = isGroupAdmin && visEvents.groupAdmin;
        const includeCoachEvents = isCoach && visEvents.coach;

        return attachEventListener(
          {
            clubId,
            userId,
            includePastEvents: true,
            includeAllClubAdminEvents,
            includeGroupAdminEvents,
            includeCoachEvents,
          },
          (eventList) => {
            const mapForClub = clubEventMaps.get(clubId)!;
            mapForClub.clear();
            eventList.forEach((e) => mapForClub.set(e.id, e));
            emitMerged();
          },
          (error) => {
            console.error(`❌ Event listener error for club ${clubId}:`, error);
            fetchEventsFromFirestore(userId, clubIds);
          },
        );
      });

      listenerUnsubscribeRef.current = () => unsubscribers.forEach((u) => u());
      setHasActiveListener(true);
      setIsPrivileged(true);
    },
    [saveToCache, fetchEventsFromFirestore, userProfile, getClubPermissions],
  );

  // ============================================================================
  // Main Effect - Setup real-time listener
  // ============================================================================

  useEffect(() => {
    const setupEvents = async () => {
      if (!firebaseUser || activeClubIds.length === 0) {
        // No user or no clubs - clear everything
        setEvents([]);
        setIsLoading(false);
        setIsPrivileged(false);

        // Cleanup listener
        if (listenerUnsubscribeRef.current) {
          listenerUnsubscribeRef.current();
          listenerUnsubscribeRef.current = null;
        }

        return;
      }

      try {
        setIsLoading(true);

        // Load cache first for instant display
        const { events: cachedEvents, cachedClubId } = await loadFromCache();

        // Cache is valid if it was saved for any of the user's current clubs
        const cacheValidForClub =
          cachedClubId != null && activeClubIds.includes(cachedClubId);

        if (cachedEvents.length > 0 && cacheValidForClub) {
          setEvents(cachedEvents);
          setIsFromCache(true);
          console.log(
            `📱 Showing ${cachedEvents.length} cached events while setting up listener`,
          );
        }

        // Setup real-time listeners across all clubs
        console.log(`🎧 Setting up real-time listeners for all users`);
        setupEventListener(firebaseUser.uid, activeClubIds);
      } catch (error) {
        console.error("❌ Error setting up events:", error);
      } finally {
        setIsLoading(false);
      }
    };

    setupEvents();

    // Cleanup on unmount or when dependencies change
    return () => {
      if (listenerUnsubscribeRef.current) {
        detachEventListener(listenerUnsubscribeRef.current);
        listenerUnsubscribeRef.current = null;
        setHasActiveListener(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, clubIdsKey, loadFromCache, setupEventListener]);

  // ============================================================================
  // Public API
  // ============================================================================

  const refreshEvents = useCallback(async () => {
    if (!firebaseUser || activeClubIds.length === 0) {
      console.log("⚠️ Cannot refresh: No user or club");
      return;
    }

    console.log("🔄 Manual refresh triggered");
    await fetchEventsFromFirestore(firebaseUser.uid, activeClubIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, clubIdsKey, fetchEventsFromFirestore]);

  const clearEventCache = useCallback(async () => {
    await clearCache();
    setEvents([]);
  }, [clearCache]);

  const value: EventContextType = {
    events,
    isLoading,
    isFromCache,
    lastCacheUpdate,
    hasActiveListener,
    isPrivilegedUser: isPrivileged,
    refreshEvents,
    clearEventCache,
  };

  return (
    <EventContext.Provider value={value}>{children}</EventContext.Provider>
  );
}

// Hooks
export function useEvents() {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error("useEvents must be used within an EventProvider");
  return ctx;
}
