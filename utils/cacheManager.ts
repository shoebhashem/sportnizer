import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CacheConfig {
  maxSize: number; // in MB
  ttl: number; // time to live in milliseconds
  priority: 'high' | 'medium' | 'low';
  strategy: 'aggressive' | 'moderate' | 'minimal';
}

export interface UserCacheProfile {
  userId: string;
  roles: string[];
  clubCount: number;
  groupCount: number;
  memberCount: number;
  cacheConfig: CacheConfig;
}

export class CacheManager {
  private static instance: CacheManager;
  private userProfile: UserCacheProfile | null = null;
  private cacheKeys: Set<string> = new Set();

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  // Determine cache strategy based on user profile
  async initializeUserCache(user: any, userRoles: string[], clubs: any[], groups: any[]): Promise<void> {
    const totalMembers = this.calculateTotalMembers(clubs, groups);
    
    const profile: UserCacheProfile = {
      userId: user.uid,
      roles: userRoles,
      clubCount: clubs.length,
      groupCount: groups.length,
      memberCount: totalMembers,
      cacheConfig: this.determineCacheConfig(userRoles, clubs.length, groups.length, totalMembers)
    };

    this.userProfile = profile;
    await this.saveCacheProfile(profile);
    
    console.log(`Cache initialized for user: ${this.getCacheStrategyDescription()}`);
  }

  private determineCacheConfig(roles: string[], clubCount: number, groupCount: number, memberCount: number): CacheConfig {
    // Super Admin / Club Owner - Massive cache needs
    if (roles.includes('super_admin') || clubCount > 5) {
      return {
        maxSize: 10, // 10MB
        ttl: 24 * 60 * 60 * 1000, // 24 hours
        priority: 'high',
        strategy: 'aggressive'
      };
    }

    // Club Admin - Large cache needs
    if (roles.includes('admin') && (clubCount > 1 || memberCount > 100)) {
      return {
        maxSize: 5, // 5MB
        ttl: 12 * 60 * 60 * 1000, // 12 hours
        priority: 'high',
        strategy: 'aggressive'
      };
    }

    // Coach with multiple groups - Medium cache needs
    if (roles.includes('coach') && groupCount > 2) {
      return {
        maxSize: 2, // 2MB
        ttl: 6 * 60 * 60 * 1000, // 6 hours
        priority: 'medium',
        strategy: 'moderate'
      };
    }

    // Regular coach or admin with small scope
    if (roles.includes('coach') || roles.includes('admin')) {
      return {
        maxSize: 1, // 1MB
        ttl: 4 * 60 * 60 * 1000, // 4 hours
        priority: 'medium',
        strategy: 'moderate'
      };
    }

    // Regular member - Minimal cache needs
    return {
      maxSize: 0.5, // 500KB
      ttl: 2 * 60 * 60 * 1000, // 2 hours
      priority: 'low',
      strategy: 'minimal'
    };
  }

  private calculateTotalMembers(clubs: any[], groups: any[]): number {
    // Estimate based on clubs and groups
    // This would be refined based on actual data
    return clubs.length * 50 + groups.length * 20; // Rough estimate
  }

  getCacheStrategyDescription(): string {
    if (!this.userProfile) return 'Not initialized';
    
    const { cacheConfig, roles, clubCount, groupCount } = this.userProfile;
    return `Strategy: ${cacheConfig.strategy}, Size: ${cacheConfig.maxSize}MB, Roles: ${roles.join(',')}, Clubs: ${clubCount}, Groups: ${groupCount}`;
  }

  // Intelligent caching based on user role
  async cacheData(key: string, data: any, priority: 'critical' | 'important' | 'nice-to-have' = 'important'): Promise<void> {
    if (!this.userProfile) return;

    const { strategy, maxSize } = this.userProfile.cacheConfig;
    
    // Check if we should cache based on strategy and priority
    if (!this.shouldCache(strategy, priority)) {
      return;
    }

    try {
      const currentSize = await this.getCurrentCacheSize();
      const dataSize = this.estimateDataSize(data);
      
      // If adding this data would exceed limit, clear some cache
      if (currentSize + dataSize > maxSize * 1024 * 1024) {
        await this.performCacheCleanup(dataSize);
      }

      const cacheEntry = {
        data,
        timestamp: Date.now(),
        priority,
        size: dataSize
      };

      await AsyncStorage.setItem(this.getCacheKey(key), JSON.stringify(cacheEntry));
      this.cacheKeys.add(key);
      
    } catch (error) {
      console.error('Cache write failed:', error);
    }
  }

