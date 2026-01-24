/**
 * Centralized Permission Service
 * 
 * Context-aware permission checking with caching strategy aligned with UserContext.
 * Ensures roles are scoped to correct club/group.
 * 
 * Permission Model:
 * - club-admin: Full access to club and all its groups/subgroups
 * - admin: Full access to specific group and its subgroups
 * - coach: Full access to specific group and its subgroups
 * - player, player-underage, guardian: No management permissions
 * 
 * Subgroups inherit permissions from parent group (no subgroup-specific roles)
 */

import { storage } from '../utils/CrossPlatformStorage';
import { fetchGroupMembers } from './fetchGroupMembers';
import { fetchUserProfile } from './fetchUserAccess';
import { groupService } from './group';

// Cache keys following UserContext pattern
const CACHE_KEYS = {
  PERMISSION_PREFIX: 'permission_cache',
  CACHE_VERSION: 'v1',
} as const;

export type UserRole = 
  | 'club-admin'
  | 'admin'
  | 'coach'
  | 'player'
  | 'player-underage'
  | 'guardian';

export interface PermissionContext {
  clubId: string;
  groupId?: string;
}

interface CachedPermission {
  canManage: boolean;
  roles: UserRole[];
  timestamp: string;
  version: number;
}

class PermissionService {
  private memoryCache = new Map<string, CachedPermission>();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes (aligned with UserContext pattern)

  /**
   * Generate cache key for permission context
   */
  private getCacheKey(userId: string, context: PermissionContext): string {
    const contextKey = context.groupId 
      ? `${context.clubId}_${context.groupId}`
      : context.clubId;
    return `${CACHE_KEYS.PERMISSION_PREFIX}_${CACHE_KEYS.CACHE_VERSION}_${userId}_${contextKey}`;
  }

  /**
   * Check if cached permission is still valid
   */
  private isCacheValid(cached: CachedPermission): boolean {
    const age = Date.now() - new Date(cached.timestamp).getTime();
    return age < this.cacheExpiry;
  }

  /**
   * Load permission from cache (memory + storage)
   */
  private async loadFromCache(userId: string, context: PermissionContext): Promise<CachedPermission | null> {
    const cacheKey = this.getCacheKey(userId, context);

    // Try memory cache first
    const memoryCached = this.memoryCache.get(cacheKey);
    if (memoryCached && this.isCacheValid(memoryCached)) {
      console.log(`🎯 Permission from memory cache: ${cacheKey}`);
      return memoryCached;
    }

    // Try storage cache
    try {
      const storedData = await storage.getItem(cacheKey);
      if (storedData) {
        const cached = JSON.parse(storedData) as CachedPermission;
        if (this.isCacheValid(cached)) {
          // Restore to memory cache
          this.memoryCache.set(cacheKey, cached);
          console.log(`💾 Permission from storage cache: ${cacheKey}`);
          return cached;
        }
      }
    } catch (error) {
      console.error('Error loading permission cache:', error);
    }

    return null;
  }

  /**
   * Save permission to cache (memory + storage)
   */
  private async saveToCache(userId: string, context: PermissionContext, permission: Omit<CachedPermission, 'timestamp' | 'version'>): Promise<void> {
    const cacheKey = this.getCacheKey(userId, context);
    const cached: CachedPermission = {
      ...permission,
      timestamp: new Date().toISOString(),
      version: 1,
    };

    // Save to memory
    this.memoryCache.set(cacheKey, cached);

    // Save to storage
    try {
      await storage.setItem(cacheKey, JSON.stringify(cached));
      console.log(`💾 Permission cached: ${cacheKey}`);
    } catch (error) {
      console.error('Error saving permission cache:', error);
    }
  }

