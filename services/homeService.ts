import {
    collection,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    limit,
    orderBy,
    query,
    Timestamp,
    updateDoc,
    where,
} from "firebase/firestore";

// Import Firebase app to ensure it's initialized
import { getCurrentUser } from "./authService";
import "./firebase";

// Data interfaces
export interface HomeEvent {
  id: string;
  type: "event" | "recurring-event";
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  gatheringTime?: Date; // Optional gathering time
  location: string;
  eventType: "practice" | "game" | "meeting" | "other";
  createdBy: string;
  recipientName: string; // Name of the user this invite is addressed to
  responses: {
    [userId: string]: {
      response: "accepted" | "declined" | "maybe";
      timestamp: any;
    };
  };
  recipientGroups: string[];
  isRecurring: boolean;
  recurringMasterId?: string;
}

export interface HomeAnnouncement {
  id: string;
  type: "announcement";
  title: string;
  message: string;
  createdBy: string;
  createdAt: Date;
  recipientGroups: string[];
  readBy: {
    [userId: string]: {
      timestamp: any;
    };
  };
  readStats: {
    totalReads: number;
    invitedCount: number;
  };
}

export interface HomePoll {
  id: string;
  type: "poll";
  question: string;
  description: string;
  options: string[];
  createdBy: string;
  createdAt: Date;
  closedAt?: Date;
  recipientGroups: string[];
  votes: {
    [optionIndex: number]: {
      [userId: string]: {
        timestamp: any;
      };
    };
  };
  voteStats: {
    [optionIndex: number]: number;
  };
}

export type NewsFlowItem = HomeAnnouncement | HomePoll;

/**
 * Service for fetching home screen data
 */
class HomeService {
  private db = getFirestore();

  /**
   * Get user's group memberships for filtering content
   */
  private async getUserGroups(userId: string): Promise<string[]> {
    try {
      console.log("HomeService: Getting user groups for userId:", userId);
      const userDoc = await getDoc(doc(this.db, "users", userId));
      const userData = userDoc.data();

      console.log("HomeService: User data retrieved:", userData);
      console.log(
        "HomeService: User data keys:",
        userData ? Object.keys(userData) : "no userData",
      );
      console.log(
        "HomeService: User groupsJoined field:",
        userData?.groupsJoined,
      );

      // Use new GroupMembership structure only
      let groupIds: string[] = [];

      if (userData?.groupsJoined && Array.isArray(userData.groupsJoined)) {
        // New GroupMembership structure - filter active memberships
        groupIds = userData.groupsJoined
          .filter((membership: any) => membership.status === "active")
          .map((membership: any) => membership.groupId);
        console.log("HomeService: Using GroupMembership structure:", groupIds);
      } else {
        console.log("HomeService: No active group memberships found");
        return [];
      }

      console.log("HomeService: Final user group IDs:", groupIds);
      return groupIds;
    } catch (error) {
      console.error("Error fetching user groups:", error);
      return [];
    }
  }

  /**
   * Get user's display name for event invites with role context
   */
  private async getUserDisplayName(
    userId: string,
    groupId?: string,
    role?: string,
  ): Promise<string> {
    try {
      const userDoc = await getDoc(doc(this.db, "users", userId));
      const userData = userDoc.data();

      console.log("HomeService: User data for display name:", userData);

      let baseName = "You";

      // Try different name fields
      if (userData?.fullName) {
        baseName = userData.fullName;
      } else if (userData?.displayName) {
        baseName = userData.displayName;
      } else if (userData?.firstName && userData?.lastName) {
        baseName = `${userData.firstName} ${userData.lastName}`;
      } else if (userData?.firstName) {
        baseName = userData.firstName;
      } else if (userData?.name) {
        baseName = userData.name;
      } else if (userData?.email) {
        // Extract name from email as last resort
        baseName = userData.email.split("@")[0].replace(/[._-]/g, " ");
      }

      // Add role context if available
      if (role && groupId) {
        if (role === "coach") {
          return `${baseName} (Coach)`;
        } else if (role === "admin") {
          return `${baseName} (Admin)`;
        } else if (role === "guardian") {
          return `${baseName} (Guardian)`;
        }
      }

      return baseName;
    } catch (error) {
      console.error("Error fetching user display name:", error);
      return "You"; // Fallback on error
    }
  }

