/**
 * REMOVE GUARDIAN SCREEN
 * ======================
 *
 * Screen for removing guardians from a youth player.
 * Shows the youth's guardiansContacts[] and lets admin remove selected ones.
 *
 * FLOW:
 * 1. Receive youthUid/youthName from navigation params
 * 2. Fetch group members, find the youth, read guardiansContacts[]
 * 3. Display guardians with checkboxes (multi-select)
 * 4. Click Continue → Show confirmation modal
 * 5. Click Confirm → Call removeGuardianFromYouth CF for each selected guardian
 * 6. Show results modal
 */

import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useGroupData } from "@/contexts/GroupDataContext";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { httpsCallable } from "firebase/functions";
import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { functions } from "../services/core/firebase";
import { GuardianContact } from "../services/types/group";

export default function RemoveGuardianScreen() {
  const { groupId, clubId, youthUid, youthName } = useLocalSearchParams();
  // useAuth ensures user is authenticated for CF calls
  useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation(["screens", "common"]);
  const { getGroupMembers } = useGroupData();

  // Set dynamic native header subtitle with youth name
  useLayoutEffect(() => {
    navigation.setOptions({
      title: t("screens:removeGuardian.title", {
        defaultValue: "Remove Guardian",
      }),
    });
  }, [navigation, t]);

  const [guardians, setGuardians] = useState<GuardianContact[]>([]);
  const [selectedGuardians, setSelectedGuardians] = useState<GuardianContact[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  const [removalResults, setRemovalResults] = useState<{
    success: number;
    failed: number;
    errors: string[];
  }>({ success: 0, failed: 0, errors: [] });
  const [showResultModal, setShowResultModal] = useState(false);
  const [showLastGuardianWarning, setShowLastGuardianWarning] = useState(false);

  // Get members from real-time context
  const contextGroupMembers = getGroupMembers(
    clubId as string,
    groupId as string,
  );

  const fetchGuardians = useCallback(async () => {
    if (
      !groupId ||
      typeof groupId !== "string" ||
      !clubId ||
      typeof clubId !== "string" ||
      !youthUid ||
      typeof youthUid !== "string"
    )
      return;

    try {
      setLoading(true);

      // Find the youth member from context and read guardiansContacts
      const youthMember = contextGroupMembers.find(
        (m: any) => m.userId === youthUid,
      );

      if (youthMember && youthMember.guardiansContacts) {
        setGuardians(youthMember.guardiansContacts);
      } else {
        console.warn("Youth member not found or has no guardiansContacts");
        setGuardians([]);
      }
    } catch (error) {
      console.error("Error fetching guardians:", error);
    } finally {
      setLoading(false);
    }
  }, [groupId, clubId, youthUid, contextGroupMembers]);

  useEffect(() => {
    fetchGuardians();
  }, [fetchGuardians]);

  const handleGuardianToggle = (guardian: GuardianContact) => {
    setSelectedGuardians((prev) => {
      const isAlreadySelected = prev.some(
        (g) => g.guardianUid === guardian.guardianUid,
      );
      if (isAlreadySelected) {
        return prev.filter((g) => g.guardianUid !== guardian.guardianUid);
      } else {
        return [...prev, guardian];
      }
    });
  };

  const handleContinue = () => {
    if (selectedGuardians.length === 0) return;

    // Prevent removing all guardians — youth must keep at least one
    if (selectedGuardians.length >= guardians.length) {
      setShowLastGuardianWarning(true);
      return;
    }

    setIsConfirmModalVisible(true);
  };

  const handleConfirmRemoval = async () => {
    if (selectedGuardians.length === 0) {
      setIsConfirmModalVisible(false);
      return;
    }

    setIsConfirmModalVisible(false);
    setRemoving(true);

    const results = { success: 0, failed: 0, errors: [] as string[] };

    const removeGuardianFromYouthFn = httpsCallable(
      functions,
      "removeGuardianFromYouth",
    );

    for (const guardian of selectedGuardians) {
      try {
        const result = await removeGuardianFromYouthFn({
          clubId: clubId as string,
          groupId: groupId as string,
          youthUid: youthUid as string,
          guardianUid: guardian.guardianUid,
        });

        const response = result.data as {
          success: boolean;
          error?: string;
        };

        if (response.success) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push(
            `${guardian.guardianName}: ${response.error || "Unknown error"}`,
          );
        }
      } catch (error: any) {
        console.error(
          `Error removing guardian ${guardian.guardianName}:`,
          error,
        );
        results.failed++;
        results.errors.push(
          `${guardian.guardianName}: ${error.message || "Unexpected error"}`,
        );
      }
    }

    setRemovalResults(results);
    setRemoving(false);
    setShowResultModal(true);

    // Clear selection after showing results
    setSelectedGuardians([]);

    // Refresh guardian list
    await fetchGuardians();
  };

  const renderGuardianItem = ({ item }: { item: GuardianContact }) => {
    const isSelected = selectedGuardians.some(
      (g) => g.guardianUid === item.guardianUid,
    );

    return (
      <TouchableOpacity
        style={[styles.memberItem, isSelected && styles.memberItemSelected]}
        onPress={() => handleGuardianToggle(item)}
        disabled={removing}
      >
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && (
            <Ionicons name="checkmark" size={16} color={theme.colors.primary} />
          )}
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.guardianName}</Text>
          <Text style={styles.memberEmail}>{item.guardianEmail}</Text>
          <View style={styles.memberRoles}>
            <View style={styles.roleTag}>
              <Text style={styles.roleText}>{item.relationship}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>
            {t("common:loading", { defaultValue: "Loading..." })}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Subtitle showing which youth player */}
      <View style={styles.subtitleBar}>
        <Text style={styles.subtitle}>
          {t("screens:removeGuardian.forYouth", {
            youthName: youthName as string,
            defaultValue: `For ${youthName}`,
          })}
        </Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.instructionText}>
          {t("screens:removeGuardian.instruction", {
            defaultValue: "Select guardian(s) to remove from this youth player",
          })}
        </Text>

        {guardians.length > 0 ? (
          <FlatList
            data={guardians}
            renderItem={renderGuardianItem}
            keyExtractor={(item) => item.guardianUid}
            style={styles.membersList}
            contentContainerStyle={[
              styles.membersListContent,
              selectedGuardians.length > 0 &&
                styles.membersListContentWithActions,
            ]}
          />
        ) : (
          <View style={styles.emptyState}>
            <Ionicons
              name="people-outline"
              size={64}
              color={theme.colors.textSecondary}
            />
            <Text style={styles.emptyStateText}>
              {t("screens:removeGuardian.noGuardians", {
                defaultValue: "No guardians found for this youth player",
              })}
            </Text>
          </View>
        )}
      </View>

      {selectedGuardians.length > 0 && (
        <View
          style={[
            styles.actionContainer,
            { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) },
          ]}
        >
          <View style={styles.actionButton}>
            <Button
              label={t("common:cancel")}
              onPress={() => setSelectedGuardians([])}
              theme="secondary"
              disabled={removing}
            />
          </View>
          <View style={styles.actionButton}>
            <Button
              label={
                removing
                  ? t("screens:removeGuardian.removing", {
                      defaultValue: "Removing...",
                    })
                  : t("screens:removeGuardian.removeCount", {
                      count: selectedGuardians.length,
                      defaultValue: `Remove ${selectedGuardians.length} Guardian(s)`,
                    })
              }
              onPress={handleContinue}
              theme="primary"
              disabled={removing}
              loading={removing}
            />
          </View>
        </View>
      )}

      {/* Confirmation Modal */}
      <Modal
        visible={isConfirmModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsConfirmModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="warning" size={48} color="#FF6B6B" />
              <Text style={styles.modalTitle}>
                {t("screens:removeGuardian.confirmTitle", {
                  count: selectedGuardians.length,
                  defaultValue: `Remove ${selectedGuardians.length} Guardian(s)?`,
                })}
              </Text>
            </View>

            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalMessage}>
                {t("screens:removeGuardian.confirmMessage", {
                  youthName: youthName as string,
                  defaultValue: `This will remove the selected guardian(s) from ${youthName}. The guardian's "guardian" role in the club will also be de-accumulated.`,
                })}
              </Text>

              <View style={styles.infoSection}>
                <Text style={styles.infoSectionTitle}>
                  {t("screens:removeGuardian.guardiansToRemove", {
                    defaultValue: "Guardians to remove:",
                  })}
                </Text>
                {selectedGuardians.map((guardian) => (
                  <View key={guardian.guardianUid} style={styles.infoItem}>
                    <Ionicons
                      name="person"
                      size={16}
                      color={theme.colors.textSecondary}
                    />
                    <View style={styles.dependentInfo}>
                      <Text style={styles.infoText}>
                        {guardian.guardianName}
                      </Text>
                      <Text style={styles.infoSubtext}>
                        {guardian.guardianEmail} ({guardian.relationship})
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setIsConfirmModalVisible(false)}
                disabled={removing}
              >
                <Text style={styles.modalButtonTextCancel}>
                  {t("common:cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleConfirmRemoval}
                disabled={removing}
              >
                {removing ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primary}
                  />
                ) : (
                  <Text style={styles.modalButtonText}>
                    {t("screens:removeGuardian.confirmButton", {
                      defaultValue: "Remove",
                    })}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Results Modal */}
      <Modal
        visible={showResultModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowResultModal(false);
          if (removalResults.failed === 0) {
            router.dismiss(2);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons
                name={
                  removalResults.failed === 0 ? "checkmark-circle" : "warning"
                }
                size={48}
                color={
                  removalResults.failed === 0
                    ? theme.colors.secondary
                    : "#FF6B6B"
                }
              />
              <Text style={styles.modalTitle}>
                {removalResults.failed === 0
                  ? t("screens:removeGuardian.removed", {
                      defaultValue: "Guardian(s) Removed",
                    })
                  : t("screens:removeGuardian.removalComplete", {
                      defaultValue: "Removal Complete",
                    })}
              </Text>
            </View>

            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalMessage}>
                {removalResults.success > 0 &&
                  `${removalResults.success} guardian(s) successfully removed.`}
                {removalResults.failed > 0 &&
                  `\n\n${removalResults.failed} guardian(s) failed to remove.`}
              </Text>

              {removalResults.errors.length > 0 && (
                <View style={styles.infoSection}>
                  <Text style={styles.infoSectionTitle}>Errors:</Text>
                  {removalResults.errors.map((error, index) => (
                    <View key={index} style={styles.errorItem}>
                      <Ionicons name="close-circle" size={16} color="#FF6B6B" />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={() => {
                  setShowResultModal(false);
                  if (removalResults.failed === 0) {
                    router.dismiss(2);
                  }
                }}
              >
                <Text style={styles.modalButtonText}>{t("common:ok")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Last Guardian Warning Modal */}
      <ConfirmationModal
        visible={showLastGuardianWarning}
        title={t("screens:removeGuardian.lastGuardianTitle", {
          defaultValue: "Cannot Remove Guardian",
        })}
        message={t("screens:removeGuardian.lastGuardianMessage", {
          defaultValue:
            "A youth player must have at least one guardian. You cannot remove the last guardian.",
        })}
        confirmText={t("common:ok")}
        onConfirm={() => {
          setShowLastGuardianWarning(false);
          setSelectedGuardians([]);
        }}
        onCancel={() => {
          setShowLastGuardianWarning(false);
          setSelectedGuardians([]);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  subtitleBar: {
    paddingHorizontal: theme.layout.containerPadding,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.layout.containerPadding,
    paddingTop: theme.spacing.md,
  },
  instructionText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  membersList: {
    flex: 1,
  },
  membersListContent: {
    paddingBottom: theme.spacing.xl,
  },
  membersListContentWithActions: {
    paddingBottom: 100,
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.sm,
    borderWidth: 2,
    borderColor: theme.colors.inputBorder,
  },
  memberItemSelected: {
    borderColor: theme.colors.secondary,
    backgroundColor: `${theme.colors.secondary}10`,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.textSecondary,
    marginRight: theme.spacing.md,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  memberEmail: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  memberRoles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
  },
  roleTag: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.small,
  },
  roleText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: theme.spacing.xxl,
  },
  emptyStateText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
    textAlign: "center",
  },
  actionContainer: {
    flexDirection: "row",
    gap: theme.spacing.md,
    paddingHorizontal: theme.layout.containerPadding,
    paddingTop: theme.spacing.lg,
    backgroundColor: theme.colors.primary,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  actionButton: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.lg,
  },
  modalContent: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.large,
    width: "100%",
    maxWidth: 500,
    maxHeight: "80%",
    overflow: "hidden",
  },
  modalHeader: {
    alignItems: "center",
    paddingTop: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    textAlign: "center",
  },
  modalBody: {
    paddingHorizontal: theme.spacing.lg,
    maxHeight: 400,
  },
  modalMessage: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    lineHeight: 22,
    marginBottom: theme.spacing.lg,
  },
  infoSection: {
    marginBottom: theme.spacing.lg,
  },
  infoSectionTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.small,
    marginBottom: theme.spacing.xs,
  },
  infoText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
    flex: 1,
  },
  dependentInfo: {
    marginLeft: theme.spacing.sm,
    flex: 1,
  },
  infoSubtext: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  modalActions: {
    flexDirection: "row",
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
  },
  modalButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    alignItems: "center",
    justifyContent: "center",
  },
  modalButtonCancel: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.colors.textSecondary,
  },
  modalButtonConfirm: {
    backgroundColor: "#FF6B6B",
  },
  modalButtonText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.bold,
    color: "#FFFFFF",
  },
  modalButtonTextCancel: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
  },
  errorItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  errorText: {
    fontSize: theme.typography.fontSize.small,
    color: "#FF6B6B",
    flex: 1,
  },
});
