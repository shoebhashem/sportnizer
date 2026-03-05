/**
 * ADD ADULT MEMBER SCREEN
 * =======================
 *
 * PURPOSE:
 * Universal screen for inviting adult members (players, coaches, admins) to groups.
 * Configurable via 'role' parameter passed through navigation.
 *
 * SUPPORTED ROLES:
 * - player: Regular adult players
 * - coach: Team coaches
 * - admin: Group administrators
 *
 * KEY FEATURES:
 * 1. Role-based configuration (titles, labels, validation)
 * 2. Multiple email input fields (up to 10 emails)
 * 3. Real-time email validation with onBlur + submit checks
 * 4. Smart invitation routing (existing users vs new users)
 * 5. Role accumulation support (add roles to existing members)
 * 6. Detailed success/failure feedback
 *
 * WORKFLOW:
 * 1. Admin enters email addresses
 * 2. System validates each email (checks for duplicates, existing roles)
 * 3. On submit: validates all emails, then sends invitations
 * 4. Existing users → in-app notifications
 * 5. New users → email invitations
 * 6. Admin gets detailed results for each invitation
 */

import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import Input from "@/components/Input";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/contexts/UserContext";
import { addRegularMemberToGroupService } from "@/services/orchestration/addRegularMemberToGroup";
import { validateMemberForInvitation } from "@/services/validation/validateMemberForInvitation";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

/**
 * Role Configuration
 * Defines UI text and labels for each supported role
 */
type RoleType = "player" | "coach" | "admin" | "club-admin";

interface RoleConfig {
  title: string;
  subtitle: string;
  infoText: string;
  roleLabel: string;
  pluralLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const roleConfigs: Record<RoleType, RoleConfig> = {
  player: {
    title: "Add Player",
    subtitle: "Invite adults to join",
    infoText:
      "Enter email addresses to invite users. Existing Clubnizer users will receive in-app notifications, while new users will get email invitations with Accept/Reject buttons.",
    roleLabel: "player",
    pluralLabel: "players",
    icon: "person-add-outline",
  },
  coach: {
    title: "Add Coach",
    subtitle: "Invite coaches to join",
    infoText:
      "Invite coaches to join this group. Existing members will have their role updated, new users will receive coach invitations.",
    roleLabel: "coach",
    pluralLabel: "coaches",
    icon: "people",
  },
  admin: {
    title: "Add Admin",
    subtitle: "Invite admins to join",
    infoText:
      "Invite administrators to manage this group. Admins can add/remove members, create events, and manage group settings.",
    roleLabel: "admin",
    pluralLabel: "admins",
    icon: "shield",
  },
  "club-admin": {
    title: "Add Club Admin",
    subtitle: "Invite club administrators",
    infoText:
      "Invite administrators to manage this entire club. Club admins can manage all groups, create events, and control club settings.",
    roleLabel: "club administrator",
    pluralLabel: "club administrators",
    icon: "shield-checkmark",
  },
};

export default function AddAdultMemberScreen() {
  /**
   * NAVIGATION PARAMETERS
   */
  const { groupId, groupName, clubId, clubName, role } = useLocalSearchParams();
  const { user } = useAuth();
  const { userProfile } = useUserProfile();
  const navigation = useNavigation();

  // Get role configuration
  const memberRole = (role as RoleType) || "player";
  const config = roleConfigs[memberRole];
  const { t } = useTranslation(["screens", "common"]);

  const infoTextKeys: Record<RoleType, string> = {
    player: "playerInfoText",
    coach: "coachInfoText",
    admin: "adminInfoText",
    "club-admin": "clubAdminInfoText",
  };

  // Set dynamic native header title
  useLayoutEffect(() => {
    const titleKeys: Record<RoleType, string> = {
      player: "addPlayer",
      coach: "addCoach",
      admin: "addAdmin",
      "club-admin": "addClubAdmin",
    };
    navigation.setOptions({
      title: t(`screens:addAdultMember.${titleKeys[memberRole]}`),
    });
  }, [memberRole, navigation, t]);

  /**
   * DEBUG LOGGING
   */
  React.useEffect(() => {
    console.log("🔍 AddAdultMember Navigation Params:", {
      role: memberRole,
      groupId,
      groupName,
      clubId,
      clubName,
    });
  }, [memberRole, groupId, groupName, clubId, clubName]);

  /**
   * STATE MANAGEMENT
   */
  const [emailAddresses, setEmailAddresses] = useState<string[]>([""]);
  const [emailValidation, setEmailValidation] = useState<{
    [index: number]: {
      checking: boolean;
      message: string;
      canInvite: boolean;
    };
  }>({});
  const [sendingInvitations, setSendingInvitations] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalConfirmText, setModalConfirmText] = useState("OK");
  const [modalCancelText, setModalCancelText] = useState("");
  const [modalOnConfirm, setModalOnConfirm] = useState<() => void>(
    () => () => {},
  );

