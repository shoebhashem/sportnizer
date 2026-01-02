// /app/select-recipients.tsx - Permission-based recipient selection screen
// Implements documented architecture patterns from ARCHITECTURE.md

import { FontAwesome } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Button from '../components/Button';
import ConfirmationModal from '../components/ConfirmationModal';
import { theme } from '../constants/theme';
import { useUserProfile } from '../contexts/UserContext';
import {
    EnhancedRecipientSelection,
    recipientSelectionService,
    SelectableEntity
} from '../services/recipientSelection';

interface SelectRecipientsParams {
  feature: string;
  clubId?: string;
  returnTo?: string;
}

interface ModalState {
  visible: boolean;
  title: string;
  message: string;
}

interface SelectionState {
  entireClub: boolean;
  selectedGroups: Set<string>;
  selectedSubgroups: Map<string, Set<string>>;
  expandedGroups: Set<string>;
}

export default function SelectRecipientsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams() as unknown as SelectRecipientsParams;
  const { userProfile, isLoading: userLoading } = useUserProfile();

  // State management
  const [entities, setEntities] = useState<{
    clubs: SelectableEntity[];
    groups: SelectableEntity[];
    subgroups: Map<string, SelectableEntity[]>;
  } | null>(null);
  
  const [selection, setSelection] = useState<SelectionState>({
    entireClub: false,
    selectedGroups: new Set(),
    selectedSubgroups: new Map(),
    expandedGroups: new Set()
  });
  
  const [recipientCount, setRecipientCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [modal, setModal] = useState<ModalState>({
    visible: false,
    title: '',
    message: ''
  });

  // Permission-based logic
  const isClubAdmin = userProfile?.clubAccess?.some(club => 
    club.role === 'club-admin' && (!params.clubId || club.clubId === params.clubId)
  );
  
  const hasGroupAccess = userProfile?.clubAccess?.some(club =>
    club.groupAccess?.some(group => 
      group.roles?.includes('coach') || group.roles?.includes('admin')
    )
  );

  // Load selectable entities on mount
  const loadSelectableEntities = useCallback(async () => {
    if (!userProfile) return;

    setIsLoading(true);
    try {
      const result = await recipientSelectionService.getSelectableEntities(userProfile);
      
      if (result.success && result.entities) {
        setEntities(result.entities);
        
        // Auto-select entire club for club admins (if only one club available)
        if (isClubAdmin && result.entities.clubs.length === 1) {
          setSelection(prev => ({ ...prev, entireClub: true }));
        }
      } else {
        throw new Error(result.error || 'Failed to load selectable entities');
      }
    } catch (error) {
      console.error('Error loading selectable entities:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: 'Failed to load available recipients. Please try again.'
      });
    } finally {
      setIsLoading(false);
    }
  }, [userProfile, isClubAdmin]);

  // Build enhanced selection object for service layer
  const buildEnhancedSelection = useCallback((): EnhancedRecipientSelection | null => {
    if (!entities) return null;

    if (selection.entireClub && entities.clubs.length > 0) {
      const club = entities.clubs[0];
      return {
        type: 'entire-club' as const,
        clubId: club.id,
        clubName: club.name,
        totalEstimatedCount: recipientCount
      };
    }

    if (selection.selectedGroups.size > 0 || selection.selectedSubgroups.size > 0) {
      const groups: EnhancedRecipientSelection['groups'] = [];
      
      // Add selected groups
      selection.selectedGroups.forEach(groupId => {
        const group = entities.groups.find(g => g.id === groupId);
        if (group) {
          groups.push({
            groupId: group.id,
            groupName: group.name,
            scope: 'entire' as const
          });
        }
      });

      // Add selected subgroups
      selection.selectedSubgroups.forEach((subgroupIds, groupId) => {
        const group = entities.groups.find(g => g.id === groupId);
        if (group && subgroupIds.size > 0) {
          const subgroupEntities = entities.subgroups.get(groupId) || [];
          const selectedSubgroupNames = Array.from(subgroupIds)
            .map(id => subgroupEntities.find(s => s.id === id)?.name)
            .filter(Boolean) as string[];

          groups.push({
            groupId: group.id,
            groupName: group.name,
            scope: 'subgroups' as const,
            subgroupIds: Array.from(subgroupIds),
            subgroupNames: selectedSubgroupNames
          });
        }
      });

      const selectionType: EnhancedRecipientSelection['type'] = groups.length === 1 ? 'selected-groups' : 'mixed';
      return {
        type: selectionType,
        groups,
        totalEstimatedCount: recipientCount
      };
    }

    return null;
  }, [entities, selection, recipientCount]);

  // Calculate recipient count when selection changes
  const calculateRecipientCount = useCallback(async () => {
    if (!entities) return;

    const enhancedSelection = buildEnhancedSelection();
    if (!enhancedSelection) {
      setRecipientCount(0);
      return;
    }

    try {
      const result = await recipientSelectionService.calculateRecipientCount(enhancedSelection);
      if (result.success && typeof result.count === 'number') {
        setRecipientCount(result.count);
      } else {
        setRecipientCount(0);
      }
    } catch (error) {
      console.error('Error calculating recipient count:', error);
      setRecipientCount(0);
    }
  }, [entities, buildEnhancedSelection]);

  // Event handlers
  const handleClubToggle = () => {
    setSelection(prev => ({
      ...prev,
      entireClub: !prev.entireClub,
      selectedGroups: new Set(), // Clear group selections
      selectedSubgroups: new Map() // Clear subgroup selections
    }));
  };

  const handleGroupToggle = (groupId: string) => {
    setSelection(prev => {
      const newSelectedGroups = new Set(prev.selectedGroups);
      const newSelectedSubgroups = new Map(prev.selectedSubgroups);
      
      if (newSelectedGroups.has(groupId)) {
        newSelectedGroups.delete(groupId);
      } else {
        newSelectedGroups.add(groupId);
        newSelectedSubgroups.delete(groupId); // Clear subgroup selection if selecting entire group
      }
      
      return {
        ...prev,
        entireClub: false, // Clear club selection
        selectedGroups: newSelectedGroups,
        selectedSubgroups: newSelectedSubgroups
      };
    });
  };

  const handleSubgroupToggle = (groupId: string, subgroupId: string) => {
    setSelection(prev => {
      const newSelectedGroups = new Set(prev.selectedGroups);
      const newSelectedSubgroups = new Map(prev.selectedSubgroups);
      
      // Remove entire group selection if selecting specific subgroups
      newSelectedGroups.delete(groupId);
      
      const currentSubgroups = newSelectedSubgroups.get(groupId) || new Set();
      const newSubgroups = new Set(currentSubgroups);
      
      if (newSubgroups.has(subgroupId)) {
        newSubgroups.delete(subgroupId);
      } else {
        newSubgroups.add(subgroupId);
      }
      
      if (newSubgroups.size > 0) {
        newSelectedSubgroups.set(groupId, newSubgroups);
      } else {
        newSelectedSubgroups.delete(groupId);
      }
      
      return {
        ...prev,
        entireClub: false, // Clear club selection
        selectedGroups: newSelectedGroups,
        selectedSubgroups: newSelectedSubgroups
      };
    });
  };

  const handleGroupExpansion = (groupId: string) => {
    setSelection(prev => {
      const newExpandedGroups = new Set(prev.expandedGroups);
      
      if (newExpandedGroups.has(groupId)) {
        newExpandedGroups.delete(groupId);
      } else {
        newExpandedGroups.add(groupId);
      }
      
      return {
        ...prev,
        expandedGroups: newExpandedGroups
      };
    });
  };

  const handleConfirm = async () => {
    const enhancedSelection = buildEnhancedSelection();
    
    if (!enhancedSelection) {
      Alert.alert('No Selection', 'Please select at least one recipient group.');
      return;
    }

    if (recipientCount === 0) {
      Alert.alert('No Recipients', 'The selected groups have no members.');
      return;
    }

    // Validate selection with server
    setIsLoading(true);
    try {
      const validationResult = await recipientSelectionService.validateSelection(
        userProfile?.uid || '', 
        enhancedSelection
      );
      
      if (!validationResult.success || !validationResult.isValid) {
        Alert.alert('Invalid Selection', validationResult.error || 'Selection validation failed');
        return;
      }

      // Navigate back with selection
      const selectionParam = encodeURIComponent(JSON.stringify(enhancedSelection));
      
      if (params.returnTo) {
        router.push({
          pathname: params.returnTo as any,
          params: { 
            recipientSelection: selectionParam,
            recipientCount: recipientCount.toString()
          }
        });
      } else {
        router.back();
      }
    } catch (error) {
      console.error('Error validating selection:', error);
      Alert.alert('Error', 'Failed to validate selection. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Effects
  useEffect(() => {
    loadSelectableEntities();
  }, [loadSelectableEntities]);

  useEffect(() => {
    calculateRecipientCount();
  }, [calculateRecipientCount]);

  // Render functions
  const renderClubSelection = () => {
    if (!isClubAdmin || !entities?.clubs.length) return null;

    const club = entities.clubs[0];
    
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Club Selection</Text>
        <Text style={styles.sectionSubtitle}>
          As a club administrator, you can select the entire club
        </Text>
        
        <TouchableOpacity
          style={[
            styles.selectionItem,
            selection.entireClub && styles.selectedItem
          ]}
          onPress={handleClubToggle}
        >
          <View style={styles.selectionContent}>
            <FontAwesome
              name={selection.entireClub ? 'check-square-o' : 'square-o'}
              size={20}
              color={selection.entireClub ? theme.colors.primary : theme.colors.textSecondary}
            />
            <View style={styles.selectionText}>
              <Text style={styles.itemName}>Entire Club: {club.name}</Text>
              <Text style={styles.itemDetail}>All members across all groups</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderGroupSelection = () => {
    if (!entities?.groups.length) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Group Selection</Text>
        <Text style={styles.sectionSubtitle}>
          Select specific groups {isClubAdmin ? 'or subgroups' : 'where you have coach/admin permissions'}
        </Text>
        
        {entities.groups.map(group => renderGroup(group))}
      </View>
    );
  };

  const renderGroup = (group: SelectableEntity) => {
    const isSelected = selection.selectedGroups.has(group.id);
    const isExpanded = selection.expandedGroups.has(group.id);
    const subgroupEntities = entities?.subgroups.get(group.id) || [];
    const selectedSubgroups = selection.selectedSubgroups.get(group.id);
    const hasSelectedSubgroups = selectedSubgroups && selectedSubgroups.size > 0;

    return (
      <View key={group.id} style={styles.groupContainer}>
        <TouchableOpacity
          style={[
            styles.selectionItem,
            (isSelected || hasSelectedSubgroups) && styles.selectedItem
          ]}
          onPress={() => handleGroupToggle(group.id)}
        >
          <View style={styles.selectionContent}>
            <FontAwesome
              name={isSelected ? 'check-square-o' : hasSelectedSubgroups ? 'minus-square-o' : 'square-o'}
              size={20}
              color={isSelected || hasSelectedSubgroups ? theme.colors.primary : theme.colors.textSecondary}
            />
            <View style={styles.selectionText}>
              <Text style={styles.itemName}>{group.name}</Text>
              <Text style={styles.itemDetail}>
                {group.parentName} • {group.userRoles.join(', ')}
              </Text>
            </View>
            {subgroupEntities.length > 0 && (
              <TouchableOpacity
                onPress={() => handleGroupExpansion(group.id)}
                style={styles.expandButton}
              >
                <FontAwesome
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>

        {isExpanded && subgroupEntities.length > 0 && (
          <View style={styles.subgroupsContainer}>
            {subgroupEntities.map(subgroup => (
              <TouchableOpacity
                key={subgroup.id}
                style={[
                  styles.subgroupItem,
                  selectedSubgroups?.has(subgroup.id) && styles.selectedItem
                ]}
                onPress={() => handleSubgroupToggle(group.id, subgroup.id)}
              >
                <View style={styles.selectionContent}>
                  <FontAwesome
                    name={selectedSubgroups?.has(subgroup.id) ? 'check-square-o' : 'square-o'}
                    size={18}
                    color={selectedSubgroups?.has(subgroup.id) ? theme.colors.primary : theme.colors.textSecondary}
                  />
                  <View style={styles.selectionText}>
                    <Text style={styles.subgroupName}>{subgroup.name}</Text>
                    <Text style={styles.subgroupDetail}>
                      {subgroup.memberCount} members
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderRecipientSummary = () => (
    <View style={styles.summaryContainer}>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Total Recipients:</Text>
        <Text style={styles.summaryCount}>{recipientCount}</Text>
      </View>
    </View>
  );

  // Loading states
  if (userLoading || isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading recipients...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // No permissions state
  if (!isClubAdmin && !hasGroupAccess) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.noPermissionsContainer}>
          <FontAwesome name="exclamation-circle" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.noPermissionsTitle}>No Permissions</Text>
          <Text style={styles.noPermissionsText}>
            You do not have admin or coach permissions in any groups to send {params.feature}.
          </Text>
          <Button
            label="Go Back"
            onPress={() => router.back()}
            theme="secondary"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Select Recipients</Text>
          <Text style={styles.subtitle}>
            Choose who will receive your {params.feature}
          </Text>
        </View>

        {renderClubSelection()}
        {!selection.entireClub && renderGroupSelection()}
        {renderRecipientSummary()}
      </ScrollView>

      <View style={styles.bottomContainer}>
        <Button
          label={`Continue (${recipientCount} recipients)`}
          onPress={handleConfirm}
          disabled={recipientCount === 0}
          loading={isLoading}
          theme="primary"
        />
      </View>

      <ConfirmationModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        onConfirm={() => setModal({ ...modal, visible: false })}
        onCancel={() => setModal({ ...modal, visible: false })}
      />
    </SafeAreaView>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  noPermissionsContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 32,
  },
  noPermissionsTitle: {
    fontSize: 24,
    fontWeight: '600' as const,
    color: theme.colors.text,
    marginTop: 16,
    textAlign: 'center' as const,
  },
  noPermissionsText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 24,
  },
  scrollContainer: {
    flex: 1,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: theme.colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: theme.colors.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 16,
  },
  selectionItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    marginBottom: 8,
  },
  selectedItem: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '20',
  },
  selectionContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  selectionText: {
    flex: 1,
    marginLeft: 12,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: theme.colors.text,
  },
  itemDetail: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  expandButton: {
    padding: 8,
  },
  groupContainer: {
    marginBottom: 8,
  },
  subgroupsContainer: {
    marginLeft: 32,
    marginTop: 8,
  },
  subgroupItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    marginBottom: 4,
    backgroundColor: theme.colors.inputBackground + '40',
  },
  subgroupName: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: theme.colors.text,
  },
  subgroupDetail: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  summaryContainer: {
    padding: 20,
    backgroundColor: theme.colors.inputBackground + '20',
  },
  summaryRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  summaryLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.text,
  },
  summaryCount: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: theme.colors.primary,
  },
  bottomContainer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
    backgroundColor: theme.colors.white,
  },
};
