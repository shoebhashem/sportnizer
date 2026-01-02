// /services/member.ts - Member orchestration service following data completion patterns
// Handles data completion, validation, and context-dependent field assignment

import { httpsCallable } from 'firebase/functions';
import { getCurrentUser } from './auth/authService';
import { functions } from './core/firebase';
import type { UserProfile } from './types/user';

// Firebase Function references - atomic member management functions
const addMemberToClubFn = httpsCallable(functions, 'addMemberToClub');
const removeMemberFromClubFn = httpsCallable(functions, 'removeMemberFromClub');
const addMemberToGroupFn = httpsCallable(functions, 'addMemberToGroup');
const removeMemberFromGroupFn = httpsCallable(functions, 'removeMemberFromGroup');
const updateMemberRoleFn = httpsCallable(functions, 'updateMemberRole');
const inviteMemberFn = httpsCallable(functions, 'inviteMember');
const createMemberAccountFn = httpsCallable(functions, 'createMemberAccount');

// Service response types
interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

interface ValidationResponse {
  success: boolean;
  errors?: string[];
  warnings?: string[];
}

// Member data interfaces
interface MemberInvitationData {
  email: string;
  name: string;
  role?: 'club-admin' | 'member';
  clubId: string;
  clubName: string;
  groupId?: string;
  groupName?: string;
  invitedBy?: string;
}

interface CompleteMemberData {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  role: 'club-admin' | 'member';
  clubId: string;
  clubName: string;
  status: 'invited' | 'active' | 'inactive';
  invitedAt?: Date;
  invitedBy?: string;
  joinedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  version: number;
}

/**
 * Context-dependent field assignment utilities
 */
const determineEmailVerification = (context: 'invitation' | 'signup' | 'admin-create'): boolean => {
  switch (context) {
    case 'invitation':
      return true;   // Invited members have verified emails (invitation serves as verification)
    case 'signup':
      return false;  // Regular signups need verification
    case 'admin-create':
      return true;   // Admin-created accounts are pre-verified
    default:
      return false;
  }
};

const getDefaultPermissions = (role: string): string[] => {
  switch (role) {
    case 'club-admin':
      return ['read', 'write', 'admin', 'invite'];
    case 'member':
      return ['read'];
    default:
      return ['read'];
  }
};

const generateId = (): string => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

