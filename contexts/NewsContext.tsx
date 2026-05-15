/**
 * News Context - Real-Time News Management
 *
 * Implements real-time news fetching for all users:
 * - Real-time Firestore listeners for instant updates
 * - Cache for instant display on app startup
 * - Pull-to-refresh available for all users
 * - Mark as read functionality
 *
 * Pattern follows EventContext.tsx (version-based caching + cross-platform storage)
 */

import {
    attachNewsListener,
    fetchNews,
    markNewsAsRead,
    News,
} from "@/services/news";
import { storage } from "@/utils/CrossPlatformStorage";
import { getActiveGroups, isClubAdmin } from "@/utils/permissionHelpers";
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

// News Context Interface
interface NewsContextType {
  news: News[];
  isLoading: boolean;
  isFromCache: boolean;
  lastCacheUpdate: Date | null;
  hasActiveListener: boolean;

  // Manual refresh (for pull-to-refresh)
  refreshNews: () => Promise<void>;

  // Mark news as read
  markAsRead: (clubId: string, newsId: string) => Promise<void>;

  // Clear cache
  clearNewsCache: () => Promise<void>;
}

const NewsContext = createContext<NewsContextType | undefined>(undefined);

// Constants for caching
const STORAGE_KEYS = {
  NEWS: "news_cache_v1",
  NEWS_VERSION: "news_version_v1",
  CACHE_TIMESTAMP: "news_cache_timestamp_v1",
  LAST_CLUB_ID: "news_last_club_id_v1",
} as const;

// Rate limiting for manual refresh (30 seconds minimum between refreshes)
const REFRESH_RATE_LIMIT_MS = 30 * 1000; // 30 seconds

interface NewsProviderProps {
  children: ReactNode;
}

