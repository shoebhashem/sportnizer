import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useUser } from '../contexts/UserContext';

export function DebugUserData() {
  const { userProfile } = useUser();

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Debug User Data</Text>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>User Profile:</Text>
        <Text style={styles.data}>{JSON.stringify(userProfile, null, 2)}</Text>
      </View>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Clubs Joined:</Text>
        <Text style={styles.data}>
          {userProfile?.clubsJoined ? JSON.stringify(userProfile.clubsJoined, null, 2) : 'No clubsJoined field'}
        </Text>
      </View>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Clubs (old field):</Text>
        <Text style={styles.data}>
          {(userProfile as any)?.clubs ? JSON.stringify((userProfile as any).clubs, null, 2) : 'No clubs field'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  section: {
    backgroundColor: 'white',
    padding: 12,
    marginVertical: 8,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  data: {
    fontSize: 12,
    fontFamily: 'monospace',
    backgroundColor: '#f0f0f0',
    padding: 8,
    borderRadius: 4,
  },
});
