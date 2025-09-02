import Button from '@/components/Button';
import Input from '@/components/Input';
import { theme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, getFirestore, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Member {
  id: string;
  name: string;
  birthDate: string;
  role: string;
  joinedAt: any;
}

interface Guardian {
  guardianUserId: string;
  relationship: string;
  contactEmail: string;
  contactPhone: string;
  addedAt: any;
}

export default function MemberProfileScreen() {
  const { groupId, memberId } = useLocalSearchParams();
  const { user } = useAuth();
  const [member, setMember] = useState<Member | null>(null);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Editable fields
  const [editedName, setEditedName] = useState('');
  const [editedBirthDate, setEditedBirthDate] = useState('');

  const fetchMemberData = useCallback(async () => {
    if (!groupId || !memberId) return;
    
    try {
      const db = getFirestore();
      
      // Fetch member data
      const memberDoc = await getDoc(doc(db, 'groups', groupId as string, 'members', memberId as string));
      if (memberDoc.exists()) {
        const memberData = {
          id: memberDoc.id,
          ...memberDoc.data()
        } as Member;
        
        setMember(memberData);
        setEditedName(memberData.name);
        setEditedBirthDate(memberData.birthDate);
        
        // Fetch guardians for this member
        // Note: In a real implementation, you would fetch from members/{memberId}/guardians subcollection
        // For now, we'll show placeholder data
        setGuardians([]);
      }
    } catch (error) {
      console.error('Error fetching member data:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId, memberId]);

  useEffect(() => {
    fetchMemberData();
  }, [fetchMemberData]);

  const handleSave = async () => {
    if (!groupId || !memberId || !member) return;
    
    setSaving(true);
    try {
      const db = getFirestore();
      
      await updateDoc(doc(db, 'groups', groupId as string, 'members', memberId as string), {
        name: editedName.trim(),
        birthDate: editedBirthDate.trim(),
      });
      
      // Update local state
      setMember({
        ...member,
        name: editedName.trim(),
        birthDate: editedBirthDate.trim(),
      });
      
      setEditing(false);
    } catch (error) {
      console.error('Error saving member data:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedName(member?.name || '');
    setEditedBirthDate(member?.birthDate || '');
    setEditing(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading member profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!member) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Member not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons 
              name="arrow-back" 
              size={24} 
              color={theme.colors.secondary} 
            />
          </TouchableOpacity>
          <Text style={styles.title}>Member Profile</Text>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => editing ? handleCancel() : setEditing(true)}
          >
            <Ionicons 
              name={editing ? "close" : "create-outline"} 
              size={24} 
              color={theme.colors.secondary} 
            />
          </TouchableOpacity>
        </View>

        {/* Member Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Member Information</Text>
          
          <View style={styles.infoCard}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Name</Text>
              {editing ? (
                <Input
                  label=""
                  value={editedName}
                  onChangeText={setEditedName}
                  placeholder="Member name"
                />
              ) : (
                <Text style={styles.infoValue}>{member.name}</Text>
              )}
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Birth Date</Text>
              {editing ? (
                <Input
                  label=""
                  value={editedBirthDate}
                  onChangeText={setEditedBirthDate}
                  placeholder="YYYY-MM-DD"
                />
              ) : (
                <Text style={styles.infoValue}>{member.birthDate}</Text>
              )}
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Role</Text>
              <Text style={styles.infoValue}>{member.role}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Joined</Text>
              <Text style={styles.infoValue}>
                {member.joinedAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
              </Text>
            </View>
          </View>
        </View>

        {/* Guardian Contacts - Only for children */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Guardian Contacts</Text>
          
          {guardians.length > 0 ? (
            guardians.map((guardian, index) => (
              <View key={index} style={styles.guardianCard}>
                <View style={styles.guardianHeader}>
                  <Ionicons name="shield-outline" size={20} color={theme.colors.secondary} />
                  <Text style={styles.guardianRelationship}>
                    {guardian.relationship.charAt(0).toUpperCase() + guardian.relationship.slice(1)}
                  </Text>
                </View>
                
                <View style={styles.guardianContact}>
                  <TouchableOpacity style={styles.contactItem}>
                    <Ionicons name="mail-outline" size={16} color={theme.colors.textSecondary} />
                    <Text style={styles.contactText}>{guardian.contactEmail}</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.contactItem}>
                    <Ionicons name="call-outline" size={16} color={theme.colors.textSecondary} />
                    <Text style={styles.contactText}>{guardian.contactPhone}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.noGuardiansCard}>
              <Ionicons name="people-outline" size={48} color={theme.colors.textSecondary} />
              <Text style={styles.noGuardiansText}>No guardian contacts available</Text>
              <Text style={styles.noGuardiansSubtext}>
                Guardian information will appear here once they confirm participation
              </Text>
            </View>
          )}
        </View>

        {/* Save Changes Button - Only shown when editing */}
        {editing && (
          <View style={styles.saveButtonContainer}>
            <Button
              label={saving ? "Saving..." : "Save Changes"}
              onPress={handleSave}
              theme="primary"
              disabled={saving || !editedName.trim()}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.layout.containerPadding,
    paddingBottom: theme.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.sm,
  },
  backButton: {
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.small,
  },
  title: {
    fontSize: theme.typography.fontSize.xlarge,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.bold,
    flex: 1,
    textAlign: 'center',
  },
  editButton: {
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.small,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.error,
  },
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  infoCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.large,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  infoItem: {
    marginBottom: theme.spacing.md,
  },
  infoLabel: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    fontWeight: theme.typography.fontWeight.medium,
  },
  infoValue: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  guardianCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.large,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  guardianHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  guardianRelationship: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
  },
  guardianContact: {
    gap: theme.spacing.sm,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  contactText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  noGuardiansCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.large,
    padding: theme.spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  noGuardiansText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
  noGuardiansSubtext: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  saveButtonContainer: {
    marginTop: theme.spacing.lg,
  },
});
