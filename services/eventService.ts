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

export interface Event {
  id?: string;
  type: 'one-time' | 'recurring-instance';
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location: string;
  eventType: 'practice' | 'game' | 'meeting' | 'other';
  
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
