/**
 * Event Listener Service
 *
 * Manages Firestore real-time listeners for event updates.
 * Used by EventContext for privileged users (admins/coaches) who need
 * real-time event updates as RSVPs come in.
 *
 * Regular users (players) don't use this - they use cache + pull-to-refresh.
 */

import { db } from "@/services/core/firebase";
import {
    collection,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    Timestamp,
    where,
} from "firebase/firestore";

export interface Event {
  id: string;
  title: string;
  description?: string;
  startDate: Timestamp;
  endDate?: Timestamp;
  location?: string;
  clubId: string;
  groupId?: string;
  createdBy: string;
  responses?: EventResponse[];
  responseSummary?: ResponseSummary;
  version: number;
  isActive: boolean;
  [key: string]: any;
}

export interface EventResponse {
  userId: string;
  userName: string;
  response: "accepted" | "declined" | "pending";
  respondedAt?: Timestamp;
}

export interface ResponseSummary {
  accepted: number;
  declined: number;
  pending: number;
  attended?: number;
}

export interface ListenerOptions {
  clubId: string;
  userId: string;
  includeGroupEvents?: boolean;
  includePastEvents?: boolean;
}

/**
 * Attaches a real-time Firestore listener for user's events
 *
 * @param options - Listener configuration
 * @param onEventsUpdate - Callback when events change
 * @param onError - Callback when error occurs
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * // In EventContext for privileged users:
 * const unsubscribe = attachEventListener(
 *   { clubId, userId },
 *   (events) => setEvents(events),
 *   (error) => console.error(error)
 * );
 *
 * // Cleanup on unmount:
 * return () => unsubscribe();
 */
export function attachEventListener(
  options: ListenerOptions,
  onEventsUpdate: (events: Event[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const { clubId, userId, includePastEvents = false } = options;

  try {
    // Build query for events user is invited to
    const eventsRef = collection(db, "clubs", clubId, "events");

    const constraints = [
      where("invitedUserIds", "array-contains", userId),
      where("isActive", "==", true),
    ];

    // Filter out past events unless explicitly requested
    if (!includePastEvents) {
      const now = Timestamp.now();
      constraints.push(where("startDate", ">=", now));
    }

    // Order by start time (ascending for upcoming events)
    constraints.push(orderBy("startDate", "asc"));

    const eventsQuery = query(eventsRef, ...constraints);

    console.log(
      `🎧 Attaching event listener for user ${userId} in club ${clubId}`,
    );

    // Attach real-time listener
    const unsubscribe = onSnapshot(
      eventsQuery,
      (snapshot) => {
        const events: Event[] = [];

        snapshot.forEach((doc) => {
          const data = doc.data();
          events.push({
            ...data,
            id: doc.id,
            clubId: clubId,
            clubName: data.targetScope?.clubName || "",
            groupName: data.targetScope?.groupName || "",
            subGroupName: data.targetScope?.subgroupName || "",
          } as Event);
        });

        console.log(
          `📡 Event listener update: ${events.length} events received`,
        );
        onEventsUpdate(events);
      },
      (error) => {
        console.error("❌ Event listener error:", error);

        // Call error callback if provided
        if (onError) {
          onError(error);
        }
      },
    );

    // Return unsubscribe function for cleanup
    return unsubscribe;
  } catch (error) {
    console.error("❌ Failed to attach event listener:", error);

    // Return no-op function if listener attachment fails
    return () => {};
  }
}

/**
 * Fetch events manually (used for cache refresh by regular users)
 * Same query as listener but returns promise instead of real-time updates
 *
 * @param options - Query configuration
 * @returns Promise<Event[]> - Array of events
 *
 * @example
 * // In EventContext for regular users:
 * const events = await fetchEvents({ clubId, userId });
 * saveToCache(events);
 */
export async function fetchEvents(options: ListenerOptions): Promise<Event[]> {
  const { clubId, userId, includePastEvents = false } = options;

  try {
    const eventsRef = collection(db, "clubs", clubId, "events");

    const constraints = [
      where("invitedUserIds", "array-contains", userId),
      where("isActive", "==", true),
    ];

    if (!includePastEvents) {
      const now = Timestamp.now();
      constraints.push(where("startDate", ">=", now));
    }

    constraints.push(orderBy("startDate", "asc"));

    const eventsQuery = query(eventsRef, ...constraints);
    const snapshot = await getDocs(eventsQuery);

    const events: Event[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      events.push({
        ...data,
        id: doc.id,
        clubId: clubId,
        clubName: data.targetScope?.clubName || "",
        groupName: data.targetScope?.groupName || "",
        subGroupName: data.targetScope?.subgroupName || "",
      } as Event);
    });

    console.log(`✅ Fetched ${events.length} events for user ${userId}`);
    return events;
  } catch (error) {
    console.error("❌ Error fetching events:", error);
    throw error;
  }
}

/**
 * Detach listener and cleanup (explicit cleanup function)
 *
 * @param unsubscribe - Unsubscribe function returned by attachEventListener
 *
 * @example
 * const unsubscribe = attachEventListener(...);
 * // Later when cleaning up:
 * detachEventListener(unsubscribe);
 */
export function detachEventListener(unsubscribe: () => void): void {
  try {
    unsubscribe();
    console.log(`🔇 Event listener detached`);
  } catch (error) {
    console.error("❌ Error detaching event listener:", error);
  }
}