  /**
   * Get child name for a guardian user in a specific group
   * Returns the child's name if the user's email is in the child's guardianEmails array
   */
  private async getChildNameForGuardian(
    guardianUserId: string,
    groupId: string,
  ): Promise<string | null> {
    try {
      console.log(
        "HomeService: Checking if user is guardian for children in group:",
        guardianUserId,
        groupId,
      );

      // Get the current user's email to match with guardianEmails
      const userDoc = await getDoc(doc(this.db, "users", guardianUserId));
      const userData = userDoc.data();
      const userEmail = userData?.email?.toLowerCase();

      if (!userEmail) {
        console.log("HomeService: No email found for user");
        return null;
      }

      // Get all members in the group
      const membersSnapshot = await getDocs(
        collection(this.db, "groups", groupId, "members"),
      );

      for (const memberDoc of membersSnapshot.docs) {
        const memberData = memberDoc.data();
        const guardianEmails = memberData.guardianEmails || [];

        // Check if current user's email is in the guardianEmails array
        if (
          guardianEmails.some(
            (email: string) => email.toLowerCase() === userEmail,
          )
        ) {
          console.log(
            "HomeService: Found child for guardian:",
            memberData.name,
          );
          return memberData.name || "Your child";
        }
      }

      console.log(
        "HomeService: User is not a guardian for any children in this group",
      );
      return null;
    } catch (error) {
      console.error("Error checking guardian relationship:", error);
      return null;
    }
  }

  /**
   * Check if user is eligible for an event based on recipientSelection
   */
  private async isUserEligibleForEvent(
    eventData: any,
    userGroups: string[],
    userId: string,
  ): Promise<boolean> {
    try {
      if (
        !eventData.recipientSelection ||
        !eventData.recipientSelection.groups
      ) {
        console.log(
          "HomeService: No recipientSelection found in event:",
          eventData.title,
        );
        return false;
      }

      // Check each group in recipientSelection
      for (const group of eventData.recipientSelection.groups) {
        if (userGroups.includes(group.groupId)) {
          if (group.scope === "entire") {
            // User is in the group and scope is entire, so they're eligible
            console.log(
              `HomeService: User eligible for event "${eventData.title}" via entire group ${group.groupId}`,
            );
            return true;
          } else if (group.scope === "subgroups" && group.subgroupIds) {
            // Need to check if user is in any of the selected subgroups
            // For now, we'll include them (this would need more detailed user-subgroup checking)
            console.log(
              `HomeService: User might be eligible for event "${eventData.title}" via subgroups in ${group.groupId}`,
            );
            return true;
          } else if (group.scope === "members" && group.memberIds) {
            // Check if user is in the selected members list
            if (group.memberIds.includes(userId)) {
              console.log(
                `HomeService: User eligible for event "${eventData.title}" via direct member selection`,
              );
              return true;
            }
          }
        }
      }

      return false;
    } catch (error) {
      console.error("Error checking user eligibility:", error);
      return false;
    }
  }

