import { addDoc, collection, doc, getDoc, getFirestore, increment, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';

// Import Firebase app to ensure it's initialized
import '../core/firebase';
import type { EventData } from '../types/event';

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
  notification: {
    advanceTime: number; // Days/hours before event to send notification
    timeUnit: 'days' | 'hours'; // Unit for advance time
  };
  responseDeadline: {
    enabled: boolean; // Whether custom deadline is enabled
    date?: Date; // Custom deadline date (if enabled)
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
  originalEndTime: Date;
  originalGatheringTime?: Date;
  capacity: {
    enabled: boolean;
    maxAttendees?: number;
  };
  notification: {
    advanceTime: number;
    timeUnit: 'days' | 'hours';
  };
  responseDeadline: {
    enabled: boolean;
    date?: Date;
  };
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
  gatheringTime?: Date;
  location: string;
  eventType: 'practice' | 'game' | 'meeting' | 'other';
  capacity?: {
    enabled: boolean;
    maxAttendees?: number;
  };
  responseDeadline?: Date; // When members must respond by
  
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
      userRoles?: string[]; // Track user's roles when they responded
    };
  };
  
  responseStats: {
    // Overall stats
    accepted: number;
    declined: number;
    maybe: number;
    total: number;
    invitedCount: number;
    notReplied: number; // Track those who haven't responded yet
    
    // Role-based breakdown
    coachAccepted: number;
    coachDeclined: number;
    coachMaybe: number;
    coachNotReplied: number;
    
    guardianAccepted: number;
    guardianDeclined: number;
    guardianMaybe: number;
    guardianNotReplied: number;
    
    memberAccepted: number;
    memberDeclined: number;
    memberMaybe: number;
    memberNotReplied: number;
    
    adminAccepted: number;
    adminDeclined: number;
    adminMaybe: number;
    adminNotReplied: number;
  };
}

export class EventService {
  private db = getFirestore();

  /**
   * Utility to remove undefined values from an object before sending to Firestore
   */
  private removeUndefinedFields(obj: any): any {
    const cleanObj = { ...obj };
    Object.keys(cleanObj).forEach(key => {
      if (cleanObj[key] === undefined) {
        delete cleanObj[key];
      }
    });
    return cleanObj;
  }

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

