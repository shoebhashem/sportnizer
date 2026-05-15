/**
 * News Listener Service
 *
 * Manages Firestore real-time listeners for news updates.
 * Used by NewsContext for privileged users (admins/coaches) who need
 * real-time news updates.
 *
 * Regular users use cache + pull-to-refresh pattern.
 */

import { db } from "@/services/core/firebase";
import {
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    increment,
    onSnapshot,
    orderBy,
    query,
    Timestamp,
    updateDoc,
    where,
} from "firebase/firestore";

// ===============================================================================
// TYPESCRIPT INTERFACES
// ===============================================================================

export interface News {
  id: string;
  newsId: string;
  title: string;
  description: string;
  targetScope: {
    level: "club" | "group" | "subgroup";
    clubId: string;
    clubName: string;
    groupId?: string;
    groupName?: string;
    subgroupId?: string;
    subgroupName?: string;
  };
  recipientUserIds: string[];
  roleFilter?: string[] | null;
  emailDelivery: {
    enabled: boolean;
    sentAt?: Timestamp;
    sentCount?: number;
    failedCount?: number;
  };
  readBy?: {
    userId: string;
    userName?: string;
    readAt: Timestamp;
  }[];
  readCount?: number;
  commentCount?: number;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  isActive: boolean;
  version: number;
}

export interface NewsListenerOptions {
  clubId: string;
  userId: string;
  /** When true, also fetch news where userId is in groupAdminIds */
  includeGroupAdminNews?: boolean;
  /** When true, also fetch news where userId is in coachIds */
  includeCoachNews?: boolean;
}

// ===============================================================================
// NEWS LISTENER SERVICE
// ===============================================================================

/**
 * Attaches a real-time Firestore listener for user's news
 *
 * @param options - Listener configuration
 * @param onNewsUpdate - Callback when news changes
 * @param onError - Callback when error occurs
 * @returns Unsubscribe function to stop listening
 */