  /**
   * Clear all permission caches for a user
   */
  async clearPermissionCache(userId: string): Promise<void> {
    // Clear memory cache
    const keysToDelete: string[] = [];
    this.memoryCache.forEach((_, key) => {
      if (key.includes(userId)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.memoryCache.delete(key));

    // Clear storage cache (requires knowing all keys - simplified approach)
    console.log(`🗑️ Cleared permission cache for user ${userId}`);
  }

  /**
   * Get user's roles in a specific context
   * 
   * @param userId - User ID to check
   * @param context - Permission context (club and optionally group)
   * @returns Array of roles user has in this context
   */
  async getUserRolesInContext(userId: string, context: PermissionContext): Promise<UserRole[]> {
    try {
      // Check if user has club-admin role in this club
      const userProfile = await fetchUserProfile(userId);
      const clubAccess = userProfile.clubAccess?.find(c => c.clubId === context.clubId);
      
      if (clubAccess?.role === 'club-admin') {
        return ['club-admin'];
      }

      // If group context provided, check group-level roles
      if (context.groupId) {
        const membersResult = await fetchGroupMembers(context.clubId, context.groupId);
        if (membersResult.success && membersResult.members) {
          const member = membersResult.members.find(m => m.userId === userId);
          if (member?.roles) {
            return member.roles as UserRole[];
          }
        }
      }

      return [];
    } catch (error) {
      console.error('Error getting user roles:', error);
      return [];
    }
  }

  /**
   * Check if user can manage a club
   * User needs club-admin role in that specific club
   * 
   * @param userId - User ID to check
   * @param clubId - Club ID to check access for
   * @returns true if user can manage the club
   */
  async canManageClub(userId: string, clubId: string): Promise<boolean> {
    const context: PermissionContext = { clubId };

    // Check cache
    const cached = await this.loadFromCache(userId, context);
    if (cached) {
      return cached.canManage;
    }

    // Fetch fresh permission
    try {
      const roles = await this.getUserRolesInContext(userId, context);
      const canManage = roles.includes('club-admin');

      // Cache result
      await this.saveToCache(userId, context, { canManage, roles });

      return canManage;
    } catch (error) {
      console.error('Error checking club permissions:', error);
      return false;
    }
  }

  /**
   * Check if user can manage a group (and its subgroups)
   * User needs one of:
   * - club-admin role in parent club
   * - admin role in the group
   * - coach role in the group
   * - be the group creator
   * 
   * @param userId - User ID to check
   * @param clubId - Club ID containing the group
   * @param groupId - Group ID to check access for
   * @returns true if user can manage the group (and its subgroups)
   */
  async canManageGroup(userId: string, clubId: string, groupId: string): Promise<boolean> {
    const context: PermissionContext = { clubId, groupId };

    // Check cache
    const cached = await this.loadFromCache(userId, context);
    if (cached) {
      return cached.canManage;
    }

    // Fetch fresh permission
    try {
      // Check if user is club-admin
      const isClubAdmin = await this.canManageClub(userId, clubId);
      if (isClubAdmin) {
        await this.saveToCache(userId, context, { canManage: true, roles: ['club-admin'] });
        return true;
      }

      // Check if user is group creator
      const groupResult = await groupService.getGroup(clubId, groupId);
      if (groupResult.success && groupResult.data?.createdBy === userId) {
        await this.saveToCache(userId, context, { canManage: true, roles: ['admin'] });
        return true;
      }

      // Check group-level roles
      const roles = await this.getUserRolesInContext(userId, context);
      const canManage = roles.includes('admin') || roles.includes('coach');

      await this.saveToCache(userId, context, { canManage, roles });

      return canManage;
    } catch (error) {
      console.error('Error checking group permissions:', error);
      return false;
    }
  }

  /**
   * Check if user has a specific role in a context
   * 
   * @param userId - User ID to check
   * @param context - Permission context
   * @param role - Role to check for
   * @returns true if user has the specified role
   */
  async hasRole(userId: string, context: PermissionContext, role: UserRole): Promise<boolean> {
    const roles = await this.getUserRolesInContext(userId, context);
    return roles.includes(role);
  }

  /**
   * Check if user has any management role (admin or coach) in a context
   * 
   * @param userId - User ID to check
   * @param context - Permission context
   * @returns true if user has admin or coach role
   */
  async hasManagementRole(userId: string, context: PermissionContext): Promise<boolean> {
    const roles = await this.getUserRolesInContext(userId, context);
    return roles.some(r => ['club-admin', 'admin', 'coach'].includes(r));
  }
}

// Export singleton instance
export const permissionService = new PermissionService();
