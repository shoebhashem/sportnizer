// /services/recipientSelection.ts - Recipient selection orchestrating service
// Handles permission-based recipient selection following three-layer architecture

import { httpsCallable } from 'firebase/functions';
import { functions } from './core/firebase';
import { groupService } from './group';

export interface SelectableEntity {
  type: 'club' | 'group' | 'subgroup';
  id: string;
  name: string;
  parentId?: string; // clubId for groups, groupId for subgroups
  parentName?: string;
  memberCount: number;
  userRoles: string[];
  canSelect: boolean; // Based on user permissions
}

export interface SelectableEntitiesResponse {
  success: boolean;
  entities?: {
    clubs: SelectableEntity[];
    groups: SelectableEntity[];
    subgroups: Map<string, SelectableEntity[]>; // groupId -> subgroups
  };
  error?: string;
}

export interface RecipientCountResponse {
  success: boolean;
  count?: number;
  breakdown?: {
    clubCount?: number;
    groupCounts?: { [groupId: string]: number };
    subgroupCounts?: { [subgroupId: string]: number };
  };
  error?: string;
}

export interface ValidationResponse {
  success: boolean;
  isValid?: boolean;
  error?: string;
}

/**
 * Enhanced RecipientSelection interface following documented architecture
 */
export interface EnhancedRecipientSelection {
  type: 'entire-club' | 'selected-groups' | 'selected-subgroups' | 'mixed';
  clubId?: string;
  clubName?: string;
  groups?: {
    groupId: string;
    groupName: string;
    scope: 'entire' | 'subgroups';
    subgroupIds?: string[];
    subgroupNames?: string[];
  }[];
  totalEstimatedCount: number;
}

/**
 * Orchestrating service for recipient selection functionality
 * Handles permission-based selection logic following three-layer architecture
 */
export const recipientSelectionService = {
  /**
   * Get selectable entities based on user permissions
   * Club admins can select clubs, groups, and subgroups
   * Group coaches can only select their groups and subgroups
   */
  async getSelectableEntities(userProfile: any): Promise<SelectableEntitiesResponse> {
    try {
      console.log('🎯 Getting selectable entities for user');

      if (!userProfile?.clubAccess) {
        return { 
          success: true, 
          entities: { clubs: [], groups: [], subgroups: new Map() }
        };
      }

      const clubs: SelectableEntity[] = [];
      const groups: SelectableEntity[] = [];
      const subgroups = new Map<string, SelectableEntity[]>();

      // Process each club access
      for (const clubAccess of userProfile.clubAccess) {
        const isClubAdmin = clubAccess.role === 'club-admin';

        // Club-level selection (only for club admins)
        if (isClubAdmin) {
          clubs.push({
            type: 'club',
            id: clubAccess.clubId,
            name: clubAccess.clubName,
            memberCount: 0, // TODO: Calculate if needed
            userRoles: [clubAccess.role],
            canSelect: true,
          });
        }

        // Group-level selection
        if (clubAccess.groupAccess) {
          for (const groupAccess of clubAccess.groupAccess) {
            const canManageGroup = isClubAdmin || 
              groupAccess.roles?.includes('coach') || 
              groupAccess.roles?.includes('admin');

            if (canManageGroup) {
              groups.push({
                type: 'group',
                id: groupAccess.groupId,
                name: groupAccess.groupName,
                parentId: clubAccess.clubId,
                parentName: clubAccess.clubName,
                memberCount: 0, // TODO: Get from group data if needed
                userRoles: groupAccess.roles || [],
                canSelect: true,
              });

              // Fetch subgroups for this group
              try {
                const subgroupsData = await groupService.fetchSubGroups(clubAccess.clubId, groupAccess.groupId);
                const groupSubgroups: SelectableEntity[] = [];

                for (const subgroup of subgroupsData) {
                  groupSubgroups.push({
                    type: 'subgroup',
                    id: subgroup.id,
                    name: subgroup.name,
                    parentId: groupAccess.groupId,
                    parentName: groupAccess.groupName,
                    memberCount: subgroup.memberCount || 0,
                    userRoles: groupAccess.roles || [],
                    canSelect: true,
                  });
                }

                if (groupSubgroups.length > 0) {
                  subgroups.set(groupAccess.groupId, groupSubgroups);
                }
              } catch (error) {
                console.error(`Failed to fetch subgroups for group ${groupAccess.groupId}:`, error);
              }
            }
          }
        }
      }

      console.log(`✅ Found ${clubs.length} clubs, ${groups.length} groups, ${subgroups.size} group subgroups`);

      return {
        success: true,
        entities: { clubs, groups, subgroups }
      };

    } catch (error: any) {
      console.error('❌ Error getting selectable entities:', error);
      return {
        success: false,
        error: error.message || 'Failed to get selectable entities'
      };
    }
  },

  /**
   * Calculate estimated recipient count for a selection
   * Uses Firebase Function for server-side calculation
   */
  async calculateRecipientCount(selection: EnhancedRecipientSelection): Promise<RecipientCountResponse> {
    try {
      console.log('🔢 Calculating recipient count for selection:', selection.type);

      // Call Firebase Function for server-side calculation
      const calculateRecipientCountFn = httpsCallable(functions, 'calculateRecipientCount');
      const result = await calculateRecipientCountFn({ selection });
      
      const response = result.data as {
        success: boolean;
        count?: number;
        breakdown?: {
          clubCount?: number;
          groupCounts?: { [groupId: string]: number };
          subgroupCounts?: { [subgroupId: string]: number };
        };
        error?: string;
      };

      if (!response.success) {
        console.error('❌ Failed to calculate recipient count:', response.error);
        return {
          success: false,
          error: response.error || 'Failed to calculate recipient count'
        };
      }

      console.log(`✅ Calculated recipient count: ${response.count}`);
      return {
        success: true,
        count: response.count,
        breakdown: response.breakdown
      };

    } catch (error: any) {
      console.error('❌ Error calculating recipient count:', error);
      return {
        success: false,
        error: error.message || 'Failed to calculate recipient count'
      };
    }
  },

  /**
   * Validate that user has permission for the selection
   * Uses Firebase Function for server-side validation
   */
  async validateSelection(userId: string, selection: EnhancedRecipientSelection): Promise<ValidationResponse> {
    try {
      console.log('🔒 Validating selection permissions for user:', userId);

      // Call Firebase Function for server-side validation
      const validateRecipientSelectionFn = httpsCallable(functions, 'validateRecipientSelection');
      const result = await validateRecipientSelectionFn({ selection });
      
      const response = result.data as {
        success: boolean;
        isValid?: boolean;
        permissions?: {
          clubAccess: boolean;
          groupAccess: { [groupId: string]: boolean };
          subgroupAccess: { [subgroupId: string]: boolean };
        };
        error?: string;
      };

      if (!response.success) {
        console.error('❌ Failed to validate selection:', response.error);
        return {
          success: false,
          isValid: false,
          error: response.error || 'Failed to validate selection'
        };
      }

      console.log(`✅ Selection validation result: ${response.isValid ? 'Valid' : 'Invalid'}`);
      return {
        success: true,
        isValid: response.isValid || false,
        error: response.isValid ? undefined : response.error
      };

    } catch (error: any) {
      console.error('❌ Error validating selection:', error);
      return {
        success: false,
        isValid: false,
        error: error.message || 'Failed to validate selection'
      };
    }
  },
};
