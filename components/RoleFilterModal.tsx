/**
 * 🎭 ROLE FILTER MODAL COMPONENT
 * 
 * A reusable modal component for filtering group members by role.
 * Used in event creation to select which roles should receive event invitations.
 * 
 * Features:
 * - Full-screen modal with checkboxes for each role
 * - Multi-select capability (select multiple roles at once)
 * - Group-level roles only: player, player-underage, coach, admin
 * - Visual feedback for selected roles
 * - Apply/Cancel actions
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    Modal,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { theme as defaultTheme } from '../constants/theme';

// Role type definition (matches backend GroupRole)
export type GroupRole = 'player' | 'player-underage' | 'coach' | 'admin';

// Role display information
interface RoleInfo {
  value: GroupRole;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}

// Available roles for filtering
const ROLES: RoleInfo[] = [
  {
    value: 'player',
    label: 'Players',
    description: 'Regular team players',
    icon: 'people',
  },
  {
    value: 'player-underage',
    label: 'Youth Players',
    description: 'Underage players (guardians notified)',
    icon: 'school',
  },
  {
    value: 'coach',
    label: 'Coaches',
    description: 'Team coaches and assistants',
    icon: 'fitness',
  },
  {
    value: 'admin',
    label: 'Admins',
    description: 'Group administrators',
    icon: 'shield',
  },
];

interface RoleFilterModalProps {
  visible: boolean;
  selectedRoles: GroupRole[];
  onApply: (roles: GroupRole[]) => void;
  onClose: () => void;
}

export default function RoleFilterModal({
  visible,
  selectedRoles,
  onApply,
  onClose,
}: RoleFilterModalProps) {
  const theme = defaultTheme.colors;
  const [tempSelectedRoles, setTempSelectedRoles] = React.useState<GroupRole[]>(selectedRoles);

  // Reset temporary selection when modal opens
  React.useEffect(() => {
    if (visible) {
      setTempSelectedRoles(selectedRoles);
    }
  }, [visible, selectedRoles]);

  // Toggle role selection
  const toggleRole = (role: GroupRole) => {
    setTempSelectedRoles((prev) =>
      prev.includes(role)
        ? prev.filter((r) => r !== role)
        : [...prev, role]
    );
  };

  // Apply filter
  const handleApply = () => {
    onApply(tempSelectedRoles);
    onClose();
  };

  // Cancel and close
  const handleCancel = () => {
    setTempSelectedRoles(selectedRoles); // Reset to original selection
    onClose();
  };

  // Clear all selections
  const handleClearAll = () => {
    setTempSelectedRoles([]);
  };

  // Select all roles
  const handleSelectAll = () => {
    setTempSelectedRoles(ROLES.map((r) => r.value));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleCancel}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: theme.primary }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.inputBorder }]}>
          <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Filter by Role</Text>
          <TouchableOpacity onPress={handleApply} style={styles.headerButton}>
            <Text style={[styles.applyText, { color: theme.secondary }]}>Apply</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={[styles.quickActions, { borderBottomColor: theme.inputBorder }]}>
          <TouchableOpacity onPress={handleSelectAll} style={styles.quickActionButton}>
            <Text style={[styles.quickActionText, { color: theme.secondary }]}>Select All</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClearAll} style={styles.quickActionButton}>
            <Text style={[styles.quickActionText, { color: theme.secondary }]}>Clear All</Text>
          </TouchableOpacity>
        </View>

        {/* Role List */}
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Select which roles should receive this event invitation
          </Text>

          {ROLES.map((role) => {
            const isSelected = tempSelectedRoles.includes(role.value);
            return (
              <TouchableOpacity
                key={role.value}
                style={[
                  styles.roleItem,
                  {
                    backgroundColor: theme.inputBackground,
                    borderColor: isSelected ? theme.secondary : theme.inputBorder,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                onPress={() => toggleRole(role.value)}
              >
                <View style={styles.roleItemLeft}>
                  <View
                    style={[
                      styles.iconContainer,
                      { backgroundColor: isSelected ? theme.secondary : theme.inputBorder },
                    ]}
                  >
                    <Ionicons
                      name={role.icon}
                      size={24}
                      color={isSelected ? '#FFFFFF' : theme.textSecondary}
                    />
                  </View>
                  <View style={styles.roleTextContainer}>
                    <Text style={[styles.roleLabel, { color: theme.text }]}>{role.label}</Text>
                    <Text style={[styles.roleDescription, { color: theme.textSecondary }]}>
                      {role.description}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: isSelected ? theme.secondary : theme.inputBorder,
                      backgroundColor: isSelected ? theme.secondary : 'transparent',
                    },
                  ]}
                >
                  {isSelected && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Selection Summary */}
          <View style={[styles.summary, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}>
            <Ionicons name="information-circle-outline" size={20} color={theme.secondary} />
            <Text style={[styles.summaryText, { color: theme.textSecondary }]}>
              {tempSelectedRoles.length === 0
                ? 'No roles selected - entire group will be invited'
                : `${tempSelectedRoles.length} role${tempSelectedRoles.length > 1 ? 's' : ''} selected`}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerButton: {
    padding: 8,
    minWidth: 60,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  applyText: {
    fontSize: 16,
    fontWeight: '600',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  quickActionButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  quickActionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 20,
  },
  roleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  roleItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  roleTextContainer: {
    flex: 1,
  },
  roleLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  roleDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  summaryText: {
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
});