  /**
   * UTILITY FUNCTIONS
   */
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

  /**
   * HANDLE EMAIL BLUR - VALIDATION
   * Called when user leaves an email input field
   * Validates the email and checks if user can be invited
   */
  const handleEmailBlur = async (index: number, email: string) => {
    const trimmedEmail = email.trim().toLowerCase();

    // Clear validation for empty emails
    if (!trimmedEmail) {
      setEmailValidation((prev) => {
        const updated = { ...prev };
        delete updated[index];
        return updated;
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return; // Skip validation for invalid format
    }

    // Set checking state
    setEmailValidation((prev) => ({
      ...prev,
      [index]: { checking: true, message: "", canInvite: true },
    }));

    try {
      const result = await validateMemberForInvitation({
        email: trimmedEmail,
        role: memberRole,
        clubId: clubId as string,
        ...(memberRole !== "club-admin" && {
          groupId: groupId as string,
          groupName: groupName as string,
        }),
      });

      setEmailValidation((prev) => ({
        ...prev,
        [index]: {
          checking: false,
          message: result.statusMessage,
          canInvite: result.canInvite,
        },
      }));
    } catch (error) {
      console.error("Validation error:", error);
      setEmailValidation((prev) => ({
        ...prev,
        [index]: {
          checking: false,
          message: t("screens:addAdultMember.errorCheckingEmail"),
          canInvite: true,
        },
      }));
    }
  };

  /**
   * EMAIL FIELD MANAGEMENT
   */
  const addEmailField = () => {
    if (emailAddresses.length < 10) {
      setEmailAddresses([...emailAddresses, ""]);
    }
  };

  const removeEmailField = (index: number) => {
    if (emailAddresses.length > 1) {
      const newEmails = emailAddresses.filter((_, i) => i !== index);
      setEmailAddresses(newEmails);
      // Clear validation for this email and reindex
      setEmailValidation((prev) => {
        const updated = { ...prev };
        delete updated[index];
        // Reindex remaining validations
        const reindexed: typeof updated = {};
        Object.keys(updated).forEach((key) => {
          const numKey = parseInt(key);
          if (numKey > index) {
            reindexed[numKey - 1] = updated[numKey];
          } else {
            reindexed[numKey] = updated[numKey];
          }
        });
        return reindexed;
      });
    }
  };

  const updateEmail = (index: number, email: string) => {
    const newEmails = [...emailAddresses];
    newEmails[index] = email;
    setEmailAddresses(newEmails);
  };

  /**
   * VALIDATE ALL EMAILS ON SUBMIT
   * Ensures all email fields are validated before submission
   */
  const validateAllEmails = async (): Promise<boolean> => {
    const nonEmptyEmails = emailAddresses
      .map((email, index) => ({ email: email.trim().toLowerCase(), index }))
      .filter(({ email }) => email.length > 0);

    if (nonEmptyEmails.length === 0) {
      return false;
    }

    // Check which emails haven't been validated yet
    const unvalidatedEmails = nonEmptyEmails.filter(
      ({ index }) => !emailValidation[index] || emailValidation[index].checking,
    );

    // Validate any unvalidated emails
    if (unvalidatedEmails.length > 0) {
      console.log(
        "🔍 Validating remaining emails before submit:",
        unvalidatedEmails.length,
      );

      await Promise.all(
        unvalidatedEmails.map(async ({ email, index }) => {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email)) {
            return;
          }

          setEmailValidation((prev) => ({
            ...prev,
            [index]: { checking: true, message: "", canInvite: true },
          }));

          try {
            const result = await validateMemberForInvitation({
              email,
              role: memberRole,
              clubId: clubId as string,
              ...(memberRole !== "club-admin" && {
                groupId: groupId as string,
                groupName: groupName as string,
              }),
            });

            setEmailValidation((prev) => ({
              ...prev,
              [index]: {
                checking: false,
                message: result.statusMessage,
                canInvite: result.canInvite,
              },
            }));
          } catch (error) {
            console.error("Validation error:", error);
            setEmailValidation((prev) => ({
              ...prev,
              [index]: {
                checking: false,
                message: t("screens:addAdultMember.errorCheckingEmail"),
                canInvite: true,
              },
            }));
          }
        }),
      );
    }

    // Wait for state updates
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check if any emails cannot be invited
    const blockedEmails = nonEmptyEmails.filter(
      ({ index }) =>
        emailValidation[index] && !emailValidation[index].canInvite,
    );

    if (blockedEmails.length > 0) {
      const blockedAddresses = blockedEmails
        .map(({ email }) => email)
        .join(", ");
      showModal(
        t("screens:addAdultMember.cannotSendInvitations"),
        `The following email(s) cannot be invited because they already have the ${config.roleLabel} role in this group:\n\n${blockedAddresses}`,
      );
      return false;
    }

    return true;
  };

