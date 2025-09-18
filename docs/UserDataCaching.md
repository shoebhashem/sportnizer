# User Data Caching Implementation Guide

This guide explains how to implement client-side caching for user data in your React Native app to reduce Firestore reads and improve performance.

## 🎯 **What This Achieves**

1. **Reduced Firestore Reads**: User data is cached locally and only updated when changes occur
2. **Faster App Performance**: Immediate data access from AsyncStorage instead of waiting for network requests
3. **Offline Capability**: User data remains available even without network connection
4. **Real-time Updates**: Firestore listeners ensure cache stays in sync with server changes
5. **Smart Cache Management**: Automatic cache expiration and version control

## 📁 **Files Created**

### 1. **UserContext.tsx** - Main caching implementation
- **Purpose**: Provides global user state with intelligent caching
- **Features**:
  - AsyncStorage for local data persistence
  - Firestore real-time listeners for live updates
  - Cache versioning and expiration
  - Optimistic updates for better UX
  - Automatic cache invalidation

### 2. **UserContextUsage.tsx** - Implementation examples
- **Purpose**: Shows how to use the UserContext in your components
- **Examples**:
  - Basic user profile display
  - Authentication guards
  - User groups listing
  - Profile updates with optimistic UI

## 🚀 **How to Implement**

### Step 1: Install Dependencies
```bash
npm install @react-native-async-storage/async-storage
```

### Step 2: Wrap Your App with UserProvider
```tsx
// In your App.tsx or _layout.tsx
import { UserProvider } from './contexts/UserContext';

export default function App() {
  return (
    <UserProvider>
      {/* Your app components */}
    </UserProvider>
  );
}
```

### Step 3: Use in Components
```tsx
import { useUser, useUserGroups } from '../contexts/UserContext';

function MyComponent() {
  const { userProfile, isFromCache, refreshUserProfile } = useUser();
  const userGroups = useUserGroups();
  
  // Your component logic
}
```

## 🧠 **Caching Strategy**

### Cache Lifecycle
1. **User Signs In**: Load from cache immediately, then setup Firestore listener
2. **Data Changes**: Firestore listener updates cache automatically
3. **User Signs Out**: Clear all cached data
4. **App Restart**: Load from cache first, then sync with Firestore

### Cache Validation
- **Version Control**: Cache invalidated when CACHE_VERSION changes
- **Time Expiration**: Cache expires after 24 hours (configurable)
- **Data Integrity**: Corrupted cache is automatically cleared

### Firestore Integration
- **Real-time Listeners**: `onSnapshot` keeps cache synchronized
- **Optimistic Updates**: UI updates immediately, syncs with Firestore later
- **Error Handling**: Failed updates revert optimistic changes

## 📊 **Performance Benefits**

### Before (Direct Firestore Reads)
```
Screen Load → Firestore Read → Display Data
Time: ~500-2000ms per screen
Cost: 1 read per screen visit
```

### After (With Caching)
```
Screen Load → AsyncStorage Read → Display Data (immediate)
             ↓
           Firestore Listener → Update Cache (background)
Time: ~10-50ms for cached data
Cost: 1 read per session + real-time updates only
```

### Read Reduction Examples
- **Profile Screen**: From 1 read per visit → 1 read per session
- **Groups Screen**: From 1 read per visit → 1 read per session
- **Navigation**: From multiple reads → cached data access
- **Total Reduction**: ~70-90% fewer Firestore reads

## 🔧 **Configuration Options**

### Cache Settings (in UserContext.tsx)
```tsx
const CACHE_VERSION = '1.0'; // Increment to invalidate all caches
const CACHE_EXPIRY_HOURS = 24; // Cache expires after 24 hours
```

### Storage Keys
```tsx
const STORAGE_KEYS = {
  USER_PROFILE: 'user_profile',
  CACHE_TIMESTAMP: 'user_cache_timestamp',
  CACHE_VERSION: 'user_cache_version',
};
```

## 🎨 **Usage Patterns**

### 1. Basic User Info Display
```tsx
function UserHeader() {
  const { userProfile } = useUser();
  return <Text>{userProfile?.name}</Text>;
}
```

### 2. Authentication Guard
```tsx
function ProtectedScreen() {
  const { isAuthenticated, isLoading } = useUser();
  
  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <LoginScreen />;
  
  return <YourProtectedContent />;
}
```

### 3. User Groups Access
```tsx
function GroupsList() {
  const userGroups = useUserGroups();
  return (
    <FlatList 
      data={userGroups}
      renderItem={({ item }) => <GroupItem group={item} />}
    />
  );
}
```

### 4. Profile Updates
```tsx
function UpdateProfile() {
  const { updateUserProfile } = useUser();
  
  const handleSave = async (newData) => {
    // This updates cache immediately and syncs with Firestore
    await updateUserProfile(newData);
  };
}
```

## 🔄 **Cache Update Scenarios**

### Automatic Updates (via Firestore Listeners)
- Profile changes from other devices
- Group membership changes
- Email verification status
- Any other user document updates

### Manual Updates (via API calls)
```tsx
const { refreshUserProfile } = useUser();

// Force refresh from Firestore
await refreshUserProfile();
```

### Optimistic Updates
```tsx
const { updateUserProfile } = useUser();

// UI updates immediately, syncs in background
await updateUserProfile({ name: 'New Name' });
```

## 🛡️ **Error Handling**

### Cache Corruption
- Automatically detected and cleared
- Fallback to Firestore data
- User sees loading state briefly

### Network Issues
- Cached data remains available
- Updates queued when connection returns
- Firestore handles offline persistence

### Listener Failures
- Automatic retry mechanisms
- Manual refresh options available
- Error logging for debugging

## 📱 **Cache Status Indicators**

```tsx
function CacheStatusIndicator() {
  const { isFromCache, lastCacheUpdate } = useUser();
  
  return (
    <Text style={{ fontSize: 12, color: '#888' }}>
      {isFromCache 
        ? `📱 From cache (${lastCacheUpdate?.toLocaleTimeString()})` 
        : '☁️ Live data'
      }
    </Text>
  );
}
```

## 🔄 **Integration with Existing Code**

### Replace Direct Firestore Calls
```tsx
// Before
const getUserData = async (uid) => {
  const userDoc = await getDoc(doc(db, 'users', uid));
  return userDoc.data();
};

// After
const { userProfile } = useUser(); // Always available, cached
```

### Update User Profile Functions
```tsx
// Your existing update functions can trigger cache updates
// by using the Firestore listener approach
```

## 🎯 **Best Practices**

1. **Always use the context hooks** instead of direct Firestore reads for user data
2. **Keep cache structure simple** - don't cache complex nested data
3. **Use optimistic updates** for better user experience
4. **Monitor cache hit rates** in development
5. **Handle cache misses gracefully** with loading states
6. **Clear cache on sign out** to prevent data leaks
7. **Version your cache** when changing data structure

## 🐛 **Debugging**

### Cache Debugging
```tsx
// Add to any component to debug cache state
const { userProfile, isFromCache, lastCacheUpdate } = useUser();
console.log('Cache Debug:', {
  hasProfile: !!userProfile,
  isFromCache,
  cacheAge: lastCacheUpdate ? Date.now() - lastCacheUpdate.getTime() : 'N/A'
});
```

### Clear Cache for Testing
```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';

// Clear all app cache
await AsyncStorage.clear();
```

This implementation provides a robust, scalable solution for user data caching that will significantly improve your app's performance while maintaining data consistency and user experience.
