import { router, useLocalSearchParams } from "expo-router";
import { httpsCallable } from "firebase/functions";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "../components/Button";
import ConfirmationModal from "../components/ConfirmationModal";
import { theme } from "../constants/theme";
import { functions } from "../services/core/firebase";
import { memberService } from "../services/member";

export default function AddMembersScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const { groupId, groupName, inviterName, ageGroup } = useLocalSearchParams<{
    groupId: string;
    groupName: string;
    inviterName: string;
    ageGroup: string;
  }>();

  const [email, setEmail] = useState("");
  const [childName, setChildName] = useState("");
  const [childBirthDate, setChildBirthDate] = useState("");
  const [loading, setLoading] = useState(false);

  // Parse ageGroup to number
  const parsedAgeGroup = ageGroup ? parseInt(ageGroup) : 2;

  // Modal states for web-compatible feedback
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState("");

  const decodedGroupName = groupName ? decodeURIComponent(groupName) : "";
  const decodedInviterName = inviterName ? decodeURIComponent(inviterName) : "";

  // Log parameters for debugging
  console.log("AddMembersScreen params:", {
    groupId,
    groupName,
    inviterName,
    decodedGroupName,
    decodedInviterName,
  });

  // Early return if essential parameters are missing
  if (!groupId || !decodedGroupName || !decodedInviterName) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {t("screens:addMembers.missingRequiredInfo")}
          </Text>
          <Button
            label={t("common:goBack")}
            onPress={() => router.back()}
            theme="secondary"
          />
        </View>
      </SafeAreaView>
    );
  }

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Handle adding child for ageGroup 1
  const handleAddChild = async () => {
    if (!childName.trim()) {
      setModalMessage(t("screens:addMembers.pleaseEnterChildName"));
      setErrorModalVisible(true);
      return;
    }

    if (!groupId) {
      setModalMessage(t("screens:addMembers.groupIdMissing"));
      setErrorModalVisible(true);
      return;
    }

    setLoading(true);

    try {
      const result = await memberService.addUnconfirmedChild(
        groupId as string,
        {
          name: childName.trim(),
          birthDate: childBirthDate.trim() || undefined,
        },
      );

      if (result.success) {
        setModalMessage(
          t("screens:addMembers.childAddedMessage", {
            childName: childName.trim(),
            groupName: decodedGroupName,
          }),
        );
        setSuccessModalVisible(true);
      } else {
        const error = result.error;
        let errorMessage = t("screens:addMembers.failedToAddChild");

        if (typeof error === "string") {
          errorMessage = error;
        }

        setModalMessage(errorMessage);
        setErrorModalVisible(true);
      }
    } catch (error: any) {
      console.error("Error adding child:", error);
      setModalMessage(t("screens:addMembers.failedToAddChild"));
      setErrorModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvitation = async () => {
    if (!email.trim()) {
      setModalMessage(t("screens:addMembers.pleaseEnterEmail"));
      setErrorModalVisible(true);
      return;
    }

    if (!validateEmail(email.trim())) {
      setModalMessage(t("screens:addMembers.pleaseEnterValidEmail"));
      setErrorModalVisible(true);
      return;
    }

    if (!groupId) {
      setModalMessage(t("screens:addMembers.groupIdMissing"));
      setErrorModalVisible(true);
      return;
    }

    if (!decodedGroupName) {
      setModalMessage(t("screens:addMembers.groupNameMissing"));
      setErrorModalVisible(true);
      return;
    }

    if (!decodedInviterName) {
      setModalMessage(t("screens:addMembers.inviterNameMissing"));
      setErrorModalVisible(true);
      return;
    }

    setLoading(true);

    try {
      console.log("Sending invitation with data:", {
        emails: [email.trim().toLowerCase()],
        groupId: groupId,
        groupName: decodedGroupName,
        inviterName: decodedInviterName,
      });

      const sendInvitation = httpsCallable(functions, "sendGroupInvitation");

      // Test if the data is being sent correctly
      const payload = {
        emails: [email.trim().toLowerCase()],
        groupId: groupId,
        groupName: decodedGroupName,
        inviterName: decodedInviterName,
      };

      console.log("Payload being sent:", payload);

      const result = await sendInvitation(payload);

      console.log("Invitation result:", result);

      setModalMessage(
        t("screens:addMembers.invitationSentMessage", {
          email: email.trim(),
          groupName: decodedGroupName,
        }),
      );
      setSuccessModalVisible(true);
    } catch (error: any) {
      console.error("Error sending invitation:", error);
      console.error("Error details:", {
        code: error.code,
        message: error.message,
        details: error.details,
      });

      let errorMessage = t("screens:addMembers.failedToSendInvitation");

      if (error.code === "functions/invalid-argument") {
        errorMessage = t("screens:addMembers.invalidData", {
          message: error.message,
        });
      } else if (error.code === "functions/unauthenticated") {
        errorMessage = t("screens:addMembers.errors.unauthenticated");
      } else if (error.code === "functions/already-exists") {
        errorMessage = t("screens:addMembers.errors.alreadyExists");
      } else if (error.code === "functions/already-invited") {
        errorMessage = t("screens:addMembers.errors.alreadyInvited");
      } else if (error.message) {
        errorMessage = error.message;
      }

      setModalMessage(errorMessage);
      setErrorModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  const handleSuccessModalConfirm = (action: "another" | "done") => {
    setSuccessModalVisible(false);
    if (action === "another") {
      if (parsedAgeGroup === 1) {
        setChildName("");
        setChildBirthDate("");
      } else {
        setEmail("");
      }
    } else {
      router.back();
    }
  };

  const handleErrorModalClose = () => {
    setErrorModalVisible(false);
    setModalMessage("");
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>
              {parsedAgeGroup === 1
                ? t("screens:addMembers.addChild")
                : t("screens:addMembers.inviteTeamMember")}
            </Text>
            <Text style={styles.subtitle}>
              {parsedAgeGroup === 1
                ? `Add a child to "${decodedGroupName}". The child will be added as unconfirmed until guardians confirm participation.`
                : `Send an email invitation to add a new member to "${decodedGroupName}"`}
            </Text>
          </View>

          <View style={styles.form}>
            {parsedAgeGroup === 1 ? (
              // ageGroup 1: Child addition form
              <>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>
                    {t("screens:addMembers.childName")}
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t("screens:addMembers.childNamePlaceholder")}
                    value={childName}
                    onChangeText={setChildName}
                    autoCapitalize="words"
                    autoCorrect={false}
                    placeholderTextColor="#A0A0A0"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>
                    {t("screens:addMembers.birthDateOptional")}
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t("screens:addMembers.birthDatePlaceholder")}
                    value={childBirthDate}
                    onChangeText={setChildBirthDate}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor="#A0A0A0"
                  />
                </View>

                <View style={styles.buttonContainer}>
                  <Button
                    label={t("screens:addMembers.addChildButton")}
                    onPress={handleAddChild}
                    theme="primary"
                    loading={loading}
                    disabled={loading || !childName.trim()}
                  />

                  <Button
                    label={t("common:cancel")}
                    onPress={handleCancel}
                    theme="secondary"
                    disabled={loading}
                  />
                </View>
              </>
            ) : (
              // ageGroup 2: Email invitation form
              <>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>
                    {t("screens:addMembers.emailAddress")}
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t("screens:addMembers.emailPlaceholder")}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor="#A0A0A0"
                  />
                </View>

                <View style={styles.buttonContainer}>
                  <Button
                    label={t("screens:addMembers.sendInvitation")}
                    onPress={handleSendInvitation}
                    theme="primary"
                    loading={loading}
                    disabled={loading || !email.trim()}
                  />

                  <Button
                    label={t("common:cancel")}
                    onPress={handleCancel}
                    theme="secondary"
                    disabled={loading}
                  />
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Success Modal - Web Compatible */}
      <ConfirmationModal
        visible={successModalVisible}
        title={
          parsedAgeGroup === 1
            ? t("screens:addMembers.childAddedSuccess")
            : t("screens:addMembers.invitationSentSuccess")
        }
        message={modalMessage}
        confirmText={
          parsedAgeGroup === 1
            ? t("screens:addMembers.addAnother")
            : t("screens:addMembers.sendAnother")
        }
        cancelText={t("common:done")}
        onConfirm={() => handleSuccessModalConfirm("another")}
        onCancel={() => handleSuccessModalConfirm("done")}
        confirmButtonTheme="primary"
      />

      {/* Error Modal - Web Compatible */}
      <ConfirmationModal
        visible={errorModalVisible}
        title={t("common:error")}
        message={modalMessage}
        confirmText={t("common:ok")}
        cancelText=""
        onConfirm={handleErrorModalClose}
        onCancel={handleErrorModalClose}
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: theme.layout.containerPadding,
  },
  header: {
    alignItems: "center",
    marginBottom: theme.spacing.xxl,
  },
  title: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  form: {
    width: "100%",
  },
  inputContainer: {
    marginBottom: theme.spacing.lg,
  },
  inputLabel: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
  input: {
    backgroundColor: theme.colors.inputBackground,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderRadius: theme.borderRadius.medium,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  buttonContainer: {
    marginTop: theme.spacing.lg,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  errorText: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.error,
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  },
});