      // Build event document, filtering out undefined values
      const eventDoc: Omit<Event, 'id'> = {
        type: 'one-time',
        title: eventData.title.trim(),
        description: eventData.description.trim(),
        startTime: eventData.startTime,
        endTime: eventData.endTime,
        location: eventData.location.trim(),
        eventType: eventData.type,
        responseDeadline: eventData.responseDeadline?.enabled && eventData.responseDeadline.date 
          ? eventData.responseDeadline.date 
          : eventData.startTime, // Default to start time
        
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
          // Overall stats
          accepted: 0,
          declined: 0,
          maybe: 0,
          total: 0,
          invitedCount: recipients.totalCount,
          notReplied: recipients.totalCount, // Initially everyone is not replied
          
          // Role-based breakdown (initialize all to 0)
          coachAccepted: 0,
          coachDeclined: 0,
          coachMaybe: 0,
          coachNotReplied: 0, // Will be calculated based on actual coach invites
          
          guardianAccepted: 0,
          guardianDeclined: 0,
          guardianMaybe: 0,
          guardianNotReplied: 0, // Will be calculated based on actual guardian invites
          
          memberAccepted: 0,
          memberDeclined: 0,
          memberMaybe: 0,
          memberNotReplied: 0, // Will be calculated based on actual member invites
          
          adminAccepted: 0,
          adminDeclined: 0,
          adminMaybe: 0,
          adminNotReplied: 0 // Will be calculated based on actual admin invites
        }
      };

      // Add optional fields only if they have valid values
      if (eventData.gatheringTime) {
        (eventDoc as any).gatheringTime = eventData.gatheringTime;
      }

      if (eventData.capacity) {
        (eventDoc as any).capacity = eventData.capacity;
      }

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
        originalEndTime: eventData.endTime,
        originalGatheringTime: eventData.gatheringTime,
        capacity: eventData.capacity,
        notification: eventData.notification,
        responseDeadline: eventData.responseDeadline,
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
        
        // Calculate end time based on the duration from start to end time
        const startDate = new Date(occurrence);
        const endTime = new Date(occurrence);
        
        // Calculate duration from original start and end times
        const originalDuration = eventData.endTime.getTime() - eventData.startTime.getTime();
        endTime.setTime(startDate.getTime() + originalDuration);

        // Calculate gathering time if specified
        let gatheringTime: Date | undefined;
        if (eventData.gatheringTime) {
          const gatheringOffset = eventData.gatheringTime.getTime() - eventData.startTime.getTime();
          gatheringTime = new Date(startDate.getTime() + gatheringOffset);
        }

        // Calculate response deadline
        let responseDeadline: Date;
        if (eventData.responseDeadline.enabled && eventData.responseDeadline.date) {
          // Use custom deadline, but offset relative to this specific event occurrence
          const deadlineOffset = eventData.responseDeadline.date.getTime() - eventData.startDate.getTime();
          responseDeadline = new Date(startDate.getTime() + deadlineOffset);
        } else {
          // Default to event start date
          responseDeadline = startDate;
        }

        const eventDoc: Event = {
          type: 'recurring-instance',
          title: eventData.title,
          description: eventData.description,
          startTime: startDate,
          endTime: endTime,
          location: eventData.location,
          eventType: eventData.type,
          responseDeadline: responseDeadline,
          
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
            // Overall stats
            accepted: 0,
            declined: 0,
            maybe: 0,
            total: 0,
            invitedCount: recipients.totalCount,
            notReplied: recipients.totalCount, // Initially everyone is not replied
            
            // Role-based breakdown (initialize all to 0)
            coachAccepted: 0,
            coachDeclined: 0,
            coachMaybe: 0,
            coachNotReplied: 0, // Will be calculated based on actual coach invites
            
            guardianAccepted: 0,
            guardianDeclined: 0,
            guardianMaybe: 0,
            guardianNotReplied: 0, // Will be calculated based on actual guardian invites
            
            memberAccepted: 0,
            memberDeclined: 0,
            memberMaybe: 0,
            memberNotReplied: 0, // Will be calculated based on actual member invites
            
            adminAccepted: 0,
            adminDeclined: 0,
            adminMaybe: 0,
            adminNotReplied: 0 // Will be calculated based on actual admin invites
          }
        };

        // Add optional fields only if they have valid values
        if (gatheringTime) {
          (eventDoc as any).gatheringTime = gatheringTime;
        }

        if (eventData.capacity) {
          (eventDoc as any).capacity = eventData.capacity;
        }

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
   * Update user response to an event (Enhanced with dual updates)
   */
  async respondToEvent(
    eventId: string,
    userId: string,
    response: 'accepted' | 'declined' | 'maybe',
    userRoles: string[] = [], // User's roles in the event's groups
    note?: string
  ): Promise<void> {
    try {
      const db = getFirestore();
      const batch = writeBatch(db);
      
      // 1. Update event document with response and role-based stats
      const eventRef = doc(db, 'events', eventId);
      
      // Get current event to check if user already responded
      const eventDoc = await getDoc(eventRef);
      const eventData = eventDoc.data();
      const previousResponse = eventData?.responses?.[userId]?.status;
      
      // Update event responses
      batch.update(eventRef, {
        [`responses.${userId}`]: {
          status: response,
          timestamp: serverTimestamp(),
          note: note || null,
          userRoles: userRoles
        },
        updatedAt: serverTimestamp()
      });
      
      // Calculate stat changes based on previous response
      const statUpdates: any = {};
      
      // Overall stats
      if (previousResponse) {
        // User is changing their response
        statUpdates[`responseStats.${previousResponse}`] = increment(-1);
        statUpdates[`responseStats.total`] = increment(0); // No change in total
      } else {
        // New response
        statUpdates[`responseStats.notReplied`] = increment(-1);
        statUpdates[`responseStats.total`] = increment(1);
      }
      statUpdates[`responseStats.${response}`] = increment(1);
      
      // Role-based stats updates
      for (const role of userRoles) {
        const roleKey = role.toLowerCase();
        if (['coach', 'guardian', 'member', 'admin'].includes(roleKey)) {
          if (previousResponse) {
            // Decrement previous role response
            statUpdates[`responseStats.${roleKey}${previousResponse.charAt(0).toUpperCase() + previousResponse.slice(1)}`] = increment(-1);
          } else {
            // Decrement role not replied
            statUpdates[`responseStats.${roleKey}NotReplied`] = increment(-1);
          }
          // Increment new role response
          statUpdates[`responseStats.${roleKey}${response.charAt(0).toUpperCase() + response.slice(1)}`] = increment(1);
        }
      }
      
      // Apply stat updates to event
      batch.update(eventRef, statUpdates);
      
      // 2. Update user document with event response
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.data();
      const currentEventsInvited = userData?.eventsInvited || [];
      
      // Update or add event response in user's eventsInvited array
      const existingEventIndex = currentEventsInvited.findIndex((event: any) => event.eventId === eventId);
      let updatedEventsInvited;
      
      if (existingEventIndex >= 0) {
        // Update existing response
        updatedEventsInvited = [...currentEventsInvited];
        updatedEventsInvited[existingEventIndex] = {
          ...updatedEventsInvited[existingEventIndex],
          response: response,
          respondedAt: new Date()
        };
      } else {
        // Add new event response
        updatedEventsInvited = [
          ...currentEventsInvited,
          {
            eventId: eventId,
            response: response,
            invitedAt: new Date(), // Could be set when event is created
            respondedAt: new Date()
          }
        ];
      }
      
      batch.update(userRef, {
        eventsInvited: updatedEventsInvited
      });
      
      // 3. Execute all updates atomically
      await batch.commit();
      
      console.log(`Successfully updated event response: User ${userId} ${response} event ${eventId}`);
      
    } catch (error) {
      console.error('Error updating event response:', error);
      throw new Error(`Failed to update response: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  /**
   * Get detailed event response information including user details and roles
   */
  async getEventResponseDetails(eventId: string) {
    try {
      const eventDoc = await getDoc(doc(this.db, 'events', eventId));
      if (!eventDoc.exists()) {
        throw new Error('Event not found');
      }
      
      const eventData = eventDoc.data();
      const responses = eventData.responses || {};
      
      const responseDetails = [];
      
      // Get user details for each respondent
      for (const [userId, response] of Object.entries(responses)) {
        const userDoc = await getDoc(doc(this.db, 'users', userId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const userRoles = this.getUserRolesForEventGroups(userData.groupsJoined || [], eventData.groupIds || []);
          
          responseDetails.push({
            userId,
            name: userData.name || userData.email?.split('@')[0] || 'Unknown User',
            email: userData.email,
            roles: userRoles,
            response: (response as any).status,
            timestamp: (response as any).timestamp,
            note: (response as any).note
          });
        }
      }
      
      // Group responses by roles and status
      return {
        event: {
          id: eventId,
          title: eventData.title,
          startTime: eventData.startTime,
          responseStats: eventData.responseStats
        },
        responses: {
          all: responseDetails,
          byRole: {
            coaches: responseDetails.filter(r => r.roles.includes('coach')),
            admins: responseDetails.filter(r => r.roles.includes('admin')),
            guardians: responseDetails.filter(r => r.roles.includes('guardian')),
            members: responseDetails.filter(r => r.roles.includes('member'))
          },
          byStatus: {
            accepted: responseDetails.filter(r => r.response === 'accepted'),
            declined: responseDetails.filter(r => r.response === 'declined'),
            maybe: responseDetails.filter(r => r.response === 'maybe')
          }
        }
      };
      
    } catch (error) {
      console.error('Error getting event response details:', error);
      throw new Error('Failed to get response details');
    }
  }

  /**
   * Helper function to get user roles for specific event groups
   */
  private getUserRolesForEventGroups(userGroupsJoined: any[], eventGroupIds: string[]): string[] {
    const roles = new Set<string>();
    
    for (const membership of userGroupsJoined) {
      if (eventGroupIds.includes(membership.groupId)) {
        // Add all roles user has in this group
        if (membership.roles && Array.isArray(membership.roles)) {
          membership.roles.forEach((role: string) => roles.add(role));
        }
      }
    }
    
    return Array.from(roles);
  }
}

// Singleton instance
export const eventService = new EventService();