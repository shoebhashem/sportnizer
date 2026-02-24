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
    readAt: Timestamp;
  }[];
  readCount?: number;
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
  const { clubId, userId } = options;

  try {
    // Query for news the user can see
    const newsRef = collection(db, "clubs", clubId, "news");

    const newsQuery = query(
      newsRef,
      where("recipientUserIds", "array-contains", userId),
      where("isActive", "==", true),
      orderBy("createdAt", "desc"),
    );

    // Attach real-time listener
    const unsubscribe = onSnapshot(
      newsQuery,
      (snapshot) => {
        const newsItems: News[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as News[];

        console.log(
          `📰 News listener: ${newsItems.length} items for club ${clubId}`,
        );
        onNewsUpdate(newsItems);
      },
      (error) => {
        console.error("❌ News listener error:", error);
        onError?.(error);
      },
    );

    return unsubscribe;
  } catch (error: any) {
    console.error("❌ Failed to attach news listener:", error);
    onError?.(error);
    return () => {}; // Return no-op unsubscribe
  }
}

/**
 * Fetch news for a club (one-time fetch, not real-time)
 */
export async function fetchNews(
  clubId: string,
  userId: string,
): Promise<News[]> {
  try {
    const newsRef = collection(db, "clubs", clubId, "news");

    const newsQuery = query(
      newsRef,
      where("recipientUserIds", "array-contains", userId),
      where("isActive", "==", true),
      orderBy("createdAt", "desc"),
    );

    const snapshot = await getDocs(newsQuery);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as News[];
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
): Promise<void> {
  try {
    const newsRef = doc(db, "clubs", clubId, "news", newsId);

    await updateDoc(newsRef, {
      readBy: arrayUnion({
        userId,
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
