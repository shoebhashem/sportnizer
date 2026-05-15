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
  /** When true, also fetch events where userId is in groupAdminIds */
  includeGroupAdminEvents?: boolean;
  /** When true, also fetch events where userId is in coachIds */
  includeCoachEvents?: boolean;
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
  const {
    clubId,
    userId,
    includePastEvents = false,
    includeGroupAdminEvents = false,
    includeCoachEvents = false,
  } = options;

  try {
    const eventsRef = collection(db, "clubs", clubId, "events");

    const baseConstraints = [where("isActive", "==", true)];
    if (!includePastEvents) {
      baseConstraints.push(where("startDate", ">=", Timestamp.now()));
    }
    baseConstraints.push(orderBy("startDate", "asc"));

    // Query 1: events where user is invited
    const invitedQuery = query(
      eventsRef,
      where("invitedUserIds", "array-contains", userId),
      ...baseConstraints,
    );

    // Query 2: events created by user (catches events where creator is not in invitedUserIds,
    // and ensures group admins always see events they created for their group)
    const createdByQuery = query(
      eventsRef,
      where("createdBy", "==", userId),
      ...baseConstraints,
    );

    // Query 3 (optional): events where user is a group admin — enabled by permissions config
    const groupAdminQuery = includeGroupAdminEvents
      ? query(
          eventsRef,
          where("groupAdminIds", "array-contains", userId),
          ...baseConstraints,
        )
      : null;

    // Query 4 (optional): events where user is a coach — enabled by permissions config
    const coachQuery = includeCoachEvents
      ? query(
          eventsRef,
          where("coachIds", "array-contains", userId),
          ...baseConstraints,
        )
      : null;

    console.log(
      `🎧 Attaching event listeners (invited + createdBy${includeGroupAdminEvents ? " + groupAdmin" : ""}${includeCoachEvents ? " + coach" : ""}) for user ${userId} in club ${clubId}`,
    );

    // Shared maps to merge results from all listeners — keyed by event ID
    const invitedEvents = new Map<string, Event>();
    const createdEvents = new Map<string, Event>();
    const adminEvents = new Map<string, Event>();
    const coachEvents = new Map<string, Event>();

    const mapEvent = (doc: any): Event => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        clubId,
        clubName: data.targetScope?.clubName || "",
        groupName: data.targetScope?.groupName || "",
        subGroupName: data.targetScope?.subgroupName || "",
      } as Event;
    };

    const mergeAndEmit = () => {
      const merged = new Map<string, Event>();
      invitedEvents.forEach((e, id) => merged.set(id, e));
      createdEvents.forEach((e, id) => merged.set(id, e));
      adminEvents.forEach((e, id) => merged.set(id, e));
      coachEvents.forEach((e, id) => merged.set(id, e));
      const events = Array.from(merged.values()).sort(
        (a, b) => (a.startDate?.seconds ?? 0) - (b.startDate?.seconds ?? 0),
      );
      console.log(`📡 Event listener update: ${events.length} events received`);
      onEventsUpdate(events);
    };

    const unsub1 = onSnapshot(
      invitedQuery,
      (snapshot) => {
        invitedEvents.clear();
        snapshot.forEach((doc) => invitedEvents.set(doc.id, mapEvent(doc)));
        mergeAndEmit();
      },
      (error) => {
        console.error("❌ Event listener (invited) error:", error);
        if (onError) onError(error);
      },
    );

    const unsub2 = onSnapshot(
      createdByQuery,
      (snapshot) => {
        createdEvents.clear();
        snapshot.forEach((doc) => createdEvents.set(doc.id, mapEvent(doc)));
        mergeAndEmit();
      },
      (error) => {
        console.error("❌ Event listener (createdBy) error:", error);
        if (onError) onError(error);
      },
    );

    const unsubFns = [unsub1, unsub2];

    if (groupAdminQuery) {
      const unsub3 = onSnapshot(
        groupAdminQuery,
        (snapshot) => {
          adminEvents.clear();
          snapshot.forEach((doc) => adminEvents.set(doc.id, mapEvent(doc)));
          mergeAndEmit();
        },
        (error) => {
          console.error("❌ Event listener (groupAdmin) error:", error);
          if (onError) onError(error);
        },
      );
      unsubFns.push(unsub3);
    }

    if (coachQuery) {
      const unsub4 = onSnapshot(
        coachQuery,
        (snapshot) => {
          coachEvents.clear();
          snapshot.forEach((doc) => coachEvents.set(doc.id, mapEvent(doc)));
          mergeAndEmit();
        },
        (error) => {
          console.error("❌ Event listener (coach) error:", error);
          if (onError) onError(error);
        },
      );
      unsubFns.push(unsub4);
    }

    return () => unsubFns.forEach((u) => u());
  } catch (error) {
    console.error("❌ Failed to attach event listener:", error);
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
  const {
    clubId,
    userId,
    includePastEvents = false,
    includeGroupAdminEvents = false,
    includeCoachEvents = false,
  } = options;

  try {
    const eventsRef = collection(db, "clubs", clubId, "events");

    const baseConstraints = [where("isActive", "==", true)];
    if (!includePastEvents) {
      baseConstraints.push(where("startDate", ">=", Timestamp.now()));
    }
    baseConstraints.push(orderBy("startDate", "asc"));

    const snapPromises = [
      getDocs(
        query(
          eventsRef,
          where("invitedUserIds", "array-contains", userId),
          ...baseConstraints,
        ),
      ),
      getDocs(
        query(eventsRef, where("createdBy", "==", userId), ...baseConstraints),
      ),
    ];

    if (includeGroupAdminEvents) {
      snapPromises.push(
        getDocs(
          query(
            eventsRef,
            where("groupAdminIds", "array-contains", userId),
            ...baseConstraints,
          ),
        ),
      );
    }

    if (includeCoachEvents) {
      snapPromises.push(
        getDocs(
          query(
            eventsRef,
            where("coachIds", "array-contains", userId),
            ...baseConstraints,
          ),
        ),
      );
    }

    const snaps = await Promise.all(snapPromises);

    const merged = new Map<string, Event>();
    for (const snap of snaps) {
      snap.forEach((doc) => {
        const data = doc.data();
        merged.set(doc.id, {
          ...data,
          id: doc.id,
          clubId,
          clubName: data.targetScope?.clubName || "",
          groupName: data.targetScope?.groupName || "",
          subGroupName: data.targetScope?.subgroupName || "",
        } as Event);
      });
    }

    const events = Array.from(merged.values()).sort(
      (a, b) => (a.startDate?.seconds ?? 0) - (b.startDate?.seconds ?? 0),
    );

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
