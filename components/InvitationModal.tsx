import { theme } from "@/constants/theme";
import React from "react";
import { useTranslation } from "react-i18next";
import { Modal, StyleSheet, Text, View } from "react-native";
import Button from "./Button";

interface InvitationModalProps {
  visible: boolean;
  groupName: string;
  clubName?: string; // For club-level invitations
  inviterName: string;
  onAccept: () => void;
  onReject: () => void;
  loading?: boolean;
  role?: string; // Role being assigned (coach, player, admin, etc.)
  inviteeName?: string; // Name of the person being invited (instead of "you")
  invitationType?: string; // Type of invitation (regular, club_admin, etc.)
  youthData?: {
    childName: string;
    dateOfBirth: string;
    relationship: string;
  };
  existingYouthData?: {
    youthUid: string;
    youthName: string;
  };
  metadata?: {
    action?: "role_update" | "new_member";
    newRole?: string;
    existingRoles?: string[];
  };
}

const InvitationModal: React.FC<InvitationModalProps> = ({
  visible,
  groupName,
  clubName,
  inviterName,
  onAccept,
  onReject,
  loading = false,
  role,
  inviteeName,
  invitationType,
  youthData,
  existingYouthData,
  metadata,
}) => {
  const isRoleUpdate = metadata?.action === "role_update";
  const isClubAdminInvitation = invitationType === "club_admin";
  const newRole = metadata?.newRole || role || "member";
  const { t } = useTranslation(["components", "common"]);

  // Determine which type of youth invitation this is
  const isYouthInvitation = !!(youthData || existingYouthData);
  const youthName = existingYouthData?.youthName || youthData?.childName;

  // Get user-friendly role label
  const getRoleLabel = (roleStr: string) => {
    switch (roleStr) {
      case "coach":
        return t("common:roles.coach");
      case "admin":
        return t("common:roles.admin");
      case "player":
        return t("common:roles.player");
      case "player-underage":
        return t("common:roles.youthPlayer");
      case "guardian":
        return t("common:roles.guardian");
      case "club-admin":
        return t("common:roles.clubAdmin");
      default:
        return t("common:roles.member");
    }
  };

  // Get the appropriate title based on invitation type
  const getModalTitle = () => {
    if (isRoleUpdate) return t("components:invitationModal.roleUpdate");
    if (isClubAdminInvitation)
      return t("components:invitationModal.clubAdminInvitation");
    if (isYouthInvitation)
      return t("components:invitationModal.childMemberInvitation");
    return t("components:invitationModal.groupInvitation");
  };

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
          <Text style={styles.title}>{getModalTitle()}</Text>

          {isYouthInvitation ? (
            <>
              <Text style={styles.message}>
                {t("components:invitationModal.youthInvitationMessage", {
                  inviterName,
                  youthName,
                  groupName,
                  clubName: clubName || "",
                })}
              </Text>
              <Text style={styles.question}>
                {t("components:invitationModal.wouldYouLikeToAddYouth", {
                  youthName,
                })}
              </Text>
            </>
          ) : isRoleUpdate ? (
            <>
              <Text style={styles.message}>
                {t("components:invitationModal.roleUpdateMessage", {
                  inviterName,
                  roleName: getRoleLabel(newRole),
                  groupName,
                  clubName: clubName || "",
                })}
              </Text>
              <Text style={styles.question}>
                {t("components:invitationModal.wouldYouLikeToAcceptRoleUpdate")}
              </Text>
            </>
          ) : isClubAdminInvitation ? (
            <>
              <Text style={styles.message}>
                {t("components:invitationModal.clubAdminMessage", {
                  inviterName,
                  clubName: clubName || groupName,
                })}
              </Text>
              <Text style={styles.question}>
                {t("components:invitationModal.wouldYouLikeToAcceptRole")}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.message}>
                {t("components:invitationModal.regularInvitationMessage", {
                  inviterName,
                  groupName,
                  clubName: clubName || "",
                  roleName: role ? getRoleLabel(role) : "",
                })}
              </Text>
              <Text style={styles.question}>
                {t("components:invitationModal.wouldYouLikeToJoin")}
              </Text>
            </>
          )}

          <View style={styles.buttonContainer}>
            <View style={styles.buttonWrapper}>
              <Button
                label={t("components:invitationModal.reject")}
                onPress={onReject}
                loading={loading}
                disabled={loading}
              />
            </View>
            <View style={styles.buttonWrapper}>
              <Button
                label={
                  isRoleUpdate
                    ? t("components:invitationModal.acceptRole")
                    : t("components:invitationModal.acceptAndJoin")
                }
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
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modal: {
    backgroundColor: theme.colors.primary,
    borderRadius: 20,
    padding: 30,
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
    shadowColor: "#000",
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
    fontWeight: "bold",
    color: theme.colors.secondary,
    textAlign: "center",
    marginBottom: 20,
  },
  message: {
    fontSize: 16,
    color: theme.colors.text,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 15,
  },
  question: {
    fontSize: 16,
    color: theme.colors.text,
    textAlign: "center",
    fontWeight: "500",
    marginBottom: 30,
  },
  bold: {
    fontWeight: "bold",
    color: theme.colors.secondary,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 15,
    marginTop: 10,
  },
  buttonWrapper: {
    flex: 1,
  },
});

export default InvitationModal;
