import { addDoc, collection, doc, getFirestore, serverTimestamp, updateDoc } from 'firebase/firestore';

// Import Firebase app to ensure it's initialized
import '../services/firebase';

// Event interfaces
export interface EventData {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location: string;
  type: 'practice' | 'game' | 'meeting' | 'other';
}

export interface RecurringEventData {
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  startTime: Date;
  gatheringTime?: Date; // Optional gathering time
  endTime: Date;
  location: string;
  type: 'practice' | 'game' | 'meeting' | 'other';
  capacity: {
    enabled: boolean;
    maxAttendees?: number;
  };
  recurrence: {
    pattern: 'daily' | 'weekly' | 'monthly';
    interval: number;
    daysOfWeek?: number[];
    endType: 'date' | 'count';
    occurrences?: number;
  };
}

export interface RecipientSelection {
  type: 'selected-groups';
  groups: {
    groupId: string;
    scope: 'entire' | 'subgroups' | 'members';
    subgroupIds?: string[];
    memberIds?: string[];
  }[];
  totalCount: number;
}

export interface RecurringEventMaster {
  id?: string;
  type: 'recurring-event-master';
  originalTitle: string;
  originalDescription: string;
  originalLocation: string;
  originalEventType: 'practice' | 'game' | 'meeting' | 'other';
  originalTime: Date;
  recurrence: {
    pattern: 'daily' | 'weekly' | 'monthly';
    interval: number;
    daysOfWeek?: number[];
    endType: 'date' | 'count';
    occurrences?: number;
  };
  createdBy: string;
  createdAt: any;
  lastModified: any;
  recipientSelection: RecipientSelection;
  groupIds: string[];
}

export interface Event {
  id?: string;
  type: 'one-time' | 'recurring-instance';
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location: string;
  eventType: 'practice' | 'game' | 'meeting' | 'other';
  
  // Recurring event fields (for recurring instances)
  recurringEventId?: string;
  isRecurring?: boolean;
  isModified?: boolean;
  recurrenceIndex?: number;
  
  // Creation & Management
  createdBy: string;
  createdAt: any; // Firestore timestamp
  updatedAt: any; // Firestore timestamp
  status: 'active' | 'cancelled' | 'completed';
  
  // Recipients
  groupIds: string[];
  recipientSelection: RecipientSelection;
  
  // Response tracking
  responses: {
    [userId: string]: {
      status: 'accepted' | 'declined' | 'maybe';
      timestamp: any; // Firestore timestamp
      note?: string;
    };
  };
  
  responseStats: {
    accepted: number;
    declined: number;
    maybe: number;
    total: number;
    invitedCount: number;
  };
}

export class EventService {
  private db = getFirestore();