export const memberService = {
  /**
   * Invite member to club - Demonstrates data completion pattern for invitations
   * Service completes all required fields before calling Firebase Function
   */
  async inviteMember(invitationData: MemberInvitationData): Promise<ServiceResponse<string>> {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        return {
          success: false,
          error: 'No authenticated user found',
          code: 'auth/user-not-authenticated'
        };
      }

      // Service layer completes the member data structure
      const completeMemberData: CompleteMemberData = {
        // Copy provided data
        email: invitationData.email.toLowerCase().trim(),
        name: invitationData.name.trim(),
        clubId: invitationData.clubId,
        clubName: invitationData.clubName,
        
        // Complete required fields with context-dependent values
        id: generateId(),
        emailVerified: determineEmailVerification('invitation'), // true for invited members
        role: invitationData.role || 'member',
        status: 'invited',
        
        // Set invitation tracking
        invitedAt: new Date(),
        invitedBy: currentUser.uid,
        
        // Set audit fields
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: currentUser.uid,
        version: 1,
      };

      // Call atomic function with complete data
      const result = await inviteMemberFn(completeMemberData);
      const response = result.data as { success: boolean; memberId?: string; error?: string };
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to invite member'
        };
      }

      return {
        success: true,
        data: response.memberId
      };
    } catch (error: any) {
      console.error('❌ Error inviting member:', error);
      return {
        success: false,
        error: error.message || 'Failed to invite member'
      };
    }
  },

  /**
   * Create member account - For admin-created accounts (no invitation)
   * Demonstrates different emailVerified logic based on context
   */
  async createMemberAccount(memberData: Partial<UserProfile>, clubId: string, clubName: string): Promise<ServiceResponse<string>> {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        return {
          success: false,
          error: 'No authenticated user found',
          code: 'auth/user-not-authenticated'
        };
      }

      // Service completes data for admin-created accounts
      const completeMemberData: CompleteMemberData = {
        ...memberData,
        id: generateId(),
        email: memberData.email!.toLowerCase().trim(),
        name: memberData.displayName!.trim(),
        emailVerified: determineEmailVerification('admin-create'), // true for admin-created
        role: (memberData as any).role || 'member',
        clubId,
        clubName,
        status: 'active', // Admin-created accounts are immediately active
        joinedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: currentUser.uid,
        version: 1,
      };

      const result = await createMemberAccountFn(completeMemberData);
      const response = result.data as { success: boolean; memberId?: string; error?: string };
      
      return {
        success: response.success,
        data: response.memberId,
        error: response.error
      };
    } catch (error: any) {
      console.error('❌ Error creating member account:', error);
      return {
        success: false,
        error: error.message || 'Failed to create member account'
      };
    }
  },

  /**
   * Validate member invitation data before processing
   */
  async validateInvitation(invitationData: MemberInvitationData): Promise<ValidationResponse> {
    const errors: string[] = [];
    
    // Email validation
    if (!invitationData.email || !invitationData.email.includes('@')) {
      errors.push('Valid email address is required');
    }
    
    // Name validation
    if (!invitationData.name || invitationData.name.trim().length < 2) {
      errors.push('Member name must be at least 2 characters');
    }
    
    // Club validation
    if (!invitationData.clubId || !invitationData.clubName) {
      errors.push('Club information is required');
    }
    
    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  },

  /**
   * Add member to club
   */
  async addMemberToClub(clubId: string, memberData: {
    userId: string;
    role: 'club-admin' | 'member';
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await addMemberToClubFn({ clubId, memberData });
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error('❌ Error adding member to club:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Remove member from club
   */
  async removeMemberFromClub(clubId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await removeMemberFromClubFn({ clubId, userId });
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error('❌ Error removing member from club:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Add member to group
   */
  async addMemberToGroup(clubId: string, groupId: string, memberData: {
    userId: string;
    roles: string[];
    subGroups?: string[];
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await addMemberToGroupFn({ clubId, groupId, memberData });
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error('❌ Error adding member to group:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Remove member from group
   */
  async removeMemberFromGroup(clubId: string, groupId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await removeMemberFromGroupFn({ clubId, groupId, userId });
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error('❌ Error removing member from group:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Update member role
   */
  async updateMemberRole(clubId: string, groupId: string | null, userId: string, newRoles: string[]): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await updateMemberRoleFn({ clubId, groupId, userId, newRoles });
      return result.data as { success: boolean; error?: string };
    } catch (error: any) {
      console.error('❌ Error updating member role:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Add unconfirmed child to group (temporary implementation using addMemberToGroup)
   * TODO: Create dedicated addUnconfirmedChild Firebase Function if special logic is needed
   */
  async addUnconfirmedChild(groupId: string, childData: { name: string; birthDate?: string }): Promise<{ success: boolean; error?: string }> {
    try {
      // For now, use the existing addMemberToGroup function
      // In a real implementation, you might want a dedicated Firebase Function for unconfirmed children
      console.log('⚠️ addUnconfirmedChild: Using temporary implementation. Consider creating dedicated Firebase Function.');
      
      // This would need to be adapted based on your specific requirements for unconfirmed children
      // For now, return a placeholder response
      return { 
        success: false, 
        error: 'addUnconfirmedChild not fully implemented. Create dedicated Firebase Function for this functionality.' 
      };
    } catch (error: any) {
      console.error('❌ Error adding unconfirmed child:', error);
      return { success: false, error: error.message };
    }
  }
};
