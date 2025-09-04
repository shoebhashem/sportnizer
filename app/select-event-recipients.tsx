import { FontAwesome } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Button from '../components/Button';
import { theme } from '../constants/theme';
import { db } from '../firebaseConfig';

interface Member {
  uid: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
}

interface GroupData {
  id: string;
  name: string;
  members: Member[];
}

export default function SelectEventRecipientsScreen() {
  const router = useRouter();
  const { eventData, selectedGroups } = useLocalSearchParams();
  const [groupsData, setGroupsData] = useState<GroupData[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectAll, setSelectAll] = useState(false);

  const parsedEventData = eventData ? JSON.parse(eventData as string) : null;
  const parsedSelectedGroups = selectedGroups ? JSON.parse(selectedGroups as string) : [];

  useEffect(() => {
    fetchGroupMembers();
  }, [parsedSelectedGroups]);

  const fetchGroupMembers = async () => {
    try {
      setLoading(true);
      const groupsWithMembers: GroupData[] = [];

      for (const groupId of parsedSelectedGroups) {
        const groupDoc = await getDoc(doc(db, 'groups', groupId));
        
        if (groupDoc.exists()) {
          const groupData = groupDoc.data();
          groupsWithMembers.push({
            id: groupId,
            name: groupData.name,
            members: groupData.members || []
          });
        }
      }

      setGroupsData(groupsWithMembers);
    } catch (error) {
      console.error('Error fetching group members:', error);
      Alert.alert('Error', 'Failed to load group members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroupMembers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Get all unique members across selected groups
  const allMembers = groupsData.reduce((acc: Member[], group) => {
    group.members.forEach(member => {
      if (!acc.find(m => m.uid === member.uid)) {
        acc.push(member);
      }
    });
    return acc;
  }, []);

  // Filter members based on search
  const filteredMembers = allMembers.filter(member =>
    member.name.toLowerCase().includes(searchText.toLowerCase()) ||
    member.email.toLowerCase().includes(searchText.toLowerCase())
  );

  const toggleMemberSelection = (memberUid: string) => {
    setSelectedMembers(prev => 
      prev.includes(memberUid)
        ? prev.filter(uid => uid !== memberUid)
        : [...prev, memberUid]
    );
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedMembers([]);
    } else {
      setSelectedMembers(filteredMembers.map(m => m.uid));
    }
    setSelectAll(!selectAll);
  };

  useEffect(() => {
    setSelectAll(selectedMembers.length === filteredMembers.length && filteredMembers.length > 0);
  }, [selectedMembers, filteredMembers]);

  const handleNext = () => {
    if (selectedMembers.length === 0) {
      Alert.alert('Error', 'Please select at least one recipient');
      return;
    }

    // Navigate to schedule confirmation
    router.push({
      pathname: '/schedule-event' as any,
      params: {
        eventData: JSON.stringify(parsedEventData),
        selectedGroups: JSON.stringify(parsedSelectedGroups),
        selectedMembers: JSON.stringify(selectedMembers)
      }
    });
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return 'crown';
      case 'coach': return 'whistle';
      case 'player': return 'user';
      default: return 'user';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return theme.colors.secondary;
      case 'coach': return '#4CAF50';
      case 'player': return theme.colors.textSecondary;
      default: return theme.colors.textSecondary;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: theme.colors.text, fontSize: 16 }}>Loading members...</Text>
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
            Select Recipients
          </Text>
          <Text style={{ 
            fontSize: 14, 
            color: theme.colors.textSecondary,
            marginTop: 2
          }}>
            Choose who to invite to the event
          </Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={{ padding: 16 }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.inputBackground,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderWidth: 1,
          borderColor: theme.colors.inputBorder
        }}>
          <FontAwesome name="search" size={16} color={theme.colors.textSecondary} />
          <TextInput
            style={{
              flex: 1,
              marginLeft: 8,
              color: theme.colors.text,
              fontSize: 16
            }}
            placeholder="Search members..."
            placeholderTextColor={theme.colors.textSecondary}
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
      </View>

      {/* Select All */}
      {filteredMembers.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <TouchableOpacity
            onPress={handleSelectAll}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 8
            }}
          >
            <View style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: selectAll ? theme.colors.secondary : theme.colors.inputBorder,
              backgroundColor: selectAll ? theme.colors.secondary : 'transparent',
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 12
            }}>
              {selectAll && (
                <FontAwesome name="check" size={12} color={theme.colors.primary} />
              )}
            </View>
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '600' }}>
              Select All ({filteredMembers.length})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {filteredMembers.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <FontAwesome name="users" size={64} color={theme.colors.textSecondary} />
          <Text style={{ 
            color: theme.colors.text, 
            fontSize: 18, 
            fontWeight: '600',
            textAlign: 'center',
            marginTop: 16
          }}>
            No Members Found
          </Text>
          <Text style={{ 
            color: theme.colors.textSecondary, 
            fontSize: 14,
            textAlign: 'center',
            marginTop: 8
          }}>
            {searchText ? 'Try adjusting your search.' : 'No members available in selected groups.'}
          </Text>
        </View>
      ) : (
        <>
          <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
            {filteredMembers.map((member) => (
              <TouchableOpacity
                key={member.uid}
                onPress={() => toggleMemberSelection(member.uid)}
                style={{
                  backgroundColor: theme.colors.inputBackground,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 8,
                  borderWidth: 2,
                  borderColor: selectedMembers.includes(member.uid) 
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
                    {member.avatar ? (
                      <Text style={{ fontSize: 20 }}>{member.avatar}</Text>
                    ) : (
                      <FontAwesome name="user" size={20} color={theme.colors.textSecondary} />
                    )}
                  </View>
                  
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{
                        color: theme.colors.text,
                        fontSize: 16,
                        fontWeight: '600'
                      }}>
                        {member.name}
                      </Text>
                      <FontAwesome 
                        name={getRoleIcon(member.role) as any} 
                        size={12} 
                        color={getRoleColor(member.role)}
                        style={{ marginLeft: 8 }}
                      />
                    </View>
                    <Text style={{
                      color: theme.colors.textSecondary,
                      fontSize: 14,
                      marginTop: 2
                    }}>
                      {member.email} • {member.role}
                    </Text>
                  </View>

                  <View style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: selectedMembers.includes(member.uid) 
                      ? theme.colors.secondary 
                      : theme.colors.inputBorder,
                    backgroundColor: selectedMembers.includes(member.uid) 
                      ? theme.colors.secondary 
                      : 'transparent',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}>
                    {selectedMembers.includes(member.uid) && (
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
                {selectedMembers.length} recipient{selectedMembers.length !== 1 ? 's' : ''} selected
              </Text>
            </View>
            <Button
              label="Next: Schedule Event"
              onPress={handleNext}
              disabled={selectedMembers.length === 0}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
