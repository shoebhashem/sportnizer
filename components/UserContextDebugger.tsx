import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useUser } from '../contexts/UserContext';

/**
 * Debug component to monitor UserContext behavior
 * Add this temporarily to any screen to see what's happening
 */
export function UserContextDebugger() {
  const { 
    userProfile, 
    isLoading, 
    isFromCache, 
    lastCacheUpdate, 
    firebaseUser,
    refreshUserProfile,
    clearUserData
  } = useUser();

  const renderCountRef = React.useRef(0);
  renderCountRef.current += 1;

  React.useEffect(() => {
    console.log(`🐛 UserContextDebugger render #${renderCountRef.current}`);
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🐛 UserContext Debug Panel</Text>
      
      <View style={styles.infoSection}>
        <Text style={styles.label}>Render Count:</Text>
        <Text style={styles.value}>{renderCountRef.current}</Text>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.label}>Loading State:</Text>
        <Text style={styles.value}>{isLoading ? '⏳ Loading' : '✅ Ready'}</Text>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.label}>Firebase User:</Text>
        <Text style={styles.value}>{firebaseUser ? `✅ ${firebaseUser.email}` : '❌ None'}</Text>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.label}>User Profile:</Text>
        <Text style={styles.value}>{userProfile ? `✅ ${userProfile.name}` : '❌ None'}</Text>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.label}>Data Source:</Text>
        <Text style={styles.value}>{isFromCache ? '📱 Cache' : '☁️ Firestore'}</Text>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.label}>Last Cache Update:</Text>
        <Text style={styles.value}>
          {lastCacheUpdate ? lastCacheUpdate.toLocaleTimeString() : 'Never'}
        </Text>
      </View>

      <View style={styles.buttonSection}>
        <TouchableOpacity style={styles.button} onPress={refreshUserProfile}>
          <Text style={styles.buttonText}>🔄 Refresh Profile</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.dangerButton]} 
          onPress={clearUserData}
        >
          <Text style={styles.buttonText}>🗑️ Clear Cache</Text>
        </TouchableOpacity>
      </View>

      {userProfile && (
        <View style={styles.profileDetails}>
          <Text style={styles.sectionTitle}>Profile Details:</Text>
          <Text style={styles.detail}>ID: {userProfile.id}</Text>
          <Text style={styles.detail}>Email: {userProfile.email}</Text>
          <Text style={styles.detail}>Groups: {userProfile.groupsJoined.length}</Text>
          <Text style={styles.detail}>Verified: {userProfile.emailVerified ? '✅' : '❌'}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f0f0f0',
    padding: 15,
    margin: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
    color: '#007AFF',
  },
  infoSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  label: {
    fontWeight: 'bold',
    color: '#333',
  },
  value: {
    color: '#666',
    flex: 1,
    textAlign: 'right',
  },
  buttonSection: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 15,
  },
  button: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  dangerButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  profileDetails: {
    marginTop: 15,
    padding: 10,
    backgroundColor: '#e8f4fd',
    borderRadius: 5,
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#007AFF',
  },
  detail: {
    fontSize: 12,
    color: '#333',
    marginBottom: 2,
  },
});
