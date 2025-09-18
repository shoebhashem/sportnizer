import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useIsAuthenticated, useUser, useUserGroups } from '../contexts/UserContext';

// Example 1: Basic user profile display
export function UserProfileHeader() {
  const { userProfile, isFromCache, lastCacheUpdate } = useUser();

  if (!userProfile) {
    return <Text>No user profile available</Text>;
  }

  return (
    <View style={styles.profileHeader}>
      <Text style={styles.userName}>{userProfile.name}</Text>
      <Text style={styles.userEmail}>{userProfile.email}</Text>
      
      {/* Cache status indicator */}
      {isFromCache && (
        <Text style={styles.cacheInfo}>
          📱 From cache (updated: {lastCacheUpdate?.toLocaleTimeString()})
        </Text>
      )}
    </View>
  );
}

// Example 2: Authentication guard
export function AuthenticatedContent({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useIsAuthenticated();

  if (isLoading) {
    return <Text>Loading...</Text>;
  }

  if (!isAuthenticated) {
    return <Text>Please sign in to continue</Text>;
  }

  return <>{children}</>;
}

// Example 3: User groups display
export function UserGroupsList() {
  const userGroups = useUserGroups();

  return (
    <View style={styles.groupsList}>
      <Text style={styles.groupsTitle}>My Groups ({userGroups.length})</Text>
      {userGroups.map((group) => (
        <View key={group.groupId} style={styles.groupItem}>
          <Text>Group ID: {group.groupId}</Text>
          <Text>Role: {group.roles.join(', ')}</Text>
          <Text>Status: {group.status}</Text>
        </View>
      ))}
    </View>
  );
}

// Example 4: Full user management component
export function UserManagementExample() {
  const { 
    userProfile, 
    isFromCache, 
    refreshUserProfile, 
    updateUserProfile, 
    clearUserData
  } = useUser();

  const handleUpdateProfile = async () => {
    await updateUserProfile({
      name: 'Updated Name',
      // Add other updates as needed
    });
  };

  const handleRefresh = async () => {
    await refreshUserProfile();
  };

  const handleSignOut = async () => {
    await clearUserData();
    // Also call your Firebase auth sign out
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>User Management</Text>
      
      {userProfile && (
        <View style={styles.userInfo}>
          <Text>Name: {userProfile.name}</Text>
          <Text>Email: {userProfile.email}</Text>
          <Text>Groups: {userProfile.groupsJoined.length}</Text>
          <Text>Data source: {isFromCache ? '📱 Cache' : '☁️ Firestore'}</Text>
        </View>
      )}

      <View style={styles.buttons}>
        <TouchableOpacity style={styles.button} onPress={handleUpdateProfile}>
          <Text style={styles.buttonText}>Update Profile</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.button} onPress={handleRefresh}>
          <Text style={styles.buttonText}>Refresh from Firestore</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.button, styles.signOutButton]} onPress={handleSignOut}>
          <Text style={styles.buttonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Example 5: How to wrap your app with the UserProvider
export function AppWithUserContext() {
  return (
    // Wrap your entire app with UserProvider
    // <UserProvider>
    //   <AuthenticatedContent>
    //     <UserProfileHeader />
    //     <UserGroupsList />
    //     <UserManagementExample />
    //     {/* Your other app components */}
    //   </AuthenticatedContent>
    // </UserProvider>
    <View />
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  profileHeader: {
    padding: 15,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 15,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  cacheInfo: {
    fontSize: 12,
    color: '#888',
    marginTop: 5,
    fontStyle: 'italic',
  },
  userInfo: {
    backgroundColor: '#f0f0f0',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  groupsList: {
    marginTop: 20,
  },
  groupsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  groupItem: {
    backgroundColor: '#e8f4fd',
    padding: 10,
    borderRadius: 5,
    marginBottom: 5,
  },
  buttons: {
    gap: 10,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  signOutButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});
