// /services/versioning/versionCheckService.ts

import { storage } from '@/utils/CrossPlatformStorage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../core/firebase';
import {
    VERSION_CONFIG,
    VersionCheckResult
} from '../types/versioning';

/**
 * Generic version checking service for any Firestore document
 */
export async function checkDocumentVersion<T>(
  documentPath: string,
  cacheKey: string
): Promise<VersionCheckResult<T>> {
  try {
    console.log(`🔄 Checking version for: ${documentPath}`);

    let remoteVersion = 0;
    let isOffline = false;

    try {
      // Get remote version
      const docRef = doc(db, documentPath);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        console.warn(`⚠️ Document not found: ${documentPath}`);
        return {
          needsUpdate: false,
          localVersion: 0,
          remoteVersion: 0,
        };
      }

      const docData = docSnap.data();
      remoteVersion = docData.version || 1;
    } catch (firebaseError: any) {
      // Handle offline scenarios
      if (firebaseError.code === 'unavailable' || 
          firebaseError.message?.includes('offline') || 
          firebaseError.message?.includes('Failed to get document because the client is offline')) {
        console.warn(`📱 Offline mode detected for ${documentPath}, using cached data only`);
        isOffline = true;
        remoteVersion = 0; // Will fallback to cache
      } else {
        throw firebaseError; // Re-throw non-offline errors
      }
    }

    console.log(`📄 Remote version for ${documentPath}: ${remoteVersion}`);

    // Get cached version
    const cachedDataStr = await storage.getItem(cacheKey);
    let localVersion = 0;
    let cachedData: T | undefined;

    if (cachedDataStr) {
      try {
        const parsedCache = JSON.parse(cachedDataStr);
        localVersion = parsedCache.version || 0;
        cachedData = parsedCache.data;
        
        // Check if cache is expired (only if we're online)
        if (!isOffline) {
          const lastFetched = new Date(parsedCache.lastFetched);
          const hoursSinceCache = (Date.now() - lastFetched.getTime()) / (1000 * 60 * 60);
          
          if (hoursSinceCache > VERSION_CONFIG.CACHE_EXPIRY_HOURS) {
            console.log(`⏰ Cache expired for ${documentPath}, forcing refresh`);
            localVersion = 0; // Force update
          }
        }
      } catch (error) {
        console.error(`❌ Error parsing cached data for ${documentPath}:`, error);
        localVersion = 0;
      }
    }

    console.log(`💾 Local version for ${documentPath}: ${localVersion}`);

    // If offline and we have cached data, use it regardless of version
    if (isOffline && cachedData) {
      console.log(`📱 Using cached data for ${documentPath} (offline mode)`);
      return {
        needsUpdate: false,
        localVersion,
        remoteVersion: localVersion, // Treat as up-to-date when offline
        data: cachedData,
      };
    }

    // If offline but no cached data, return empty result
    if (isOffline && !cachedData) {
      console.warn(`📱 No cached data available for ${documentPath} (offline mode)`);
      return {
        needsUpdate: false,
        localVersion: 0,
        remoteVersion: 0,
        data: undefined,
      };
    }

    // Normal online behavior
    const needsUpdate = remoteVersion > localVersion;

    return {
      needsUpdate,
      localVersion,
      remoteVersion,
      data: needsUpdate ? undefined : cachedData, // Return cached data if no update needed
    };

  } catch (error) {
    console.error(`❌ Error checking version for ${documentPath}:`, error);
    return {
      needsUpdate: true, // Default to update on error
      localVersion: 0,
      remoteVersion: 0,
    };
  }
}

/**
 * Save data to cache with version information
 */
export async function saveToCacheWithVersion<T>(
  cacheKey: string,
  data: T,
  version: number
): Promise<void> {
  try {
    const cacheData = {
      data,
      version,
      lastFetched: new Date().toISOString(),
    };

    await storage.setItem(cacheKey, JSON.stringify(cacheData));
    console.log(`💾 Cached data with version ${version} for key: ${cacheKey}`);
  } catch (error) {
    console.error(`❌ Error caching data for ${cacheKey}:`, error);
  }
}

/**
 * Clear specific cache entry
 */
export async function clearCache(cacheKey: string): Promise<void> {
  try {
    await storage.removeItem(cacheKey);
    console.log(`🗑️ Cleared cache for key: ${cacheKey}`);
  } catch (error) {
    console.error(`❌ Error clearing cache for ${cacheKey}:`, error);
  }
}

/**
 * Clear all version-related cache by clearing entire storage
 * Note: This clears all data, not just version-related cache
 */
export async function clearAllVersionCache(): Promise<void> {
  try {
    await storage.clear();
    console.log(`🗑️ Cleared all cache storage`);
  } catch (error) {
    console.error(`❌ Error clearing all version cache:`, error);
  }
}
