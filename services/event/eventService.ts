// Event Service - Fetch and manage events for users
// Handles current week events, all upcoming events, past events, and event details

import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    Timestamp,
    where,
} from "firebase/firestore";
import { getCurrentUser } from "../auth/authService";
import { db } from "../core/firebase";
import type { EventData } from "../types/event";

/**
 * Get next 7 days of events (today + next 6 days)
 * Used for Home tab simplified view
 */
export async function getCurrentWeekEvents(): Promise<EventData[]> {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      throw new Error("User not authenticated");
    }

    // Calculate today and 7 days from now
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(today.getDate() + 6);
    sevenDaysFromNow.setHours(23, 59, 59, 999);

    console.log(
      `📅 Fetching next 7 days events: ${today.toLocaleDateString()} - ${sevenDaysFromNow.toLocaleDateString()}`,
    );

    return await getEventsInRange(currentUser.uid, today, sevenDaysFromNow);
  } catch (error) {
    console.error("Error fetching next 7 days events:", error);
    throw error;
  }
}

/**
 * Get all upcoming events (from today onwards)
 * Used for Events tab full list view
 */
export async function getAllUpcomingEvents(): Promise<EventData[]> {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      throw new Error("User not authenticated");
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    console.log(
      `📅 Fetching all upcoming events from: ${now.toLocaleDateString()}`,
    );

    return await getEventsInRange(currentUser.uid, now, null);
  } catch (error) {
    console.error("Error fetching upcoming events:", error);
    throw error;
  }
}

/**
 * Get past events (up to 6 months back)
 * Used for Events tab with filter
 */
export async function getPastEvents(): Promise<EventData[]> {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      throw new Error("User not authenticated");
    }

    const now = new Date();
    now.setHours(23, 59, 59, 999);

    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(now.getMonth() - 6);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    console.log(
      `📅 Fetching past events: ${sixMonthsAgo.toLocaleDateString()} - ${now.toLocaleDateString()}`,
    );

    return await getEventsInRange(currentUser.uid, sixMonthsAgo, now);
  } catch (error) {
    console.error("Error fetching past events:", error);
    throw error;
  }
}

/**
 * Get events within a date range for the current user
 * Filters by user's club/group memberships
 */
