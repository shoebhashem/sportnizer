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
import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
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
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastCacheUpdate, setLastCacheUpdate] = useState<Date | null>(null);
  const [hasActiveListener, setHasActiveListener] = useState(false);
  const [isPrivileged, setIsPrivileged] = useState(false);

  // Refs for cleanup and rate limiting
  const listenerUnsubscribeRef = useRef<(() => void) | null>(null);
  const lastRefreshTimeRef = useRef<number>(0);

  // Get current club ID from user profile
  const currentClubId = userProfile?.clubAccess?.[0]?.clubId || null;

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
      clubId: string,
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

        console.log(`🔄 Fetching events for user ${userId} in club ${clubId}`);
        const eventList = await fetchEvents({
          clubId,
          userId,
          includePastEvents: true,
        });

        // Update state and cache
        setEvents(eventList);
        setIsFromCache(false);
        await saveToCache(eventList, clubId);

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
    [saveToCache, loadFromCache],
  );

  // ============================================================================
  // Real-Time Listener Management
  // ============================================================================

  const setupEventListener = useCallback(
    (userId: string, clubId: string) => {
      // Clean up existing listener
      if (listenerUnsubscribeRef.current) {
        listenerUnsubscribeRef.current();
        listenerUnsubscribeRef.current = null;
      }

      console.log(`🎧 Setting up real-time event listener`);

      const unsubscribe = attachEventListener(
        { clubId, userId, includePastEvents: true },
        (eventList) => {
          console.log(`📡 Received ${eventList.length} events via listener`);
          setEvents(eventList);
          setIsFromCache(false);
          saveToCache(eventList, clubId);
        },
        (error) => {
          console.error("❌ Event listener error:", error);
          // Fallback to manual fetch on error
          fetchEventsFromFirestore(userId, clubId);
        },
      );

      listenerUnsubscribeRef.current = unsubscribe;
      setHasActiveListener(true);
      setIsPrivileged(true); // All users with listeners get real-time updates
    },
    [saveToCache, fetchEventsFromFirestore],
  );

  // ============================================================================
  // Main Effect - Setup real-time listener
  // ============================================================================

  useEffect(() => {
    const setupEvents = async () => {
      if (!firebaseUser || !currentClubId) {
        // No user or no club - clear everything
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

        // Check if cache is valid for current club
        const cacheValidForClub = cachedClubId === currentClubId;

        if (cachedEvents.length > 0 && cacheValidForClub) {
          setEvents(cachedEvents);
          setIsFromCache(true);
          console.log(
            `📱 Showing ${cachedEvents.length} cached events while setting up listener`,
          );
        }

        // Setup real-time listener for all users
        console.log(`🎧 Setting up real-time listener for all users`);
        setupEventListener(firebaseUser.uid, currentClubId);
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
  }, [firebaseUser, currentClubId, loadFromCache, setupEventListener]);

  // ============================================================================
  // Public API
  // ============================================================================

  const refreshEvents = useCallback(async () => {
    if (!firebaseUser || !currentClubId) {
      console.log("⚠️ Cannot refresh: No user or club");
      return;
    }

    console.log("🔄 Manual refresh triggered");
    await fetchEventsFromFirestore(firebaseUser.uid, currentClubId);
  }, [firebaseUser, currentClubId, fetchEventsFromFirestore]);

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