  private shouldCache(strategy: string, priority: string): boolean {
    switch (strategy) {
      case 'aggressive':
        return true; // Cache everything
      case 'moderate':
        return priority === 'critical' || priority === 'important';
      case 'minimal':
        return priority === 'critical';
      default:
        return false;
    }
  }

  // Retrieve cached data with TTL check
  async getCachedData(key: string): Promise<any | null> {
    if (!this.userProfile) return null;

    try {
      const cached = await AsyncStorage.getItem(this.getCacheKey(key));
      if (!cached) return null;

      const entry = JSON.parse(cached);
      const { data, timestamp } = entry;
      
      // Check TTL
      if (Date.now() - timestamp > this.userProfile.cacheConfig.ttl) {
        await this.removeCachedData(key);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Cache read failed:', error);
      return null;
    }
  }

  // Smart cache cleanup based on priority and age
  private async performCacheCleanup(requiredSpace: number): Promise<void> {
    const cacheEntries = await this.getAllCacheEntries();
    
    // Sort by priority (low first) and age (old first)
    cacheEntries.sort((a, b) => {
      const priorityOrder = { 'nice-to-have': 1, 'important': 2, 'critical': 3 };
      const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 1;
      const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 1;
      
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.timestamp - b.timestamp; // Older first
    });

    let freedSpace = 0;
    for (const entry of cacheEntries) {
      await this.removeCachedData(entry.key);
      freedSpace += entry.size;
      
      if (freedSpace >= requiredSpace) break;
    }
  }

  private async getAllCacheEntries(): Promise<{key: string, priority: string, timestamp: number, size: number}[]> {
    const entries = [];
    
    for (const key of this.cacheKeys) {
      try {
        const cached = await AsyncStorage.getItem(this.getCacheKey(key));
        if (cached) {
          const entry = JSON.parse(cached);
          entries.push({
            key,
            priority: entry.priority,
            timestamp: entry.timestamp,
            size: entry.size
          });
        }
      } catch (error) {
        // Remove invalid entries
        this.cacheKeys.delete(key);
      }
    }
    
    return entries;
  }

  async removeCachedData(key: string): Promise<void> {
    await AsyncStorage.removeItem(this.getCacheKey(key));
    this.cacheKeys.delete(key);
  }

  async clearAllCache(): Promise<void> {
    for (const key of this.cacheKeys) {
      await AsyncStorage.removeItem(this.getCacheKey(key));
    }
    this.cacheKeys.clear();
  }

  private async getCurrentCacheSize(): Promise<number> {
    let totalSize = 0;
    
    for (const key of this.cacheKeys) {
      try {
        const cached = await AsyncStorage.getItem(this.getCacheKey(key));
        if (cached) {
          totalSize += new Blob([cached]).size;
        }
      } catch (error) {
        // Remove invalid entries
        this.cacheKeys.delete(key);
      }
    }
    
    return totalSize;
  }

  private estimateDataSize(data: any): number {
    return new Blob([JSON.stringify(data)]).size;
  }

  private getCacheKey(key: string): string {
    return `cache_${this.userProfile?.userId}_${key}`;
  }

  private async saveCacheProfile(profile: UserCacheProfile): Promise<void> {
    await AsyncStorage.setItem('user_cache_profile', JSON.stringify(profile));
  }

  async loadCacheProfile(): Promise<UserCacheProfile | null> {
    try {
      const profile = await AsyncStorage.getItem('user_cache_profile');
      return profile ? JSON.parse(profile) : null;
    } catch {
      return null;
    }
  }

  // Get cache usage statistics
  async getCacheStats(): Promise<{
    currentSize: number;
    maxSize: number;
    itemCount: number;
    strategy: string;
    utilizationPercent: number;
  }> {
    const currentSize = await this.getCurrentCacheSize();
    const maxSize = (this.userProfile?.cacheConfig.maxSize || 0.5) * 1024 * 1024;
    
    return {
      currentSize,
      maxSize,
      itemCount: this.cacheKeys.size,
      strategy: this.userProfile?.cacheConfig.strategy || 'minimal',
      utilizationPercent: (currentSize / maxSize) * 100
    };
  }
}

export default CacheManager;