export function attachNewsListener(
  options: NewsListenerOptions,
  onNewsUpdate: (news: News[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const {
    clubId,
    userId,
    includeGroupAdminNews = false,
    includeCoachNews = false,
  } = options;

  try {
    const newsRef = collection(db, "clubs", clubId, "news");
    const baseConstraints = [
      where("isActive", "==", true),
      orderBy("createdAt", "desc"),
    ];

    // Query 1: news where user is a recipient
    const recipientQuery = query(
      newsRef,
      where("recipientUserIds", "array-contains", userId),
      ...baseConstraints,
    );

    // Query 2: news created by user
    const createdByQuery = query(
      newsRef,
      where("createdBy", "==", userId),
      ...baseConstraints,
    );

    // Query 3 (optional): news where user is a group admin
    const groupAdminQuery = includeGroupAdminNews
      ? query(
          newsRef,
          where("groupAdminIds", "array-contains", userId),
          ...baseConstraints,
        )
      : null;

    // Query 4 (optional): news where user is a coach
    const coachQuery = includeCoachNews
      ? query(
          newsRef,
          where("coachIds", "array-contains", userId),
          ...baseConstraints,
        )
      : null;

    console.log(
      `🎧 Attaching news listeners (recipient + createdBy${includeGroupAdminNews ? " + groupAdmin" : ""}${includeCoachNews ? " + coach" : ""}) for user ${userId} in club ${clubId}`,
    );

    const recipientItems = new Map<string, News>();
    const createdItems = new Map<string, News>();
    const adminItems = new Map<string, News>();
    const coachItems = new Map<string, News>();

    const mapNews = (doc: any): News => ({ id: doc.id, ...doc.data() }) as News;

    const mergeAndEmit = () => {
      const merged = new Map<string, News>();
      recipientItems.forEach((n, id) => merged.set(id, n));
      createdItems.forEach((n, id) => merged.set(id, n));
      adminItems.forEach((n, id) => merged.set(id, n));
      coachItems.forEach((n, id) => merged.set(id, n));
      const newsItems = Array.from(merged.values()).sort(
        (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0),
      );
      console.log(
        `📰 News listener: ${newsItems.length} items for club ${clubId}`,
      );
      onNewsUpdate(newsItems);
    };

    const unsub1 = onSnapshot(
      recipientQuery,
      (snapshot) => {
        recipientItems.clear();
        snapshot.forEach((doc) => recipientItems.set(doc.id, mapNews(doc)));
        mergeAndEmit();
      },
      (error) => {
        console.error("\u274c News listener (recipient) error:", error);
        onError?.(error);
      },
    );

    const unsub2 = onSnapshot(
      createdByQuery,
      (snapshot) => {
        createdItems.clear();
        snapshot.forEach((doc) => createdItems.set(doc.id, mapNews(doc)));
        mergeAndEmit();
      },
      (error) => {
        console.error("\u274c News listener (createdBy) error:", error);
        onError?.(error);
      },
    );

    const unsubFns = [unsub1, unsub2];

    if (groupAdminQuery) {
      const unsub3 = onSnapshot(
        groupAdminQuery,
        (snapshot) => {
          adminItems.clear();
          snapshot.forEach((doc) => adminItems.set(doc.id, mapNews(doc)));
          mergeAndEmit();
        },
        (error) => {
          console.error("\u274c News listener (groupAdmin) error:", error);
          onError?.(error);
        },
      );
      unsubFns.push(unsub3);
    }

    if (coachQuery) {
      const unsub4 = onSnapshot(
        coachQuery,
        (snapshot) => {
          coachItems.clear();
          snapshot.forEach((doc) => coachItems.set(doc.id, mapNews(doc)));
          mergeAndEmit();
        },
        (error) => {
          console.error("\u274c News listener (coach) error:", error);
          onError?.(error);
        },
      );
      unsubFns.push(unsub4);
    }

    return () => unsubFns.forEach((u) => u());
  } catch (error: any) {
    console.error("\u274c Failed to attach news listener:", error);
    onError?.(error);
    return () => {};
  }
}

/**
 * Fetch news for a club (one-time fetch, not real-time)
 */
export async function fetchNews(
  clubId: string,
  userId: string,
  options: { includeGroupAdminNews?: boolean; includeCoachNews?: boolean } = {},
): Promise<News[]> {
  try {
    const newsRef = collection(db, "clubs", clubId, "news");
    const baseConstraints = [
      where("isActive", "==", true),
      orderBy("createdAt", "desc"),
    ];

    const snapPromises = [
      getDocs(
        query(
          newsRef,
          where("recipientUserIds", "array-contains", userId),
          ...baseConstraints,
        ),
      ),
      getDocs(
        query(newsRef, where("createdBy", "==", userId), ...baseConstraints),
      ),
    ];

    if (options.includeGroupAdminNews) {
      snapPromises.push(
        getDocs(
          query(
            newsRef,
            where("groupAdminIds", "array-contains", userId),
            ...baseConstraints,
          ),
        ),
      );
    }
    if (options.includeCoachNews) {
      snapPromises.push(
        getDocs(
          query(
            newsRef,
            where("coachIds", "array-contains", userId),
            ...baseConstraints,
          ),
        ),
      );
    }

    const snaps = await Promise.all(snapPromises);
    const merged = new Map<string, News>();
    for (const snap of snaps) {
      snap.forEach((doc) =>
        merged.set(doc.id, { id: doc.id, ...doc.data() } as News),
      );
    }
    return Array.from(merged.values()).sort(
      (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0),
    );
  } catch (error: any) {
    console.error("❌ Failed to fetch news:", error);
    throw error;
  }
}

/**
 * Fetch a single news item
 */
export async function fetchNewsItem(
  clubId: string,
  newsId: string,
): Promise<News | null> {
  try {
    const newsRef = doc(db, "clubs", clubId, "news", newsId);
    const newsDoc = await getDoc(newsRef);

    if (!newsDoc.exists()) {
      return null;
    }

    return {
      id: newsDoc.id,
      ...newsDoc.data(),
    } as News;
  } catch (error: any) {
    console.error("❌ Failed to fetch news item:", error);
    throw error;
  }
}

/**
 * Mark news as read by user
 */
export async function markNewsAsRead(
  clubId: string,
  newsId: string,
  userId: string,
  userName?: string,
): Promise<void> {
  try {
    const newsRef = doc(db, "clubs", clubId, "news", newsId);

    await updateDoc(newsRef, {
      readBy: arrayUnion({
        userId,
        ...(userName ? { userName } : {}),
        readAt: Timestamp.now(),
      }),
      readCount: increment(1),
    });

    console.log(`✅ Marked news ${newsId} as read by user ${userId}`);
  } catch (error: any) {
    console.error("❌ Failed to mark news as read:", error);
    throw error;
  }
}

/**
 * Check if user has read a news item
 */
export function hasUserReadNews(news: News, userId: string): boolean {
  return news.readBy?.some((r) => r.userId === userId) ?? false;
}

/**
 * Delete news item (permanent delete)
 */
export async function deleteNews(
  clubId: string,
  newsId: string,
): Promise<void> {
  try {
    const newsRef = doc(db, "clubs", clubId, "news", newsId);
    await deleteDoc(newsRef);
    console.log(`✅ Deleted news ${newsId}`);
  } catch (error: any) {
    console.error("❌ Failed to delete news:", error);
    throw error;
  }
}

/**
 * Update news item
 */
export async function updateNews(
  clubId: string,
  newsId: string,
  updates: {
    title?: string;
    description?: string;
  },
): Promise<void> {
  try {
    const newsRef = doc(db, "clubs", clubId, "news", newsId);
    await updateDoc(newsRef, {
      ...updates,
      updatedAt: Timestamp.now(),
    });
    console.log(`✅ Updated news ${newsId}`);
  } catch (error: any) {
    console.error("❌ Failed to update news:", error);
    throw error;
  }
}