async function getEventsInRange(
  userId: string,
  startDate: Date,
  endDate: Date | null,
): Promise<EventData[]> {
  try {
    // Get user's clubs and groups
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) {
      console.warn("User document not found");
      return [];
    }

    const userData = userDoc.data();
    const clubAccess = userData.clubAccess || [];

    if (clubAccess.length === 0) {
      console.log("User has no club access");
      return [];
    }

    const allEvents: EventData[] = [];
    const eventIds = new Set<string>(); // Prevent duplicates

    // Query events for each club
    for (const club of clubAccess) {
      const clubId = club.clubId;
      const eventsRef = collection(db, "clubs", clubId, "events");

      // Option A: Use array-contains query to filter by invitedUserIds
      // This solves permission errors and drastically reduces read costs
      let eventsQuery;
      if (endDate) {
        // Date range query with invitedUserIds filter
        eventsQuery = query(
          eventsRef,
          where("invitedUserIds", "array-contains", userId),
          where("startDate", ">=", Timestamp.fromDate(startDate)),
          where("startDate", "<=", Timestamp.fromDate(endDate)),
          where("isActive", "==", true),
          orderBy("startDate", "asc"),
        );
      } else {
        // Open-ended query with invitedUserIds filter
        eventsQuery = query(
          eventsRef,
          where("invitedUserIds", "array-contains", userId),
          where("startDate", ">=", Timestamp.fromDate(startDate)),
          where("isActive", "==", true),
          orderBy("startDate", "asc"),
          limit(100), // Reasonable limit for performance
        );
      }

      const eventsSnapshot = await getDocs(eventsQuery);

      for (const eventDoc of eventsSnapshot.docs) {
        const eventData = eventDoc.data();

        // Skip duplicates
        if (eventIds.has(eventDoc.id)) {
          continue;
        }

        // User is guaranteed to be invited (filtered by query)
        // No need for additional invitation check

        eventIds.add(eventDoc.id);

        // Convert to EventData format
        allEvents.push({
          id: eventDoc.id,
          title: eventData.title || "Untitled Event",
          description: eventData.description || "",
          eventType: eventData.eventType || "other",
          clubId: eventData.targetScope?.clubId || clubId, // Extract from targetScope
          clubName: club.clubName || "",
          groupId: eventData.targetScope?.groupId || null,
          groupName: eventData.groupName || "",
          subGroupIds: eventData.targetScope?.subgroupId
            ? [eventData.targetScope.subgroupId]
            : [],
          subGroupName: eventData.subgroupName || "",
          startDate:
            eventData.startDate?.toDate?.()?.toISOString() ||
            new Date().toISOString(),
          startTime: eventData.startDate?.toDate?.()?.toISOString() || "",
          gatheringTime:
            eventData.gatheringTime?.toDate?.()?.toISOString() || null,
          endDate: eventData.endDate?.toDate?.()?.toISOString() || null,
          endTime: eventData.endDate?.toDate?.()?.toISOString() || null,
          location: eventData.location || "",
          targetScope: eventData.targetScope?.level || "club",
          capacityLimit: eventData.capacityLimit || null,
          responseDeadline:
            eventData.responseDeadline?.toDate?.()?.toISOString() || null,
          responses: eventData.responses || [],
          responseSummary: eventData.responseSummary || {
            totalInvited: eventData.invitedUserIds?.length || 0,
            accepted: 0,
            declined: 0,
            pending: eventData.invitedUserIds?.length || 0,
          },
          isActive: eventData.isActive !== false,
          status: eventData.status || "scheduled",
          createdAt: eventData.createdAt,
          createdBy: eventData.createdBy || "",
          lastModifiedAt: eventData.lastModifiedAt,
          version: eventData.version || 1,

          // Recurring event fields
          isRecurring: eventData.isRecurring || false,
          recurringEventId: eventData.recurringEventId || undefined,
          occurrenceIndex: eventData.occurrenceIndex ?? undefined,
        });
      }
    }

    // Sort by startDate (ascending - today to future)
    allEvents.sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );

    console.log(`✅ Found ${allEvents.length} events for user`);
    return allEvents;
  } catch (error) {
    console.error("Error fetching events in range:", error);
    throw error;
  }
}

/**
 * Get single event details
 */
export async function getEventDetails(
  eventId: string,
  clubId: string,
): Promise<EventData | null> {
  try {
    console.log("🔍 DEBUG [eventService.ts] - getEventDetails called:", {
      eventId,
      clubId,
      path: `clubs/${clubId}/events/${eventId}`,
    });
    const eventDoc = await getDoc(doc(db, "clubs", clubId, "events", eventId));

    if (!eventDoc.exists()) {
      console.warn(`Event ${eventId} not found`);
      return null;
    }

    const eventData = eventDoc.data();
    console.log("🔍 DEBUG [eventService.ts] - Event document data:", {
      eventId: eventDoc.id,
      clubIdParam: clubId,
      targetScopeClubId: eventData.targetScope?.clubId,
      targetScopeLevel: eventData.targetScope?.level,
      title: eventData.title,
    });

    return {
      id: eventDoc.id,
      title: eventData.title || "Untitled Event",
      description: eventData.description || "",
      eventType: eventData.eventType || "other",
      clubId: eventData.targetScope?.clubId || clubId,
      clubName: eventData.targetScope?.clubName || "",
      groupId: eventData.targetScope?.groupId || null,
      groupName: eventData.targetScope?.groupName || "",
      subGroupIds: eventData.targetScope?.subgroupId
        ? [eventData.targetScope.subgroupId]
        : [],
      subGroupName: eventData.subgroupName || "",
      startDate:
        eventData.startDate?.toDate?.()?.toISOString() ||
        new Date().toISOString(),
      startTime: eventData.startDate?.toDate?.()?.toISOString() || "",
      gatheringTime: eventData.gatheringTime?.toDate?.()?.toISOString() || null,
      endDate: eventData.endDate?.toDate?.()?.toISOString() || null,
      endTime: eventData.endDate?.toDate?.()?.toISOString() || null,
      location: eventData.location || "",
      targetScope: eventData.targetScope?.level || "club",
      capacityLimit: eventData.capacity?.max || null,
      responseDeadline:
        eventData.responseDeadline?.toDate?.()?.toISOString() || null,
      responses: eventData.responses || [],
      responseSummary: eventData.responseSummary || {
        totalInvited: eventData.invitedUserIds?.length || 0,
        accepted: 0,
        declined: 0,
        pending: eventData.invitedUserIds?.length || 0,
        attended: eventData.responseSummary?.attended || 0,
      },
      isActive: eventData.isActive !== false,
      status: eventData.status || "scheduled",
      createdAt: eventData.createdAt,
      createdBy: eventData.createdBy || "",
      lastModifiedAt: eventData.lastModifiedAt,
      version: eventData.version || 1,
      completedAt: eventData.completedAt?.toDate?.() || undefined,
      completedBy: eventData.completedBy || undefined,
      completedByName: eventData.completedByName || undefined,

      // Recurring event fields
      isRecurring: eventData.isRecurring || false,
      recurringEventId: eventData.recurringEventId || undefined,
      occurrenceIndex: eventData.occurrenceIndex ?? undefined,
    };
  } catch (error) {
    console.error("Error fetching event details:", error);
    throw error;
  }
}

