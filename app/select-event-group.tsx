import { FontAwesome } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Platform,
    ScrollView,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Button from '../components/Button';
import { theme } from '../constants/theme';
import { auth, db } from '../firebaseConfig';

interface Group {
  id: string;
  name: string;
  sport: string;
  memberCount: number;
  userRole: string;
}

export default function SelectEventGroupScreen() {
  const router = useRouter();
  const { eventData } = useLocalSearchParams();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const parsedEventData = eventData ? JSON.parse(eventData as string) : null;

  useEffect(() => {
    fetchUserGroups();
  }, []);

  const fetchUserGroups = async () => {
    if (!auth.currentUser) return;

    try {
      setLoading(true);
      
      // Get groups where user is admin or coach
      const groupsQuery = query(
        collection(db, 'groups'),
        where('members', 'array-contains', {
          uid: auth.currentUser.uid,
          role: 'admin'
        })
      );

      const coachQuery = query(
        collection(db, 'groups'),
        where('members', 'array-contains', {
          uid: auth.currentUser.uid,
          role: 'coach'
        })
      );

      const [adminSnapshot, coachSnapshot] = await Promise.all([
        getDocs(groupsQuery),
        getDocs(coachQuery)
      ]);

      const userGroups: Group[] = [];
      
      // Process admin groups
      adminSnapshot.forEach(doc => {
        const data = doc.data();
        userGroups.push({
          id: doc.id,
          name: data.name,
          sport: data.sport,
          memberCount: data.members?.length || 0,
          userRole: 'admin'
        });
      });

      // Process coach groups
      coachSnapshot.forEach(doc => {
        const data = doc.data();
        // Check if not already added as admin
        if (!userGroups.find(g => g.id === doc.id)) {
          userGroups.push({
            id: doc.id,
            name: data.name,
            sport: data.sport,
            memberCount: data.members?.length || 0,
            userRole: 'coach'
          });
        }
      });

      setGroups(userGroups);
    } catch (error) {
      console.error('Error fetching groups:', error);
      Alert.alert('Error', 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleNext = () => {
    if (selectedGroups.length === 0) {
      Alert.alert('Error', 'Please select at least one group');
      return;
    }

    // Navigate to recipient selection
    router.push({
      pathname: '/select-event-recipients' as any,
      params: {
        eventData: JSON.stringify(parsedEventData),
        selectedGroups: JSON.stringify(selectedGroups)
      }
    });
  };

  const getSportIcon = (sport: string) => {
    const sportIcons: { [key: string]: string } = {
      'Football': 'futbol-o',
      'Basketball': 'basketball-ball',
      'Soccer': 'futbol-o',
      'Baseball': 'baseball-ball',
      'Tennis': 'tennis-ball',
      'Swimming': 'swimmer',
      'Track': 'running',
      'Other': 'users'
    };
    return sportIcons[sport] || 'users';
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: theme.colors.text, fontSize: 16 }}>Loading groups...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
      {/* Header */}
      <View style={{ 
        flexDirection: 'row', 
        alignItems: 'center', 
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.inputBorder 
      }}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={{ marginRight: 16 }}
        >
          <FontAwesome name="arrow-left" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ 
            fontSize: 20, 
            fontWeight: 'bold', 
            color: theme.colors.text 
          }}>
            Select Groups
          </Text>
          <Text style={{ 
            fontSize: 14, 
            color: theme.colors.textSecondary,
            marginTop: 2
          }}>
            Choose which groups to invite to &ldquo;{parsedEventData?.title}&rdquo;
          </Text>
        </View>
      </View>

      {groups.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <FontAwesome name="users" size={64} color={theme.colors.textSecondary} />
          <Text style={{ 
            color: theme.colors.text, 
            fontSize: 18, 
            fontWeight: '600',
            textAlign: 'center',
            marginTop: 16
          }}>
            No Groups Available
          </Text>
          <Text style={{ 
            color: theme.colors.textSecondary, 
            fontSize: 14,
            textAlign: 'center',
            marginTop: 8
          }}>
            You need admin or coach permissions in a group to create events.
          </Text>
        </View>
      ) : (
        <>
          <ScrollView style={{ flex: 1, padding: 16 }}>
            {groups.map((group) => (
              <TouchableOpacity
                key={group.id}
                onPress={() => toggleGroupSelection(group.id)}
                style={{
                  backgroundColor: theme.colors.inputBackground,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 12,
                  borderWidth: 2,
                  borderColor: selectedGroups.includes(group.id) 
                    ? theme.colors.secondary 
                    : 'transparent'
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: theme.colors.primary,
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 12
                  }}>
                    <FontAwesome 
                      name={getSportIcon(group.sport) as any} 
                      size={20} 
                      color={theme.colors.secondary} 
                    />
                  </View>
                  
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      color: theme.colors.text,
                      fontSize: 16,
                      fontWeight: '600'
                    }}>
                      {group.name}
                    </Text>
                    <Text style={{
                      color: theme.colors.textSecondary,
                      fontSize: 14,
                      marginTop: 2
                    }}>
                      {group.sport} • {group.memberCount} members • {group.userRole}
                    </Text>
                  </View>

                  <View style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: selectedGroups.includes(group.id) 
                      ? theme.colors.secondary 
                      : theme.colors.inputBorder,
                    backgroundColor: selectedGroups.includes(group.id) 
                      ? theme.colors.secondary 
                      : 'transparent',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}>
                    {selectedGroups.includes(group.id) && (
                      <FontAwesome name="check" size={12} color={theme.colors.primary} />
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Bottom Action */}
          <View style={{ 
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: theme.colors.inputBorder,
            paddingBottom: Platform.OS === 'ios' ? 34 : 16
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 14 }}>
                {selectedGroups.length} group{selectedGroups.length !== 1 ? 's' : ''} selected
              </Text>
            </View>
            <Button
              label="Next: Select Recipients"
              onPress={handleNext}
              disabled={selectedGroups.length === 0}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
