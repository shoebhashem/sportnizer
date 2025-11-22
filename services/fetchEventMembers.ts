// /services/fetchEventMembers.ts - Read event responses directly from Firestore
// Fetches from /clubs/{clubId}/events/{eventId}/ → responses array

import { doc, getDoc, getFirestore } from 'firebase/firestore';
import type { EventData } from './types/event';

export interface EventResponse {
  userId: string;
  userName: string;
  photoUrl: string;
  response: 'accepted' | 'declined' | 'pending';
  respondedAt?: any; // Firestore Timestamp
}

export interface EventMembersResponse {
  success: boolean;
  responses: EventResponse[];
  eventData?: EventData;
  error?: string;
}

/**
 * Fetch event responses (invited members and their responses)
 * Reads from /clubs/{clubId}/events/{eventId}/ → responses field
 */
export const fetchEventMembers = async (clubId: string, eventId: string): Promise<EventMembersResponse> => {
  try {
    const db = getFirestore();
    const eventDocRef = doc(db, 'clubs', clubId, 'events', eventId);
    const eventDoc = await getDoc(eventDocRef);

    if (!eventDoc.exists()) {
      console.log(`Event ${eventId} not found in club ${clubId}`);
      return { 
        success: false, 
        responses: [], 
        error: 'Event not found'
      };
    }

    const eventData = eventDoc.data() as EventData;
    const responses: EventResponse[] = eventData.responses || [];

    console.log(`Fetched ${responses.length} responses for event ${eventId} in club ${clubId}`);
    return { 
      success: true, 
      responses,
      eventData
    };

  } catch (error: any) {
    console.error('❌ Error fetching event members:', error);
    return { 
      success: false, 
      responses: [], 
      error: error.message || 'Failed to fetch event members'
    };
  }
};

/**
 * Get response statistics for an event
 */
export const getEventResponseStats = async (clubId: string, eventId: string) => {
  const result = await fetchEventMembers(clubId, eventId);
  
  if (!result.success) {
    return { accepted: 0, declined: 0, pending: 0, total: 0 };
  }

  const stats = result.responses.reduce((acc, response) => {
    acc[response.response]++;
    acc.total++;
    return acc;
  }, { accepted: 0, declined: 0, pending: 0, total: 0 });

  return stats;
};

/**
 * Get members who accepted an event
 */
export const getAcceptedMembers = async (clubId: string, eventId: string): Promise<EventResponse[]> => {
  const result = await fetchEventMembers(clubId, eventId);
  
  if (!result.success) {
    return [];
  }

  return result.responses.filter(response => response.response === 'accepted');
};

/**
 * Get members who declined an event
 */
export const getDeclinedMembers = async (clubId: string, eventId: string): Promise<EventResponse[]> => {
  const result = await fetchEventMembers(clubId, eventId);
  
  if (!result.success) {
    return [];
  }

  return result.responses.filter(response => response.response === 'declined');
};

/**
 * Get members who haven't responded to an event yet
 */
export const getPendingMembers = async (clubId: string, eventId: string): Promise<EventResponse[]> => {
  const result = await fetchEventMembers(clubId, eventId);
  
  if (!result.success) {
    return [];
  }

  return result.responses.filter(response => response.response === 'pending');
};
