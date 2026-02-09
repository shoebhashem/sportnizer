/**
 * ADD CHILD/YOUTH MEMBER SCREEN
 * ============================
 *
 * PURPOSE:
 * Allows club/group administrators to invite youth members (children under 18)
 * to join a specific group. The invitation is sent to the guardian's email.
 *
 * KEY FEATURES:
 * 1. Guardian email input with validation
 * 2. Child information collection (name, date of birth, relationship)
 * 3. Integration with youth member invitation system
 * 4. Sends guardianInvitationTemplate email for new guardians
 * 5. Creates in-app notification for existing guardians
 *
 * WORKFLOW:
 * 1. Admin enters guardian email and child information
 * 2. System checks if guardian email belongs to existing user
 * 3. Existing users → get in-app notification
 * 4. New users → receive guardian invitation email
 * 5. Guardian accepts → youth document created → child added to group
 */

import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import Input from "@/components/Input";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import type { YouthOption } from "@/services/validation/types";
import { validateMemberForInvitation } from "@/services/validation/validateMemberForInvitation";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AddChildMemberScreen() {
  const { groupId, groupName, clubId, clubName } = useLocalSearchParams();
  const { user } = useAuth();

  // Form state
  const [guardianEmail, setGuardianEmail] = useState("");
  const [childName, setChildName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [relationship, setRelationship] = useState("Parent");

  // Existing youth selection state
  const [existingYouthOptions, setExistingYouthOptions] = useState<
    YouthOption[]
  >([]);
  const [nonSelectableYouth, setNonSelectableYouth] = useState<YouthOption[]>(
    [],
  );
  const [selectedExistingYouth, setSelectedExistingYouth] = useState<any>(null);
  const [showExistingYouthSelector, setShowExistingYouthSelector] =
    useState(false);
  const [checkingGuardian, setCheckingGuardian] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalConfirmText, setModalConfirmText] = useState("OK");
  const [modalCancelText, setModalCancelText] = useState("");
  const [modalOnConfirm, setModalOnConfirm] = useState<() => void>(
    () => () => {},
  );

  // Debug logging
  React.useEffect(() => {
    console.log("🔍 AddChildMember Navigation Params:", {
      groupId,
      groupName,
      clubId,
      clubName,
    });
  }, [groupId, groupName, clubId, clubName]);

  const showModal = (
    title: string,
    message: string,
    confirmText = "OK",
    cancelText = "",
    onConfirm?: () => void,
  ) => {
    setModalTitle(title);
    setModalMessage(message);
    setModalConfirmText(confirmText);
    setModalCancelText(cancelText);
    setModalOnConfirm(() => onConfirm || hideModal);
    setModalVisible(true);
  };

  const hideModal = () => {
    setModalVisible(false);
  };

  const handleGuardianEmailBlur = async () => {
    const email = guardianEmail.trim().toLowerCase();
    console.log("🔍 handleGuardianEmailBlur called with email:", email);

    if (!email || !validateEmail(email)) {
      console.log("⚠️ Email is empty or invalid, skipping lookup");
      setStatusMessage("");
      return;
    }

    setCheckingGuardian(true);
    setStatusMessage("");

    try {
      // Use validation service
      const result = await validateMemberForInvitation({
        email,
        role: "player-underage",
        clubId: clubId as string,
        groupId: groupId as string,
        groupName: groupName as string,
      });

      console.log("📋 Validation result:", result);

      // Set status message
      setStatusMessage(result.statusMessage);

      // Handle youth options
      if (result.youthOptions && result.youthOptions.length > 0) {
        const selectable = result.youthOptions.filter((y) => y.selectable);
        const nonSelectable = result.youthOptions.filter((y) => !y.selectable);

        setExistingYouthOptions(selectable);
        setNonSelectableYouth(nonSelectable);

        // Show selector if there are any youth (selectable or not)
        setShowExistingYouthSelector(true);
      } else {
        setExistingYouthOptions([]);
        setNonSelectableYouth([]);
        setShowExistingYouthSelector(false);
      }
    } catch (error) {
      console.error("❌ Error in handleGuardianEmailBlur:", error);
      setStatusMessage("Error checking guardian email");
      // Silent fail - user can still add new youth
    } finally {
      setCheckingGuardian(false);
    }
  };

  const selectExistingYouth = (youth: YouthOption) => {
    setSelectedExistingYouth(youth);
    setChildName(youth.youthName);
    setShowExistingYouthSelector(false);

    // Don't set DOB or relationship for existing youth
    // as they already exist in the system
  };

  const handleAddNewYouth = () => {
    setSelectedExistingYouth(null);
    setShowExistingYouthSelector(false);
    setChildName("");
    setDateOfBirth("");
    setRelationship("Parent");
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = (): boolean => {
    if (!guardianEmail.trim()) {
      showModal("Validation Error", "Please enter guardian email address");
      return false;
    }

    if (!validateEmail(guardianEmail.trim())) {
      showModal("Validation Error", "Please enter a valid email address");
      return false;
    }

    if (!childName.trim()) {
      showModal("Validation Error", "Please enter child's name");
      return false;
    }

    if (childName.trim().length < 2) {
      showModal(
        "Validation Error",
        "Child's name must be at least 2 characters",
      );
      return false;
    }

    // Skip DOB and relationship validation for existing youth
    if (selectedExistingYouth) {
      return true;
    }

    if (!dateOfBirth.trim()) {
      showModal("Validation Error", "Please enter child's date of birth");
      return false;
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateOfBirth)) {
      showModal(
        "Validation Error",
        "Date must be in format YYYY-MM-DD (e.g., 2015-06-15)",
      );
      return false;
    }

    // Validate date is in the past and reasonable
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    const minDate = new Date();
    minDate.setFullYear(today.getFullYear() - 25); // Max 25 years old

    if (isNaN(birthDate.getTime())) {
      showModal("Validation Error", "Please enter a valid date");
      return false;
    }

    if (birthDate > today) {
      showModal("Validation Error", "Date of birth cannot be in the future");
      return false;
    }

    if (birthDate < minDate) {
      showModal("Validation Error", "Child must be under 25 years old");
      return false;
    }

    if (!relationship.trim()) {
      showModal(
        "Validation Error",
        "Please specify your relationship to the child",
      );
      return false;
    }

    return true;
  };

  const handleSendInvitation = async () => {
    if (!validateForm()) return;

    if (!user) {
      showModal("Error", "You must be logged in to send invitations");
      return;
    }

    // Validate guardian email before sending invitation
    const email = guardianEmail.trim().toLowerCase();

    // Check if we need to run validation (hasn't been done yet via onBlur)
    if (!checkingGuardian && !statusMessage) {
      console.log("🔍 Running validation before submit");

      setCheckingGuardian(true);

      try {
        const result = await validateMemberForInvitation({
          email,
          role: "player-underage",
          clubId: clubId as string,
          groupId: groupId as string,
          groupName: groupName as string,
        });

        setStatusMessage(result.statusMessage);

        // Handle youth options
        if (result.youthOptions && result.youthOptions.length > 0) {
          const selectable = result.youthOptions.filter((y) => y.selectable);
          const nonSelectable = result.youthOptions.filter(
            (y) => !y.selectable,
          );

          setExistingYouthOptions(selectable);
          setNonSelectableYouth(nonSelectable);
          setShowExistingYouthSelector(true);
          setCheckingGuardian(false);

          // Don't proceed with invitation - let user select youth first
          showModal(
            "Youth Players Found",
            `This guardian has existing youth players. Please select one or choose to add a new youth player.`,
          );
          return;
        }

        // Check if invitation is blocked
        if (!result.canInvite) {
          setCheckingGuardian(false);
          showModal(
            "Cannot Send Invitation",
            result.statusMessage ||
              "This youth player cannot be added to the group at this time.",
          );
          return;
        }

        setCheckingGuardian(false);
      } catch (error) {
        console.error("❌ Error validating guardian email:", error);
        setCheckingGuardian(false);
        setStatusMessage("Error checking guardian email");
        // Continue with invitation despite validation error
      }
    }

    setLoading(true);

    try {
      console.log("📤 Sending youth member invitation:", {
        guardianEmail: guardianEmail.trim(),
        childName: childName.trim(),
        dateOfBirth,
        relationship: relationship.trim(),
        groupId,
        clubId,
      });

      // Use the unified invitation service (same as regular member flow)
      const { addRegularMemberToGroupService } =
        await import("@/services/orchestration/addRegularMemberToGroup");

      // Determine invitation type based on whether youth is existing or new
      const invitationType = selectedExistingYouth
        ? "youth_member_existing"
        : "youth_member";

      const invitationData: any = {
        emails: [guardianEmail.trim().toLowerCase()],
        clubId: clubId as string,
        clubName: clubName as string,
        groupId: groupId as string,
        groupName: groupName as string,
        inviterName: user.displayName || user.email || "Admin",
        inviterUid: user.uid,
        invitationType: invitationType,
        role: "player-underage",
      };

      // Add youth data based on type
      if (selectedExistingYouth) {
        invitationData.existingYouthData = {
          youthUid: selectedExistingYouth.youthUid,
          youthName: selectedExistingYouth.youthName,
        };
      } else {
        invitationData.youthData = {
          childName: childName.trim(),
          dateOfBirth: dateOfBirth,
          relationship: relationship.trim(),
        };
      }

      const result =
        await addRegularMemberToGroupService.inviteUsersToGroup(invitationData);

      console.log("📧 Youth invitation result:", result);

      if (result.success && result.results && result.results.length > 0) {
        const inviteResult = result.results[0];

        if (inviteResult.success) {
          const isExisting = inviteResult.action === "in_app_notification";
          const successMessage = isExisting
            ? `✅ Guardian Notified!\n\nAn in-app notification has been sent to ${guardianEmail.trim()}.\n\nThey will be able to add ${childName.trim()} to ${groupName} from their notifications.`
            : `✅ Invitation Sent!\n\nAn email invitation has been sent to ${guardianEmail.trim()}.\n\nThey will receive instructions to add ${childName.trim()} to ${groupName}.`;

          showModal("Success", successMessage, "Send Another", "Done", () => {
            // "Send Another" button - Reset form and hide modal
            hideModal();
            setGuardianEmail("");
            setChildName("");
            setDateOfBirth("");
            setRelationship("Parent");
          });
        } else {
          showModal("Error", inviteResult.error || "Failed to send invitation");
        }
      } else {
        showModal("Error", result.error || "Failed to send invitation");
      }
    } catch (error: any) {
      console.error("❌ Error sending youth member invitation:", error);
      showModal(
        "Error",
        error.message || "An unexpected error occurred. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    showModal(
      "Cancel Invitation",
      "Are you sure you want to cancel? Any entered information will be lost.",
      "Yes, Cancel",
      "No, Continue",
      () => router.back(),
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Add Child/Youth Member</Text>
            <Text style={styles.subtitle}>
              Invite a child to join {groupName || "this group"}. The invitation
              will be sent to their guardian.
            </Text>
          </View>

          {/* Info Card */}
          <View style={styles.infoCard}>
            <Ionicons
              name="information-circle"
              size={24}
              color={theme.colors.secondary}
            />
            <Text style={styles.infoText}>
              The guardian will receive an invitation to add their child to the
              group. They will manage all communications and event responses for
              the child.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.sectionTitle}>Guardian Information</Text>

            <Input
              label="Guardian Email *"
              value={guardianEmail}
              onChangeText={(text) => {
                setGuardianEmail(text);
                // Reset existing youth selection when email changes
                if (selectedExistingYouth) {
                  setSelectedExistingYouth(null);
                  setChildName("");
                }
              }}
              onBlur={handleGuardianEmailBlur}
              placeholder="guardian@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {checkingGuardian && (
              <View style={styles.checkingContainer}>
                <Text style={styles.checkingText}>
                  Checking for existing youth...
                </Text>
              </View>
            )}

            {/* Status message */}
            {!checkingGuardian && statusMessage && (
              <View style={styles.statusContainer}>
                <Ionicons
                  name="information-circle"
                  size={16}
                  color={theme.colors.secondary}
                />
                <Text style={styles.statusText}>{statusMessage}</Text>
              </View>
            )}

            {/* Existing Youth Selector */}
            {showExistingYouthSelector &&
              (existingYouthOptions.length > 0 ||
                nonSelectableYouth.length > 0) && (
                <View style={styles.existingYouthCard}>
                  <View style={styles.existingYouthHeader}>
                    <Ionicons
                      name="people-circle"
                      size={24}
                      color={theme.colors.secondary}
                    />
                    <Text style={styles.existingYouthTitle}>
                      Existing Youth Players
                    </Text>
                  </View>
                  <Text style={styles.existingYouthSubtitle}>
                    This guardian has youth players. Select one to add to{" "}
                    {groupName}:
                  </Text>

                  {/* Selectable youth */}
                  {existingYouthOptions.map((youth, index) => (
                    <View
                      key={youth.youthUid}
                      style={[
                        styles.youthOption,
                        index === existingYouthOptions.length - 1 &&
                          nonSelectableYouth.length === 0 &&
                          styles.youthOptionLast,
                      ]}
                    >
                      <View style={styles.youthOptionContent}>
                        <Text style={styles.youthOptionName}>
                          {youth.youthName}
                        </Text>
                        <Text style={styles.youthOptionClubs}>
                          Currently in:{" "}
                          {youth.currentClubs.join(", ") || "None"}
                        </Text>
                      </View>
                      <Button
                        label="Select"
                        onPress={() => selectExistingYouth(youth)}
                        theme="primary"
                      />
                    </View>
                  ))}

                  {/* Non-selectable youth - shown but disabled */}
                  {nonSelectableYouth.map((youth, index) => (
                    <View
                      key={youth.youthUid}
                      style={[
                        styles.youthOption,
                        styles.youthOptionDisabled,
                        index === nonSelectableYouth.length - 1 &&
                          styles.youthOptionLast,
                      ]}
                    >
                      <View style={styles.youthOptionContent}>
                        <Text
                          style={[
                            styles.youthOptionName,
                            styles.youthOptionNameDisabled,
                          ]}
                        >
                          {youth.youthName}
                        </Text>
                        <Text style={styles.youthOptionClubs}>
                          Currently in:{" "}
                          {youth.currentClubs.join(", ") || "None"}
                        </Text>
                      </View>
                      <View style={styles.disabledBadge}>
                        <Text style={styles.disabledBadgeText}>
                          {youth.statusMessage}
                        </Text>
                      </View>
                    </View>
                  ))}

                  <Button
                    label="Add New Youth Instead"
                    onPress={handleAddNewYouth}
                    theme="secondary"
                  />
                </View>
              )}

            {/* Show selected existing youth */}
            {selectedExistingYouth && (
              <View style={styles.selectedYouthCard}>
                <View style={styles.selectedYouthHeader}>
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={theme.colors.success}
                  />
                  <Text style={styles.selectedYouthText}>
                    Selected: {selectedExistingYouth.youthName}
                  </Text>
                </View>
                <Button
                  label="Choose Different Youth"
                  onPress={() => setShowExistingYouthSelector(true)}
                  theme="secondary"
                />
              </View>
            )}

            {/* Only show child info form if no existing youth selected */}
            {!selectedExistingYouth && (
              <>
                <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>
                  Child Information
                </Text>

                <Input
                  label="Child's Name *"
                  value={childName}
                  onChangeText={setChildName}
                  placeholder="Enter child's full name"
                  autoCapitalize="words"
                />

                <Input
                  label="Date of Birth *"
                  value={dateOfBirth}
                  onChangeText={setDateOfBirth}
                  placeholder="YYYY-MM-DD (e.g., 2015-06-15)"
                  autoCapitalize="none"
                />

                <Input
                  label="Relationship to Guardian *"
                  value={relationship}
                  onChangeText={setRelationship}
                  placeholder="Parent, Guardian, etc."
                  autoCapitalize="words"
                />
              </>
            )}

            <Text style={styles.helperText}>* All fields are required</Text>
          </View>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <Button
              label={loading ? "Sending Invitation..." : "Send Invitation"}
              onPress={handleSendInvitation}
              theme="primary"
              disabled={loading}
              loading={loading}
            />

            <Button
              label="Cancel"
              onPress={handleCancel}
              theme="secondary"
              disabled={loading}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal */}
      <ConfirmationModal
        visible={modalVisible}
        title={modalTitle}
        message={modalMessage}
        confirmText={modalConfirmText}
        cancelText={modalCancelText}
        onConfirm={modalOnConfirm}
        onCancel={
          modalCancelText === "Done"
            ? () => {
                hideModal();
                router.back();
              }
            : hideModal
        }
        confirmButtonTheme="primary"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  scrollContent: {
    padding: theme.layout.containerPadding,
  },
  header: {
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.white,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
  infoCard: {
    flexDirection: "row",
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.lg,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    marginLeft: theme.spacing.sm,
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  form: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.white,
    marginBottom: theme.spacing.md,
  },
  sectionTitleSpaced: {
    marginTop: theme.spacing.lg,
  },
  helperText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    fontStyle: "italic",
  },
  buttonContainer: {
    gap: theme.spacing.md,
  },
  checkingContainer: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  checkingText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    fontStyle: "italic",
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  statusText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.xs,
    flex: 1,
  },
  existingYouthCard: {
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  existingYouthHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  existingYouthTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.white,
    marginLeft: theme.spacing.sm,
  },
  existingYouthSubtitle: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    lineHeight: 20,
  },
  youthOption: {
    flexDirection: "column",
    alignItems: "stretch",
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.inputBorder,
  },
  youthOptionLast: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  youthOptionContent: {
    marginBottom: theme.spacing.md,
  },
  youthOptionName: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: "600" as any,
    color: theme.colors.white,
    marginBottom: 4,
  },
  youthOptionClubs: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  youthOptionDisabled: {
    opacity: 0.6,
  },
  youthOptionNameDisabled: {
    color: theme.colors.textSecondary,
  },
  disabledBadge: {
    backgroundColor: theme.colors.error + "20",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.small,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  disabledBadgeText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.error,
    fontWeight: "600" as any,
    textAlign: "center",
  },
  selectButton: {
    minWidth: 80,
  },
  addNewButton: {
    marginTop: theme.spacing.md,
  },
  selectedYouthCard: {
    backgroundColor: theme.colors.success + "20",
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.success,
  },
  selectedYouthHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  selectedYouthText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: "600",
    color: theme.colors.white,
    marginLeft: theme.spacing.sm,
  },
  changeYouthButton: {
    marginTop: theme.spacing.sm,
  },
});
