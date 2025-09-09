import { collection, doc, getDoc, getDocs, getFirestore, limit, orderBy, query, Timestamp, updateDoc, where } from 'firebase/firestore';

// Import Firebase app to ensure it's initialized
import { getCurrentUser } from './authService';
import './firebase';

// Data interfaces
export interface HomeEvent {
  id: string;
  type: 'event' | 'recurring-event';
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location: string;
  eventType: 'practice' | 'game' | 'meeting' | 'other';
  createdBy: string;
  responses: {
    [userId: string]: {
      response: 'accepted' | 'declined' | 'maybe';
      timestamp: any;
    };
  };
  recipientGroups: string[];
  isRecurring: boolean;
  recurringMasterId?: string;
}

export interface HomeAnnouncement {
  id: string;
  type: 'announcement';
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
  type: 'poll';
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
      const userDoc = await getDoc(doc(this.db, 'users', userId));
      const userData = userDoc.data();
      
      if (!userData || !userData.groups) {
        return [];
      }

      // Extract group IDs from user's groups object
      return Object.keys(userData.groups);
    } catch (error) {
      console.error('Error fetching user groups:', error);
      return [];
    }
  }

  /**
   * Fetch upcoming events for the next period
   */
  async getUpcomingEvents(weeksAhead: number = 1): Promise<HomeEvent[]> {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      const userGroups = await this.getUserGroups(currentUser.uid);
      if (userGroups.length === 0) {
        return [];
      }

      const now = new Date();
      const endDate = new Date();
      endDate.setDate(now.getDate() + (weeksAhead * 7));

      console.log('Fetching events from', now.toISOString(), 'to', endDate.toISOString());
      console.log('User groups:', userGroups);

      const events: HomeEvent[] = [];
      
      // Query events collection - we'll need to query for each group separately since Firestore doesn't support array-intersects-any
      for (const groupId of userGroups) {
        const eventsQuery = query(
          collection(this.db, 'events'),
          where('recipientGroups', 'array-contains', groupId),
          where('startTime', '>=', Timestamp.fromDate(now)),
          where('startTime', '<=', Timestamp.fromDate(endDate)),
          orderBy('startTime', 'asc'),
          limit(20)
        );

        const eventsSnapshot = await getDocs(eventsQuery);
        eventsSnapshot.forEach((eventDoc) => {
          // Check if we already have this event to avoid duplicates
          if (!events.find(e => e.id === eventDoc.id)) {
            const eventData = eventDoc.data() as any;
            events.push({
              id: eventDoc.id,
              type: eventData.type || 'event',
              title: eventData.title || 'Untitled Event',
              description: eventData.description || '',
              startTime: eventData.startTime?.toDate() || new Date(),
              endTime: eventData.endTime?.toDate() || new Date(),
              location: eventData.location || '',
              eventType: eventData.eventType || 'other',
              createdBy: eventData.createdBy || '',
              responses: eventData.responses || {},
              recipientGroups: eventData.recipientGroups || [],
              isRecurring: eventData.type === 'recurring-event',
              recurringMasterId: eventData.recurringMasterId
            });
          }
        });
      }

      // Sort by start time
      events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

      console.log('Found', events.length, 'upcoming events');
      return events;
    } catch (error) {
      console.error('Error fetching upcoming events:', error);
      return [];
    }
  }

  /**
   * Fetch news flow items (announcements and polls)
   */
  async getNewsFlow(weeksBack: number = 2): Promise<NewsFlowItem[]> {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      const userGroups = await this.getUserGroups(currentUser.uid);
      if (userGroups.length === 0) {
        return [];
      }

      const now = new Date();
      const startDate = new Date();
      startDate.setDate(now.getDate() - (weeksBack * 7));

      console.log('Fetching news flow from', startDate.toISOString(), 'to', now.toISOString());
      console.log('User groups:', userGroups);

      const newsItems: NewsFlowItem[] = [];

      // Query announcements - need to query for each group separately
      for (const groupId of userGroups) {
        const announcementsQuery = query(
          collection(this.db, 'announcements'),
          where('recipientGroups', 'array-contains', groupId),
          where('createdAt', '>=', Timestamp.fromDate(startDate)),
          orderBy('createdAt', 'desc'),
          limit(15)
        );

        const announcementsSnapshot = await getDocs(announcementsQuery);
        announcementsSnapshot.forEach((announcementDoc) => {
          // Check if we already have this announcement to avoid duplicates
          if (!newsItems.find(item => item.id === announcementDoc.id)) {
            const announcementData = announcementDoc.data() as any;
            newsItems.push({
              id: announcementDoc.id,
              type: 'announcement',
              title: announcementData.title || 'Untitled Announcement',
              message: announcementData.message || '',
              createdBy: announcementData.createdBy || '',
              createdAt: announcementData.createdAt?.toDate() || new Date(),
              recipientGroups: announcementData.recipientGroups || [],
              readBy: announcementData.readBy || {},
              readStats: announcementData.readStats || { totalReads: 0, invitedCount: 0 }
            } as HomeAnnouncement);
          }
        });

        // Query polls
        const pollsQuery = query(
          collection(this.db, 'polls'),
          where('recipientGroups', 'array-contains', groupId),
          where('createdAt', '>=', Timestamp.fromDate(startDate)),
          orderBy('createdAt', 'desc'),
          limit(15)
        );

        const pollsSnapshot = await getDocs(pollsQuery);
        pollsSnapshot.forEach((pollDoc) => {
          // Check if we already have this poll to avoid duplicates
          if (!newsItems.find(item => item.id === pollDoc.id)) {
            const pollData = pollDoc.data() as any;
            newsItems.push({
              id: pollDoc.id,
              type: 'poll',
              question: pollData.question || 'Untitled Poll',
              description: pollData.description || '',
              options: pollData.options || [],
              createdBy: pollData.createdBy || '',
              createdAt: pollData.createdAt?.toDate() || new Date(),
              closedAt: pollData.closedAt?.toDate(),
              recipientGroups: pollData.recipientGroups || [],
              votes: pollData.votes || {},
              voteStats: pollData.voteStats || {}
            } as HomePoll);
          }
        });
      }

      // Sort by creation time (newest first)
      newsItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      console.log('Found', newsItems.length, 'news flow items');
      return newsItems;
    } catch (error) {
      console.error('Error fetching news flow:', error);
      return [];
    }
  }

  /**
   * Update event response
   */
  async updateEventResponse(eventId: string, response: 'accepted' | 'declined' | 'maybe'): Promise<void> {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      const eventRef = doc(this.db, 'events', eventId);
      const updateData = {
        [`responses.${currentUser.uid}`]: {
          response: response,
          timestamp: Timestamp.now()
        }
      };

      await updateDoc(eventRef, updateData);
      console.log('Event response updated:', eventId, response);
    } catch (error) {
      console.error('Error updating event response:', error);
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
        throw new Error('User not authenticated');
      }

      const announcementRef = doc(this.db, 'announcements', announcementId);
      const updateData = {
        [`readBy.${currentUser.uid}`]: {
          timestamp: Timestamp.now()
        }
      };

      await updateDoc(announcementRef, updateData);
      console.log('Announcement marked as read:', announcementId);
    } catch (error) {
      console.error('Error marking announcement as read:', error);
      throw error;
    }
  }
}

export const homeService = new HomeService();