export function NewsProvider({ children }: NewsProviderProps) {
  const { firebaseUser, userProfile } = useUser();
  const { getClubPermissions } = useClubData();
  const [news, setNews] = useState<News[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastCacheUpdate, setLastCacheUpdate] = useState<Date | null>(null);
  const [hasActiveListener, setHasActiveListener] = useState(false);

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
      STORAGE_KEYS.NEWS,
      STORAGE_KEYS.NEWS_VERSION,
      STORAGE_KEYS.CACHE_TIMESTAMP,
      STORAGE_KEYS.LAST_CLUB_ID,
    ]);
    setIsFromCache(false);
    setLastCacheUpdate(null);
    console.log("🗑️ News cache cleared");
  }, []);

  const saveToCache = useCallback(async (newsList: News[], clubId: string) => {
    const now = new Date();

    // Calculate max version from news (for cache invalidation)
    const maxVersion = newsList.reduce(
      (max, item) => Math.max(max, item.version || 0),
      0,
    );

    await storage.multiSet([
      [STORAGE_KEYS.NEWS, JSON.stringify(newsList)],
      [STORAGE_KEYS.NEWS_VERSION, maxVersion.toString()],
      [STORAGE_KEYS.CACHE_TIMESTAMP, now.toISOString()],
      [STORAGE_KEYS.LAST_CLUB_ID, clubId],
    ]);

    setLastCacheUpdate(now);
    console.log(
      `💾 Cached ${newsList.length} news items (max version: ${maxVersion})`,
    );
  }, []);

  const loadFromCache = useCallback(async (): Promise<{
    news: News[];
    cachedVersion: number;
    cacheAge: number;
    cachedClubId: string | null;
  }> => {
    try {
      const cachedData = await storage.getItem(STORAGE_KEYS.NEWS);
      const cachedVersionStr = await storage.getItem(STORAGE_KEYS.NEWS_VERSION);
      const cacheTimestamp = await storage.getItem(
        STORAGE_KEYS.CACHE_TIMESTAMP,
      );
      const cachedClubId = await storage.getItem(STORAGE_KEYS.LAST_CLUB_ID);

      if (!cachedData || !cachedVersionStr) {
        return {
          news: [],
          cachedVersion: 0,
          cacheAge: Infinity,
          cachedClubId: null,
        };
      }

      const cachedVersion = parseInt(cachedVersionStr, 10) || 0;
      const newsList = JSON.parse(cachedData) as News[];

      let cacheAge = Infinity;
      if (cacheTimestamp) {
        const cacheDate = new Date(cacheTimestamp);
        cacheAge = Date.now() - cacheDate.getTime();
        setLastCacheUpdate(cacheDate);
      }

      console.log(
        `📱 Loaded ${newsList.length} news from cache (version: ${cachedVersion}, age: ${Math.round(cacheAge / 1000)}s)`,
      );
      return { news: newsList, cachedVersion, cacheAge, cachedClubId };
    } catch (error) {
      console.error("❌ Error loading news from cache:", error);
      return {
        news: [],
        cachedVersion: 0,
        cacheAge: Infinity,
        cachedClubId: null,
      };
    }
  }, []);

  // ============================================================================
  // News Fetching
  // ============================================================================

  const fetchNewsFromFirestore = useCallback(
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

        console.log(`🔄 Fetching news for user ${userId} in club ${clubId}`);
        const permissions = getClubPermissions(clubId);
        const visNews = permissions.news.visibility;
        const isAdmin = isClubAdmin(userProfile, clubId);
        const isGroupAdmin = getActiveGroups(userProfile, clubId).some((g) =>
          g.roles.includes("admin"),
        );
        const isCoach = getActiveGroups(userProfile, clubId).some((g) =>
          g.roles.includes("coach"),
        );
        const includeAllClubAdminNews = isAdmin && visNews.clubAdmin;
        const includeGroupAdminNews = isGroupAdmin && visNews.groupAdmin;
        const includeCoachNews = isCoach && visNews.coach;
        const newsList = await fetchNews(clubId, userId, {
          includeAllClubAdminNews,
          includeGroupAdminNews,
          includeCoachNews,
        });

        // Update state and cache
        setNews(newsList);
        setIsFromCache(false);
        await saveToCache(newsList, clubId);

        // Update rate limit timestamp
        lastRefreshTimeRef.current = now;

        console.log(`✅ Fetched ${newsList.length} news items`);
      } catch (error) {
        console.error("❌ Error fetching news:", error);

        // Fallback to cache if available
        const { news: cachedNews } = await loadFromCache();
        if (cachedNews.length > 0) {
          setNews(cachedNews);
          setIsFromCache(true);
          console.log(
            `📱 Using cached news as fallback (${cachedNews.length} items)`,
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

  const setupNewsListener = useCallback(
    (userId: string, clubId: string) => {
      // Clean up existing listener
      if (listenerUnsubscribeRef.current) {
        listenerUnsubscribeRef.current();
        listenerUnsubscribeRef.current = null;
      }

      console.log(`🎧 Setting up real-time news listener`);

      const permissions = getClubPermissions(clubId);
      const visNews = permissions.news.visibility;
      const isAdmin = isClubAdmin(userProfile, clubId);
      const isGroupAdmin = getActiveGroups(userProfile, clubId).some((g) =>
        g.roles.includes("admin"),
      );
      const isCoach = getActiveGroups(userProfile, clubId).some((g) =>
        g.roles.includes("coach"),
      );
      const includeAllClubAdminNews = isAdmin && visNews.clubAdmin;
      const includeGroupAdminNews = isGroupAdmin && visNews.groupAdmin;
      const includeCoachNews = isCoach && visNews.coach;

      const unsubscribe = attachNewsListener(
        {
          clubId,
          userId,
          includeAllClubAdminNews,
          includeGroupAdminNews,
          includeCoachNews,
        },
        (newsList) => {
          console.log(`📡 Received ${newsList.length} news items via listener`);
          setNews(newsList);
          setIsFromCache(false);
          saveToCache(newsList, clubId);
        },
        (error) => {
          console.error("❌ News listener error:", error);
          // Fallback to manual fetch on error
          fetchNewsFromFirestore(userId, clubId);
        },
      );

      listenerUnsubscribeRef.current = unsubscribe;
      setHasActiveListener(true);
    },
    [saveToCache, fetchNewsFromFirestore, userProfile, getClubPermissions],
  );

  // ============================================================================
  // Main Effect - Setup real-time listener
  // ============================================================================

  useEffect(() => {
    const setupNews = async () => {
      if (!firebaseUser || !currentClubId) {
        // No user or no club - clear everything
        setNews([]);
        setIsLoading(false);

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
        const { news: cachedNews, cachedClubId } = await loadFromCache();

        // Check if cache is valid for current club
        const cacheValidForClub = cachedClubId === currentClubId;

        if (cachedNews.length > 0 && cacheValidForClub) {
          setNews(cachedNews);
          setIsFromCache(true);
          console.log(
            `📱 Showing ${cachedNews.length} cached news items while setting up listener`,
          );
        }

        // Setup real-time listener for all users
        console.log(`🎧 Setting up real-time listener for news`);
        setupNewsListener(firebaseUser.uid, currentClubId);
      } catch (error) {
        console.error("❌ Error setting up news:", error);
      } finally {
        setIsLoading(false);
      }
    };

    setupNews();

    // Cleanup on unmount or when dependencies change
    return () => {
      if (listenerUnsubscribeRef.current) {
        listenerUnsubscribeRef.current();
        listenerUnsubscribeRef.current = null;
        setHasActiveListener(false);
      }
    };
  }, [firebaseUser, currentClubId, loadFromCache, setupNewsListener]);

  // ============================================================================
  // Public API
  // ============================================================================

  const refreshNews = useCallback(async () => {
    if (!firebaseUser || !currentClubId) {
      console.log("⚠️ Cannot refresh news: No user or club");
      return;
    }

    console.log("🔄 Manual news refresh triggered");
    await fetchNewsFromFirestore(firebaseUser.uid, currentClubId);
  }, [firebaseUser, currentClubId, fetchNewsFromFirestore]);

  const markAsRead = useCallback(
    async (clubId: string, newsId: string) => {
      if (!firebaseUser) {
        console.log("⚠️ Cannot mark as read: No user");
        return;
      }

      try {
        await markNewsAsRead(
          clubId,
          newsId,
          firebaseUser.uid,
          userProfile?.displayName,
        );

        // Optimistically update local state
        setNews((prev) =>
          prev.map((item) =>
            item.id === newsId
              ? {
                  ...item,
                  readBy: [
                    ...(item.readBy || []),
                    {
                      userId: firebaseUser.uid,
                      userName: userProfile?.displayName,
                      readAt: new Date() as any,
                    },
                  ],
                  readCount: (item.readCount || 0) + 1,
                }
              : item,
          ),
        );
      } catch (error) {
        console.error("❌ Error marking news as read:", error);
      }
    },
    [firebaseUser, userProfile],
  );

  const clearNewsCache = useCallback(async () => {
    await clearCache();
    setNews([]);
  }, [clearCache]);

  const value: NewsContextType = {
    news,
    isLoading,
    isFromCache,
    lastCacheUpdate,
    hasActiveListener,
    refreshNews,
    markAsRead,
    clearNewsCache,
  };

  return <NewsContext.Provider value={value}>{children}</NewsContext.Provider>;
}

// Hooks
export function useNews() {
  const ctx = useContext(NewsContext);
  if (!ctx) throw new Error("useNews must be used within a NewsProvider");
  return ctx;
}