  /**
   * EMAIL VALIDATION
   * Validates all entered email addresses and returns only valid ones
   */
  const validateEmails = (): string[] => {
    const validEmails = emailAddresses
      .map((email) => email.trim())
      .filter((email) => email.length > 0);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = validEmails.filter(
      (email) => !emailRegex.test(email),
    );

    if (invalidEmails.length > 0) {
      showModal(
        t("screens:addAdultMember.invalidEmails"),
        `${t("screens:addAdultMember.pleaseCheckEmails")}\n${invalidEmails.join("\n")}`,
      );
      return [];
    }

    return validEmails;
  };

  /**
   * MAIN INVITATION HANDLER
   */
  const handleSendInvitations = async () => {
    // Step 1: Run validation service check for all emails
    const allEmailsValid = await validateAllEmails();
    if (!allEmailsValid) {
      return;
    }

    // Step 2: Validate email format and get valid emails
    const validEmails = validateEmails();
    if (validEmails.length === 0) {
      showModal(
        t("screens:addAdultMember.noValidEmails"),
        t("screens:addAdultMember.noValidEmailsMessage"),
      );
      return;
    }

    // Step 3: Check if user is authenticated
    if (!user) {
      showModal(
        t("common:error"),
        t("screens:addAdultMember.unableToSendInvitations"),
      );
      return;
    }

    // Step 4: Show loading state
    setSendingInvitations(true);

    try {
      const isClubAdminInvitation = memberRole === "club-admin";
      const result = await addRegularMemberToGroupService.inviteUsersToGroup({
        emails: validEmails,
        clubId: clubId as string,
        clubName: clubName as string,
        ...(isClubAdminInvitation
          ? {}
          : {
              groupId: groupId as string,
              groupName: groupName as string,
            }),
        inviterName:
          userProfile?.displayName ||
          user.displayName ||
          "A club administrator",
        inviterUid: user.uid,
        role: memberRole,
        ...(isClubAdminInvitation && { invitationType: "club_admin" as const }),
      });

      console.log("📧 Invitation workflow result:", result);

      if (result.success) {
        const successCount =
          result.results?.filter((r) => r.success).length || 0;
        const failureCount =
          result.results?.filter((r) => !r.success).length || 0;

        if (failureCount === 0) {
          const successMessage =
            successCount === 1
              ? `✅ ${t("common:success")}!\n\n${t("screens:addAdultMember.invitationSentTo", { email: validEmails[0] })}`
              : `✅ ${t("common:success")}!\n\n${t("screens:addAdultMember.allInvitationsSent", { count: successCount })}`;

          showModal(
            t("common:success"),
            successMessage,
            t("screens:addAdultMember.sendMore"),
            t("common:done"),
            () => {
              hideModal();
              setEmailAddresses([""]);
              setEmailValidation({});
            },
          );
        } else {
          const partialMessage = `✅ Partial Success\n\n${successCount} invitation(s) sent successfully.\n${failureCount} invitation(s) failed.`;
          const failedEmails = result.results
            ?.filter((r) => !r.success)
            .map((r) => `• ${r.email}: ${r.error}`)
            .join("\n");

          showModal(
            t("screens:addAdultMember.partialSuccess"),
            `${partialMessage}\n\nFailed:\n${failedEmails}`,
            t("common:ok"),
            "",
            () => {
              hideModal();
              const failedEmailAddresses =
                result.results?.filter((r) => !r.success).map((r) => r.email) ||
                [];
              setEmailAddresses(
                failedEmailAddresses.length > 0 ? failedEmailAddresses : [""],
              );
              setEmailValidation({});
            },
          );
        }

        if (failureCount === 0) {
          setEmailAddresses([""]);
          setEmailValidation({});
        }
      } else {
        console.error("❌ Failed to add members:", result.error);
        showModal(
          t("common:error"),
          result.error || "Failed to add members to group",
        );
      }
    } catch (error: any) {
      console.error("❌ Error adding members to group:", error);

      let errorMessage = "Failed to add members to group. Please try again.";

      if (error.code) {
        switch (error.code) {
          case "functions/unauthenticated":
            errorMessage =
              "Authentication error. Please sign out and sign back in.";
            break;
          case "functions/permission-denied":
            errorMessage =
              "You don't have permission to invite members to this group.";
            break;
          case "functions/not-found":
            errorMessage = "Group or club not found. Please try again.";
            break;
          case "functions/unavailable":
            errorMessage =
              "Service temporarily unavailable. Please try again later.";
            break;
        }
      }

      showModal(t("common:error"), errorMessage);
    } finally {
      setSendingInvitations(false);
    }
  };