  /**
   * Create a new one-time event
   */
  async createEvent(
    eventData: EventData,
    recipients: RecipientSelection,
    createdBy: string
  ): Promise<string> {
    try {
      console.log('EventService: Creating event with data:', eventData);
      console.log('EventService: Recipients:', recipients);
      console.log('EventService: Created by:', createdBy);
      
      const groupIds = recipients.groups.map(group => group.groupId);
      console.log('EventService: Group IDs:', groupIds);

      const eventDoc: Omit<Event, 'id'> = {
        type: 'one-time',
        title: eventData.title.trim(),
        description: eventData.description.trim(),
        startTime: eventData.startTime,
        endTime: eventData.endTime,
        location: eventData.location.trim(),
        eventType: eventData.type,
        
        // Creation & Management
        createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: 'active',
        
        // Recipients
        groupIds,
        recipientSelection: recipients,
        
        // Response tracking (initialize empty)
        responses: {},
        responseStats: {
          accepted: 0,
          declined: 0,
          maybe: 0,
          total: 0,
          invitedCount: recipients.totalCount
        }
      };

      console.log('EventService: Final event document:', eventDoc);
      console.log('EventService: Attempting to write to Firestore...');
      
      const docRef = await addDoc(collection(this.db, 'events'), eventDoc);
      console.log('EventService: Successfully created event with ID:', docRef.id);
      
      return docRef.id;
    } catch (error) {
      console.error('EventService: Error creating event:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error in EventService';
      throw new Error(`Failed to create event: ${errorMessage}`);
    }
  }

  /**
   * Create recurring events using hybrid approach (master + individual documents)
   */
  async createRecurringEvents(
    eventData: RecurringEventData,
    recipients: RecipientSelection,
    createdBy: string
  ): Promise<{ masterId: string; eventIds: string[] }> {
    try {
      console.log('EventService: Creating recurring events...');
      console.log('EventService: Event data:', eventData);
      console.log('EventService: Recipients:', recipients);

      // Generate all occurrence dates
      const occurrences = this.generateRecurringDates(eventData);
      console.log('EventService: Generated occurrences:', occurrences);

      // Extract group IDs from recipients
      const groupIds = recipients.groups.map(g => g.groupId);

      // 1. Create master document first
      const masterDoc: RecurringEventMaster = {
        type: 'recurring-event-master',
        originalTitle: eventData.title,
        originalDescription: eventData.description,
        originalLocation: eventData.location,
        originalEventType: eventData.type,
        originalTime: eventData.startTime,
        recurrence: eventData.recurrence,
        createdBy,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
        recipientSelection: recipients,
        groupIds
      };

      console.log('EventService: Creating master document...');
      const masterDocRef = await addDoc(collection(this.db, 'events'), masterDoc);
      const masterId = masterDocRef.id;
      console.log('EventService: Master document created with ID:', masterId);

      // 2. Create individual event documents
      const eventIds: string[] = [];
      
      for (let i = 0; i < occurrences.length; i++) {
        const occurrence = occurrences[i];
        
        // Calculate end time (default 2 hours duration)
        const endTime = new Date(occurrence);
        endTime.setHours(endTime.getHours() + 2);

        const eventDoc: Event = {
          type: 'recurring-instance',
          title: eventData.title,
          description: eventData.description,
          startTime: occurrence,
          endTime: endTime,
          location: eventData.location,
          eventType: eventData.type,
          
          // Recurring event fields
          recurringEventId: masterId,
          isRecurring: true,
          isModified: false,
          recurrenceIndex: i + 1,
          
          // Creation & Management
          createdBy,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          status: 'active',
          
          // Recipients
          groupIds,
          recipientSelection: recipients,
          
          // Response tracking (initialize empty)
          responses: {},
          responseStats: {
            accepted: 0,
            declined: 0,
            maybe: 0,
            total: 0,
            invitedCount: recipients.totalCount
          }
        };

        console.log(`EventService: Creating event ${i + 1}/${occurrences.length}...`);
        const docRef = await addDoc(collection(this.db, 'events'), eventDoc);
        eventIds.push(docRef.id);
        console.log(`EventService: Created event ${i + 1} with ID:`, docRef.id);
      }

      console.log('EventService: Successfully created recurring events');
      console.log(`EventService: Master ID: ${masterId}, Event IDs:`, eventIds);
      
      return { masterId, eventIds };
    } catch (error) {
      console.error('EventService: Error creating recurring events:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error in EventService';
      throw new Error(`Failed to create recurring events: ${errorMessage}`);
    }
  }

  /**
   * Generate recurring dates based on pattern
   */
  private generateRecurringDates(eventData: RecurringEventData): Date[] {
    const dates: Date[] = [];
    const { startDate, endDate, startTime, recurrence } = eventData;
    const { pattern, interval, daysOfWeek, endType, occurrences } = recurrence;

    let currentDate = new Date(startDate);
    let count = 0;
    const maxOccurrences = endType === 'count' ? (occurrences || 10) : 100; // Fallback limit

    while (currentDate <= endDate && count < maxOccurrences) {
      let shouldInclude = false;

      switch (pattern) {
        case 'daily':
          shouldInclude = true;
          break;
        case 'weekly':
          if (daysOfWeek && daysOfWeek.includes(currentDate.getDay())) {
            shouldInclude = true;
          }
          break;
        case 'monthly':
          // For monthly, include if it's the same day of month as start date
          if (currentDate.getDate() === startDate.getDate()) {
            shouldInclude = true;
          }
          break;
      }

      if (shouldInclude) {
        // Combine the date with the specified time
        const eventDateTime = new Date(currentDate);
        eventDateTime.setHours(startTime.getHours());
        eventDateTime.setMinutes(startTime.getMinutes());
        eventDateTime.setSeconds(0);
        eventDateTime.setMilliseconds(0);
        
        dates.push(eventDateTime);
        count++;
      }

      // Advance to next date based on pattern and interval
      switch (pattern) {
        case 'daily':
          currentDate.setDate(currentDate.getDate() + interval);
          break;
        case 'weekly':
          currentDate.setDate(currentDate.getDate() + 1); // Check every day
          break;
        case 'monthly':
          currentDate.setMonth(currentDate.getMonth() + interval);
          break;
      }
    }

    return dates;
  }

  /**
   * Update user response to an event
   */
  async respondToEvent(
    eventId: string,
    userId: string,
    response: 'accepted' | 'declined' | 'maybe',
    note?: string
  ): Promise<void> {
    try {
      const eventRef = doc(this.db, 'events', eventId);
      
      await updateDoc(eventRef, {
        [`responses.${userId}`]: {
          status: response,
          timestamp: serverTimestamp(),
          note: note || null
        },
        [`responseStats.${response}`]: 'increment(1)', // Will be replaced with actual increment
        'responseStats.total': 'increment(1)', // Will be replaced with actual increment
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating event response:', error);
      throw new Error('Failed to update response');
    }
  }

  /**
   * Cancel an event
   */
  async cancelEvent(eventId: string): Promise<void> {
    try {
      const eventRef = doc(this.db, 'events', eventId);
      
      await updateDoc(eventRef, {
        status: 'cancelled',
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error cancelling event:', error);
      throw new Error('Failed to cancel event');
    }
  }
}

// Singleton instance
export const eventService = new EventService();
