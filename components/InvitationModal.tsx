import { theme } from '@/constants/theme';
import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Button from './Button';

interface InvitationModalProps {
  visible: boolean;
  groupName: string;
  inviterName: string;
  onAccept: () => void;
  onReject: () => void;
  loading?: boolean;
  youthData?: {
    childName: string;
    dateOfBirth: string;
    relationship: string;
  };
  metadata?: {
    action?: 'role_update' | 'new_member';
    newRole?: string;
    existingRoles?: string[];
  };
}

const InvitationModal: React.FC<InvitationModalProps> = ({
  visible,
  groupName,
  inviterName,
  onAccept,
  onReject,
  loading = false,
  youthData,
  metadata
}) => {
  const isRoleUpdate = metadata?.action === 'role_update';
  const newRole = metadata?.newRole || 'member';
  
  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="fade"
      statusBarTranslucent={true}
      presentationStyle="overFullScreen"
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>
            {isRoleUpdate ? 'Role Update' : (youthData ? 'Child Member Invitation' : 'Group Invitation')}
          </Text>
          
          {youthData ? (
            <>
              <Text style={styles.message}>
                <Text style={styles.bold}>{inviterName}</Text> has invited your child{' '}
                <Text style={styles.bold}>{youthData.childName}</Text> to join the group{' '}
                <Text style={styles.bold}>{groupName}</Text>.
              </Text>
              
              <Text style={styles.question}>
                Would you like to add {youthData.childName} to this group?
              </Text>
            </>
          ) : isRoleUpdate ? (
            <>
              <Text style={styles.message}>
                You are being promoted to <Text style={styles.bold}>{newRole}</Text> role in{' '}
                <Text style={styles.bold}>{groupName}</Text>.
              </Text>
              
              <Text style={styles.question}>
                Would you like to accept this role update?
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.message}>
                <Text style={styles.bold}>{inviterName}</Text> has invited you to join the group{' '}
                <Text style={styles.bold}>{groupName}</Text>.
              </Text>
              
              <Text style={styles.question}>
                Would you like to join this group?
              </Text>
            </>
          )}
          
          <View style={styles.buttonContainer}>
            <View style={styles.buttonWrapper}>
              <Button
                label="Reject"
                onPress={onReject}
                loading={loading}
                disabled={loading}
              />
            </View>
            <View style={styles.buttonWrapper}>
              <Button
                label={isRoleUpdate ? "Accept Role" : "Accept & Join"}
                onPress={onAccept}
                theme="primary"
                loading={loading}
                disabled={loading}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: theme.colors.primary,
    borderRadius: 20,
    padding: 30,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 25,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.secondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  message: {
    fontSize: 16,
    color: theme.colors.text,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 15,
  },
  question: {
    fontSize: 16,
    color: theme.colors.text,
    textAlign: 'center',
    fontWeight: '500',
    marginBottom: 30,
  },
  bold: {
    fontWeight: 'bold',
    color: theme.colors.secondary,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
    marginTop: 10,
  },
  buttonWrapper: {
    flex: 1,
  },
});

export default InvitationModal;