  /**
   * MAIN RENDER FUNCTION
   */
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* SUBTITLE */}
        <Text style={styles.subtitle}>
          {t(`screens:addAdultMember.${infoTextKeys[memberRole]}`)}
        </Text>

        {/* MAIN CONTENT SECTION */}
        <View>
          {/* EMAIL INPUT SECTION */}
          <View style={styles.emailSection}>
            <Text style={styles.sectionTitle}>
              {t("screens:addAdultMember.emailAddresses")}
            </Text>

            {emailAddresses.map((email, index) => (
              <View key={index} style={styles.emailInputRow}>
                <View style={styles.emailInputContainer}>
                  <Input
                    label={t("screens:addAdultMember.emailIndex", {
                      index: index + 1,
                    })}
                    value={email}
                    onChangeText={(text) => updateEmail(index, text)}
                    onBlur={() => handleEmailBlur(index, email)}
                    placeholder={t("screens:addAdultMember.emailPlaceholder")}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />

                  {/* Validation Status Display */}
                  {emailValidation[index] && (
                    <View style={styles.validationContainer}>
                      {emailValidation[index].checking && (
                        <View style={styles.validationRow}>
                          <Ionicons
                            name="hourglass-outline"
                            size={16}
                            color={theme.colors.textSecondary}
                          />
                          <Text style={styles.validationText}>
                            {t("screens:addAdultMember.checking")}
                          </Text>
                        </View>
                      )}
                      {!emailValidation[index].checking &&
                        emailValidation[index].canInvite && (
                          <View style={styles.validationRow}>
                            <Ionicons
                              name="checkmark-circle"
                              size={16}
                              color={theme.colors.success}
                            />
                            <Text
                              style={[
                                styles.validationText,
                                styles.validationSuccess,
                              ]}
                            >
                              {emailValidation[index].message}
                            </Text>
                          </View>
                        )}
                      {!emailValidation[index].checking &&
                        !emailValidation[index].canInvite && (
                          <View style={styles.validationRow}>
                            <Ionicons
                              name="warning"
                              size={16}
                              color={theme.colors.error}
                            />
                            <Text
                              style={[
                                styles.validationText,
                                styles.validationWarning,
                              ]}
                            >
                              {emailValidation[index].message}
                            </Text>
                          </View>
                        )}
                    </View>
                  )}
                </View>

                {emailAddresses.length > 1 && (
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeEmailField(index)}
                  >
                    <Ionicons
                      name="close-circle"
                      size={24}
                      color={theme.colors.error}
                    />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {emailAddresses.length < 10 && (
              <TouchableOpacity
                style={styles.addEmailButton}
                onPress={addEmailField}
              >
                <Ionicons
                  name="add-circle"
                  size={20}
                  color={theme.colors.secondary}
                />
                <Text style={styles.addEmailText}>
                  {t("screens:addAdultMember.addAnotherEmail")}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* SUBMIT BUTTON */}
          <Button
            label={
              sendingInvitations
                ? t("screens:addAdultMember.sendingInvitations")
                : t("screens:addAdultMember.sendInvitations")
            }
            onPress={handleSendInvitations}
            theme="primary"
            disabled={sendingInvitations}
          />
        </View>
      </ScrollView>

      {/* MODAL FOR SUCCESS/ERROR MESSAGES */}
      <ConfirmationModal
        visible={modalVisible}
        title={modalTitle}
        message={modalMessage}
        confirmText={modalConfirmText}
        cancelText={modalCancelText}
        onConfirm={modalOnConfirm}
        onCancel={
          modalCancelText === t("common:done")
            ? () => {
                hideModal();
                router.back();
              }
            : hideModal
        }
        confirmButtonTheme="primary"
      />
    </View>
  );
}

/**
 * STYLES
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  scrollContent: {
    padding: theme.layout.containerPadding,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    lineHeight: 22,
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  emailSection: {
    marginBottom: theme.spacing.xl,
  },
  emailInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  emailInputContainer: {
    flex: 1,
  },
  removeButton: {
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  addEmailButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  addEmailText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  validationContainer: {
    marginTop: theme.spacing.xs,
  },
  validationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  validationText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  validationSuccess: {
    color: theme.colors.success,
  },
  validationWarning: {
    color: theme.colors.error,
  },
});
