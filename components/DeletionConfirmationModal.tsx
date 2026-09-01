import Button from '@/components/Button';
import { theme } from '@/constants/theme';
import Ionicons from "@react-native-vector-icons/ionicons/static";
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

interface DeletionConfirmationModalProps {
  visible: boolean;
  title: string;
  entityName: string;
  entityType: 'group' | 'club';
  message?: string;
  gracePeriodDays?: number;
  affectedCount?: number; // subgroups or groups affected
  affectedLabel?: string; // "subgroups" or "groups"
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting?: boolean;
}

export default function DeletionConfirmationModal({
  visible,
  title,
  entityName,
  entityType,
  message,
  gracePeriodDays = 30,
  affectedCount,
  affectedLabel,
  onConfirm,
  onCancel,
  isDeleting = false,
}: DeletionConfirmationModalProps) {
  const { t } = useTranslation(["components", "common"]);

  const defaultMessage = message || 
    `This will schedule "${entityName}" for deletion in ${gracePeriodDays} days. ` +
    `You can undo this action during the grace period.` +
    (affectedCount ? ` This will also affect ${affectedCount} ${affectedLabel}.` : '');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.overlay} onPress={isDeleting ? undefined : onCancel}>
        <View style={styles.modalContainer}>
          <Pressable onPress={() => {}} style={styles.modal}>
            {/* Warning Icon */}
            <View style={styles.iconContainer}>
              <Ionicons 
                name="warning-outline" 
                size={48} 
                color={theme.colors.error} 
              />
            </View>

            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{defaultMessage}</Text>
            
            {/* Grace Period Info Box */}
            <View style={styles.infoBox}>
              <Ionicons 
                name="time-outline" 
                size={20} 
                color={theme.colors.secondary} 
              />
              <Text style={styles.infoText}>
                {t("components:deletionConfirmationModal.gracePeriodNote", { gracePeriodDays })}
              </Text>
            </View>

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              <View style={styles.button}>
                <Button
                  label="Cancel"
                  onPress={onCancel}
                  theme="secondary"
                  disabled={isDeleting}
                />
              </View>
              <View style={styles.button}>
                <Button
                  label={isDeleting ? t("components:deletionConfirmationModal.deleting") : "Delete"}
                  onPress={onConfirm}
                  theme="primary"
                  disabled={isDeleting}
                />
              </View>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
    padding: theme.spacing.md,
  },
  modal: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.large,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  message: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: theme.spacing.lg,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
    marginBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  infoText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  button: {
    flex: 1,
  },
});
