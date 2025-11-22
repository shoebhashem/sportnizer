// /services/event.ts - Thin orchestration service for event operations
// Calls atomic Firebase Functions instead of direct Firestore operations

import { httpsCallable } from 'firebase/functions';
import { functions } from './core/firebase';
import { fetchClubMembers } from './fetchClubMembers';
import { fetchGroupMembers, fetchSubGroupMembers } from './fetchGroupMembers';
import type { EventData } from './types/event';

// Firebase Function references
const createEventFn = httpsCallable(functions, 'createEvent');
const updateEventFn = httpsCallable(functions, 'updateEvent');
const deleteEventFn = httpsCallable(functions, 'deleteEvent');
const getEventFn = httpsCallable(functions, 'getEvent');

export const eventService = {
  /**
   * Create a new event within a club with proper member targeting
   */
  async createEvent(clubId: string, eventData: Omit<EventData, 'id' | 'createdAt' | 'lastModifiedAt' | 'version' | 'responses'>): Promise<{ success: boolean; eventId?: string; error?: string }> {
    try {
      // 1. Build responses array based on target scope
      const responses = await this.buildResponsesArray(clubId, eventData);
      
      // 2. Create complete event data with responses
      const completeEventData = {
        ...eventData,
        clubId,
        responses,
        isActive: true,
        version: 1
      };

      // 3. Call Firebase Function to create event
      const result = await createEventFn({ clubId, eventData: completeEventData });
      return result.data as { success: boolean; eventId?: string; error?: string };
    } catch (error: any) {
      console.error('❌ Error creating event:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Build responses array based on target scope
   */
  async buildResponsesArray(clubId: string, eventData: any) {
    const { targetScope, groupId, subGroupIds } = eventData;
    let members: any[] = [];

    try {
      // Fetch members based on target scope
      if (targetScope === 'club') {
        const result = await fetchClubMembers(clubId);
        members = result.success ? result.members : [];
      } else if (targetScope === 'group' && groupId) {
        const result = await fetchGroupMembers(clubId, groupId);
        members = result.success ? result.members : [];
      } else if (targetScope === 'subgroup' && groupId && subGroupIds) {
        const result = await fetchSubGroupMembers(clubId, groupId, subGroupIds);
        members = result.success ? result.members : [];
      }

      // Build responses array with 'pending' status
      return members.map(member => ({
        userId: member.userId,
        userName: member.name || member.displayName || 'Unknown',
        photoUrl: member.photoURL || '',
        response: 'pending' as const,
        respondedAt: null
      }));
    } catch (error: any) {
      console.error('❌ Error building responses array:', error);
      return [];
    }
  },

  /**
   * Update an existing event
   */
  async updateEvent(clubId: string, eventId: string, updates: Partial<EventData>): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await updateEventFn({ clubId, eventId, updates });
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error('❌ Error updating event:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Delete an event
   */
  async deleteEvent(clubId: string, eventId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await deleteEventFn({ clubId, eventId });
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error('❌ Error deleting event:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get event data
   */
  async getEvent(clubId: string, eventId: string): Promise<{ success: boolean; data?: EventData; error?: string }> {
    try {
      const result = await getEventFn({ clubId, eventId });
      return result.data as { success: boolean; data?: EventData; error?: string };
    } catch (error: any) {
      console.error('❌ Error fetching event:', error);
      return { success: false, error: error.message };
    }
  }
};
