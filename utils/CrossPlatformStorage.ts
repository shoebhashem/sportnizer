import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Cross-platform storage utility that works on iOS, Android, and Web
 * - Mobile: Uses React Native AsyncStorage
 * - Web: Uses browser localStorage with AsyncStorage-compatible API
 */
class CrossPlatformStorage {
  async getItem(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        // On web, AsyncStorage uses localStorage under the hood
        // but we can add extra error handling
        return localStorage.getItem(key);
      }
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.error(`Error getting item ${key}:`, error);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(key, value);
      } else {
        await AsyncStorage.setItem(key, value);
      }
    } catch (error) {
      console.error(`Error setting item ${key}:`, error);
      throw error;
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(key);
      } else {
        await AsyncStorage.removeItem(key);
      }
    } catch (error) {
      console.error(`Error removing item ${key}:`, error);
      throw error;
    }
  }

  async multiGet(keys: string[]): Promise<[string, string | null][]> {
    try {
      if (Platform.OS === 'web') {
        return keys.map(key => [key, localStorage.getItem(key)]);
      }
      const result = await AsyncStorage.multiGet(keys);
      return result as [string, string | null][];
    } catch (error) {
      console.error('Error in multiGet:', error);
      return keys.map(key => [key, null]);
    }
  }

  async multiSet(keyValuePairs: [string, string][]): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        keyValuePairs.forEach(([key, value]) => {
          localStorage.setItem(key, value);
        });
      } else {
        await AsyncStorage.multiSet(keyValuePairs);
      }
    } catch (error) {
      console.error('Error in multiSet:', error);
      throw error;
    }
  }

  async multiRemove(keys: string[]): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        keys.forEach(key => localStorage.removeItem(key));
      } else {
        await AsyncStorage.multiRemove(keys);
      }
    } catch (error) {
      console.error('Error in multiRemove:', error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.clear();
      } else {
        await AsyncStorage.clear();
      }
    } catch (error) {
      console.error('Error clearing storage:', error);
      throw error;
    }
  }

  // Get storage size information (useful for debugging)
  async getStorageInfo(): Promise<{ platform: string; used: string; available?: string }> {
    try {
      if (Platform.OS === 'web') {
        // Estimate localStorage usage
        let used = 0;
        for (let key in localStorage) {
          if (localStorage.hasOwnProperty(key)) {
            used += localStorage[key].length + key.length;
          }
        }
        return {
          platform: 'web',
          used: `${(used / 1024).toFixed(2)} KB`
        };
      } else {
        // For React Native, we can't easily get storage size
        return {
          platform: Platform.OS,
          used: 'Available on device'
        };
      }
    } catch (error) {
      console.error('Error getting storage info:', error);
      return {
        platform: Platform.OS,
        used: 'Unknown'
      };
    }
  }
}

// Export a singleton instance
export const storage = new CrossPlatformStorage();

// Also export the class for testing
export default CrossPlatformStorage;