  /**
   * Fetch upcoming events for the next period
   */
  async getUpcomingEvents(weeksAhead: number = 1): Promise<HomeEvent[]> {
    console.log(
      "🚀 HomeService.getUpcomingEvents() CALLED with weeksAhead:",
      weeksAhead,
    );
    try {
      const currentUser = getCurrentUser();
      console.log("👤 Current user:", currentUser ? currentUser.uid : "null");
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const userGroups = await this.getUserGroups(currentUser.uid);

      if (userGroups.length === 0) {
        console.log("HomeService: No user groups found");
        return [];
      }

      const now = new Date();
      const endDate = new Date();
      endDate.setDate(now.getDate() + weeksAhead * 7);

      console.log(
        "Fetching events from",
        now.toISOString(),
        "to",
        endDate.toISOString(),
      );
      console.log("User groups:", userGroups);

      const events: HomeEvent[] = [];

      // Query events collection for eligible event types
      // We'll query for each group separately to get all potential events
      for (const groupId of userGroups) {
        // Simplified query without date filter to avoid index requirement
        // We'll filter by date after fetching
        const eventsQuery = query(
          collection(this.db, "events"),
          where("groupIds", "array-contains", groupId),
        );

        const eventsSnapshot = await getDocs(eventsQuery);
        console.log(
          `HomeService: Found ${eventsSnapshot.size} potential events for group ${groupId}`,
        );

        for (const eventDoc of eventsSnapshot.docs) {
          // Check if we already have this event to avoid duplicates
          if (events.find((e) => e.id === eventDoc.id)) {
            console.log("HomeService: Skipping duplicate event:", eventDoc.id);
            continue;
          }

          const eventData = eventDoc.data() as any;
          console.log(
            "HomeService: Processing event:",
            eventDoc.id,
            eventData.title,
            "Type:",
            eventData.type,
          );

          // Skip recurring-event-master documents (they're not displayable events)
          if (eventData.type === "recurring-event-master") {
            console.log(
              "HomeService: Skipping recurring-event-master:",
              eventDoc.id,
            );
            continue;
          }

          // Filter by date range (since we couldn't do it in the query)
          const eventStartTime = eventData.startTime?.toDate();
          if (
            !eventStartTime ||
            eventStartTime < now ||
            eventStartTime > endDate
          ) {
            console.log(
              "HomeService: Skipping event outside date range:",
              eventDoc.id,
              eventStartTime,
            );
            continue;
          }

          // Check if user is eligible for this event based on recipientSelection
          const isEligible = await this.isUserEligibleForEvent(
            eventData,
            userGroups,
            currentUser.uid,
          );
          if (!isEligible) {
            console.log(
              "HomeService: User not eligible for event:",
              eventDoc.id,
            );
            continue;
          }

          // Get the user's display name with role context for this specific group
          const primaryGroupId = eventData.groupIds?.[0];
          let recipientName =
            currentUser.displayName || currentUser.email || "You";

          if (primaryGroupId) {
            // Check if this user is a guardian for any children in this group
            const childName = await this.getChildNameForGuardian(
              currentUser.uid,
              primaryGroupId,
            );
            if (childName) {
              recipientName = childName; // Show child's name instead of guardian's name
            } else {
              const displayName = await this.getUserDisplayName(
                currentUser.uid,
                primaryGroupId,
              );
              recipientName = displayName || recipientName;
            }
          }

          // Add eligible event to list
          events.push({
            id: eventDoc.id,
            type: eventData.type || "one-time",
            title: eventData.title || "Untitled Event",
            description: eventData.description || "",
            startTime: eventData.startTime?.toDate() || new Date(),
            endTime: eventData.endTime?.toDate() || new Date(),
            gatheringTime: eventData.gatheringTime?.toDate() || undefined,
            location: eventData.location || "",
            eventType: eventData.eventType || "other",
            createdBy: eventData.createdBy || "",
            recipientName: recipientName, // Add the recipient name with role context
            responses: eventData.responses || {},
            recipientGroups: eventData.groupIds || [],
            isRecurring: eventData.type === "recurring-occurrence",
            recurringMasterId: eventData.recurringMasterId,
          });

          console.log(
            "HomeService: Added eligible event:",
            eventDoc.id,
            eventData.title,
          );
        }
      }

      // Sort by date
      events.sort(
        (a: HomeEvent, b: HomeEvent) =>
          a.startTime.getTime() - b.startTime.getTime(),
      );

      console.log(
        "✅ HomeService.getUpcomingEvents() RETURNING",
        events.length,
        "events:",
        events,
      );
      return events;
    } catch (error) {
      console.error("HomeService: Error fetching upcoming events:", error);
      throw error;
    }
  } /**
   * Fetch news flow items (announcements and polls)
   */
  async getNewsFlow(weeksBack: number = 2): Promise<NewsFlowItem[]> {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const userGroups = await this.getUserGroups(currentUser.uid);
      if (userGroups.length === 0) {
        return [];
      }

      const now = new Date();
      const startDate = new Date();
      startDate.setDate(now.getDate() - weeksBack * 7);

      console.log(
        "Fetching news flow from",
        startDate.toISOString(),
        "to",
        now.toISOString(),
      );
      console.log("User groups:", userGroups);

      const newsItems: NewsFlowItem[] = [];

      // Query announcements - need to query for each group separately
      for (const groupId of userGroups) {
        const announcementsQuery = query(
          collection(this.db, "announcements"),
          where("groupIds", "array-contains", groupId),
          where("createdAt", ">=", Timestamp.fromDate(startDate)),
          orderBy("createdAt", "desc"),
          limit(15),
        );

        const announcementsSnapshot = await getDocs(announcementsQuery);
        announcementsSnapshot.forEach((announcementDoc) => {
          // Check if we already have this announcement to avoid duplicates
          if (!newsItems.find((item) => item.id === announcementDoc.id)) {
            const announcementData = announcementDoc.data() as any;
            newsItems.push({
              id: announcementDoc.id,
              type: "announcement",
              title: announcementData.title || "Untitled Announcement",
              message: announcementData.message || "",
              createdBy: announcementData.createdBy || "",
              createdAt: announcementData.createdAt?.toDate() || new Date(),
              recipientGroups: announcementData.groupIds || [],
              readBy: announcementData.readBy || {},
              readStats: announcementData.readStats || {
                totalReads: 0,
                invitedCount: 0,
              },
            } as HomeAnnouncement);
          }
        });

        // Query polls
        const pollsQuery = query(
          collection(this.db, "polls"),
          where("groupIds", "array-contains", groupId),
          where("createdAt", ">=", Timestamp.fromDate(startDate)),
          orderBy("createdAt", "desc"),
          limit(15),
        );

        const pollsSnapshot = await getDocs(pollsQuery);
        pollsSnapshot.forEach((pollDoc) => {
          // Check if we already have this poll to avoid duplicates
          if (!newsItems.find((item) => item.id === pollDoc.id)) {
            const pollData = pollDoc.data() as any;
            newsItems.push({
              id: pollDoc.id,
              type: "poll",
              question: pollData.question || "Untitled Poll",
              description: pollData.description || "",
              options: pollData.options || [],
              createdBy: pollData.createdBy || "",
              createdAt: pollData.createdAt?.toDate() || new Date(),
              closedAt: pollData.closedAt?.toDate(),
              recipientGroups: pollData.groupIds || [],
              votes: pollData.votes || {},
              voteStats: pollData.voteStats || {},
            } as HomePoll);
          }
        });
      }

      // Sort by creation time (newest first)
      newsItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      console.log("Found", newsItems.length, "news flow items");
      return newsItems;
    } catch (error) {
      console.error("Error fetching news flow:", error);
      return [];
    }
  }

  /**
   * Update event response
   */
  async updateEventResponse(
    eventId: string,
    response: "accepted" | "declined" | "maybe",
  ): Promise<void> {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const eventRef = doc(this.db, "events", eventId);
      const updateData = {
        [`responses.${currentUser.uid}`]: {
          response: response,
          timestamp: Timestamp.now(),
        },
      };

      await updateDoc(eventRef, updateData);
      console.log("Event response updated:", eventId, response);
    } catch (error) {
      console.error("Error updating event response:", error);
      throw error;
    }
  }

  /**
   * Mark announcement as read
   */
  async markAnnouncementAsRead(announcementId: string): Promise<void> {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const announcementRef = doc(this.db, "announcements", announcementId);
      const updateData = {
        [`readBy.${currentUser.uid}`]: {
          timestamp: Timestamp.now(),
        },
      };

      await updateDoc(announcementRef, updateData);
      console.log("Announcement marked as read:", announcementId);
    } catch (error) {
      console.error("Error marking announcement as read:", error);
      throw error;
    }
  }
}

export const homeService = new HomeService();