/**
 * Get user's response for a specific event
 * Handles both adult members and guardians responding for youth
 */
export function getUserResponse(
  event: EventData,
  userId: string,
): {
  response: "pending" | "accepted" | "declined";
  isGuardian: boolean;
  youthMemberName?: string;
} | null {
  if (!event.responses) {
    return null;
  }

  // Check if user is directly invited (adult member)
  const directResponse = event.responses.find((r: any) => r.userId === userId);
  if (directResponse) {
    return {
      response: directResponse.response,
      isGuardian: false,
    };
  }

  // Check if user is a guardian for any youth members in this event
  const youthResponse = event.responses.find(
    (r: any) => r.isYouthMember && r.guardianIds?.includes(userId),
  );

  if (youthResponse) {
    return {
      response: youthResponse.response,
      isGuardian: true,
      youthMemberName: youthResponse.userName,
    };
  }

  return null;
}

/**
 * Filter events by type
 */
export function filterEventsByType(
  events: EventData[],
  eventType: "all" | "training" | "match" | "meeting" | "other",
): EventData[] {
  if (eventType === "all") {
    return events;
  }

  return events.filter((event) => event.eventType === eventType);
}

/**
 * Update event response (Accept/Decline)
 * This is a client-side wrapper that calls the Firebase Function
 */
export async function updateEventResponse(
  eventId: string,
  clubId: string,
  userId: string,
  response: "accepted" | "declined",
  respondedBy?: string,
  comment?: string,
): Promise<boolean> {
  try {
    console.log("🔍 DEBUG [eventService.ts] - updateEventResponse called:", {
      eventId,
      clubId,
      userId,
      response,
      respondedBy,
      comment,
    });

    // Import dynamically to avoid circular dependencies
    const { getFunctions, httpsCallable } = await import("firebase/functions");
    const functions = getFunctions(undefined, "europe-north1"); // Specify region where functions are deployed

    const updateResponse = httpsCallable<
      {
        eventId: string;
        clubId: string;
        userId: string;
        response: string;
        respondedBy?: string;
        comment?: string;
      },
      { success: boolean; message?: string }
    >(functions, "updateEventResponse");

    console.log("🔍 DEBUG [eventService.ts] - Sending to Firebase Function:", {
      eventId,
      clubId,
      userId,
      response,
      respondedBy,
      comment,
    });

    const result = await updateResponse({
      eventId,
      clubId,
      userId,
      response,
      ...(respondedBy && { respondedBy }),
      ...(comment !== undefined && { comment }),
    });

    return result.data.success;
  } catch (error: any) {
    console.error("Error updating event response:", error);
    throw new Error(error.message || "Failed to update response");
  }
}
