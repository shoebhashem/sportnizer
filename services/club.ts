// /services/club.ts - Thin orchestration service for club operations
// Calls atomic Firebase Functions instead of direct Firestore operations

import { httpsCallable } from 'firebase/functions';
import { functions } from './core/firebase';
import type { DeleteClubServiceResponse, ReactivateClubServiceResponse } from './orchestration';
import { deleteClubService, reactivateClubService } from './orchestration';
import type { ClubData } from './types/club';

// Firebase Function references
const createClubFn = httpsCallable(functions, 'createClub');
const updateClubFn = httpsCallable(functions, 'updateClub');
const getClubFn = httpsCallable(functions, 'getClub');

export const clubService = {
  /**
   * Create a new club
   */
  async createClub(clubData: Omit<ClubData, 'id' | 'createdAt' | 'lastModifiedAt' | 'version'>): Promise<{ success: boolean; clubId?: string; error?: string }> {
    try {
      const result = await createClubFn(clubData);
      return result.data as { success: boolean; clubId?: string; error?: string };
    } catch (error: any) {
      console.error('❌ Error creating club:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Update an existing club
   */
  async updateClub(clubId: string, updates: Partial<ClubData>): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await updateClubFn({ clubId, updates });
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error('❌ Error updating club:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Delete a club (soft delete with 30-day grace period)
   * Uses orchestration service to handle user document updates
   * 
   * @param clubId - Club ID to delete
   * @param verificationToken - Optional JWT token from email verification (future implementation)
   */
  async deleteClub(clubId: string, verificationToken?: string): Promise<DeleteClubServiceResponse> {
    return deleteClubService(clubId, verificationToken);
  },

  /**
   * Reactivate a soft-deleted club (within 30-day grace period)
   * Uses orchestration service to handle user document updates
   * 
   * @param clubId - Club ID to reactivate
   * @param verificationToken - Optional JWT token from email verification (future implementation)
   */
  async reactivateClub(clubId: string, verificationToken?: string): Promise<ReactivateClubServiceResponse> {
    return reactivateClubService(clubId, verificationToken);
  },

  /**
   * Get club data
   */
  async getClub(clubId: string): Promise<{ success: boolean; data?: ClubData; error?: string }> {
    try {
      const result = await getClubFn({ clubId });
      return result.data as { success: boolean; data?: ClubData; error?: string };
    } catch (error: any) {
      console.error('❌ Error fetching club:', error);
      return { success: false, error: error.message };
    }
  }
};
