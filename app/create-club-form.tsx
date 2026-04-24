import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import { COUNTRIES } from "@/constants/countries";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useUser } from "@/contexts/UserContext";
import { functions } from "@/services/core/firebase";
import { router } from "expo-router";
import { httpsCallable } from "firebase/functions";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Linking,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function CreateClubForm() {
  const { t } = useTranslation(["screens", "common"]);
  const { user } = useAuth();
  const { userProfile } = useUser();

  // Check if user is already a club-admin (limit: 1 club as admin)
  const isAlreadyClubAdmin = useMemo(
    () =>
      userProfile?.clubAccess?.some(
        (ca) => ca.role === "club-admin" && ca.isActive !== false,
      ) ?? false,
    [userProfile],
  );

  const [clubName, setClubName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("SE");
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({
    visible: false,
    title: "",
    message: "",
    type: "error" as "error" | "success" | "info",
  });

  const handleCreateClub = async () => {
    // Validation
    if (!clubName.trim()) {
      setModal({
        visible: true,
        title: t("common:validation.missingInformation"),
        message: t("screens:createClubForm.errors.clubNameRequired"),
        type: "error",
      });
      return;
    }

    if (!user) {
      setModal({
        visible: true,
        title: t("common:permissionRequired"),
        message: t("common:signingIn"),
        type: "error",
      });
      return;
    }

    setLoading(true);

    try {
      // Step 1: Create club
      console.log("📝 Creating club...");
      const createClubFn = httpsCallable(functions, "createClub");
      const createClubResult = await createClubFn({
        clubData: {
          name: clubName.trim(),
          description: description.trim(),
          location: location.trim(),
          country,
        },
      });

      const response = createClubResult.data as {
        success: boolean;
        clubId?: string;
        error?: string;
      };

      if (!response.success || !response.clubId) {
        throw new Error(response.error || "Failed to create club");
      }

      const clubId = response.clubId;
      console.log(`✅ Club created: ${clubId}`);

      // Step 2: Update user document (add to clubAccess[])
      console.log("📝 Updating user document...");
      const updateUserClubInfoFn = httpsCallable(
        functions,
        "updateUserClubInfo",
      );
      const userUpdateResult = await updateUserClubInfoFn({
        uid: user.uid,
        clubInfo: {
          clubId,
          clubName: clubName.trim(),
          role: "club-admin",
          joinedAt: new Date(),
          lastModifiedAt: new Date(),
        },
        role: "club-admin",
      });

      const userResponse = userUpdateResult.data as {
        success: boolean;
        error?: string;
      };
      if (!userResponse.success) {
        console.warn("⚠️ Failed to update user document:", userResponse.error);
      } else {
        console.log("✅ User document updated");
      }

      // Step 3: Add to club member list
      console.log("📝 Adding to club member list...");

      // Use userProfile if available, otherwise fall back to Firebase Auth user
      const displayName =
        userProfile?.displayName ||
        user.displayName ||
        user.email?.split("@")[0] ||
        "User";
      const photoURL = userProfile?.photoURL || user.photoURL || "";

      const addMemberToClubFn = httpsCallable(functions, "addMemberToClub");
      const memberResult = await addMemberToClubFn({
        clubId,
        memberData: {
          userId: user.uid,
          roles: ["club-admin"],
          name: displayName,
          email: user.email || "",
          photoURL: photoURL,
          addedBy: user.uid,
          joinedAt: new Date(),
          lastModifiedAt: new Date(),
          needsGuardian: false,
          guardiansContacts: [],
        },
      });

      const memberResponse = memberResult.data as {
        success: boolean;
        error?: string;
      };
      if (!memberResponse.success) {
        console.warn(
          "⚠️ Failed to add to club member list:",
          memberResponse.error,
        );
      } else {
        console.log("✅ Added to club member list");
      }

      // User doc listener in UserContext will pick up the new club automatically

      // Success!
      setModal({
        visible: true,
        title: t("screens:createClubForm.clubCreated"),
        message: t("screens:createClubForm.clubCreatedMessage", { clubName }),
        type: "success",
      });

      // Navigate to home after modal closes
      setTimeout(() => {
        router.replace("/(tabs)");
      }, 2000);
    } catch (error: any) {
      console.error("❌ Error creating club:", error);

      // Handle resource limit errors specifically
      if (error.code === "functions/resource-exhausted") {
        setModal({
          visible: true,
          title: t("screens:createClubForm.errors.clubLimitReached"),
          message:
            error.message ||
            t("screens:createClubForm.errors.clubLimitReachedMessage"),
          type: "error",
        });
      } else {
        setModal({
          visible: true,
          title: t("common:error"),
          message:
            error.message || t("screens:createClubForm.errors.createFailed"),
          type: "error",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {t("screens:createClubForm.createYourClub")}
          </Text>
          <Text style={styles.subtitle}>
            {t("screens:createClubForm.subtitle")}
          </Text>
        </View>

        {/* Guard: user is already a club-admin */}
        {isAlreadyClubAdmin ? (
          <View style={styles.form}>
            <View style={styles.limitReachedContainer}>
              <Text style={styles.limitReachedTitle}>
                {t("screens:createClubForm.errors.clubLimitReached")}
              </Text>
              <Text style={styles.limitReachedMessage}>
                {t("screens:createClubForm.errors.clubLimitReachedMessage")}
              </Text>
              <TouchableOpacity
                style={styles.contactSupportButton}
                onPress={() => Linking.openURL("mailto:support@clubnizer.com")}
              >
                <Text style={styles.contactSupportText}>
                  support@clubnizer.com
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.buttonContainer}>
              <Button
                label={t("common:goBack")}
                theme="secondary"
                onPress={() => router.back()}
              />
            </View>
          </View>
        ) : (
          <View style={styles.form}>
            {/* Club Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {t("screens:createClubForm.clubName")}{" "}
                <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder={t("screens:createClubForm.clubNamePlaceholder")}
                placeholderTextColor={theme.colors.textSecondary}
                value={clubName}
                onChangeText={setClubName}
                autoCapitalize="words"
                editable={!loading}
              />
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {t("screens:createClubForm.clubDescription")}
              </Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder={t(
                  "screens:createClubForm.clubDescriptionPlaceholder",
                )}
                placeholderTextColor={theme.colors.textSecondary}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!loading}
              />
            </View>

            {/* Location */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t("common:location")}</Text>
              <TextInput
                style={styles.input}
                placeholder={t("screens:clubInfo.locationPlaceholder")}
                placeholderTextColor={theme.colors.textSecondary}
                value={location}
                onChangeText={setLocation}
                autoCapitalize="words"
                editable={!loading}
              />
            </View>

            {/* Country - Required */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {t("screens:createClubForm.country")}{" "}
                <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => {
                  setCountrySearch("");
                  setShowCountryModal(true);
                }}
                disabled={loading}
              >
                <Text style={styles.pickerButtonText}>
                  {COUNTRIES.find((c) => c.code === country)?.name ?? country}
                </Text>
                <Text style={styles.pickerButtonArrow}>▼</Text>
              </TouchableOpacity>
            </View>

            {/* Create Button */}
            <View style={styles.buttonContainer}>
              {loading ? (
                <ActivityIndicator
                  size="large"
                  color={theme.colors.secondary}
                />
              ) : (
                <Button
                  label={t("screens:createClubForm.createClub")}
                  theme="primary"
                  onPress={handleCreateClub}
                />
              )}
            </View>

            {/* Skip Option */}
            <TouchableOpacity
              style={styles.skipContainer}
              onPress={() => router.replace("/(tabs)")}
              disabled={loading}
            >
              <Text style={styles.skipText}>
                {t("screens:createClubForm.skipForNow")}
              </Text>
              <Text style={styles.skipSubtext}>
                {t("screens:createClubForm.skipSubtext")}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <ConfirmationModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        onConfirm={() => {
          setModal({ ...modal, visible: false });
          if (modal.type === "success") {
            router.replace("/(tabs)");
          } else if (
            modal.type === "error" &&
            modal.title === "Authentication Required"
          ) {
            // Redirect to login if authentication is required
            router.replace("/login");
          }
        }}
        onCancel={() => setModal({ ...modal, visible: false })}
        confirmText="OK"
      />

      {/* Country picker modal */}
      <Modal
        visible={showCountryModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCountryModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowCountryModal(false)}
        >
          <Pressable style={styles.modalContainer} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {t("screens:createClubForm.selectCountry")}
            </Text>
            <TextInput
              style={styles.modalSearch}
              placeholder={t("common:search")}
              placeholderTextColor={theme.colors.textSecondary}
              value={countrySearch}
              onChangeText={setCountrySearch}
              autoCapitalize="none"
            />
            <ScrollView style={styles.modalList}>
              {COUNTRIES.filter((c) =>
                c.name.toLowerCase().includes(countrySearch.toLowerCase()),
              ).map((c) => (
                <TouchableOpacity
                  key={c.code}
                  style={[
                    styles.modalItem,
                    c.code === country && styles.modalItemSelected,
                  ]}
                  onPress={() => {
                    setCountry(c.code);
                    setShowCountryModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      c.code === country && styles.modalItemTextSelected,
                    ]}
                  >
                    {c.name}
                  </Text>
                  <Text style={styles.modalItemCurrency}>{c.currency}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
    marginBottom: theme.spacing.xl,
    alignItems: "center",
  },
  title: {
    fontSize: theme.typography.fontSize.xxlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.secondary,
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
  inputGroup: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  required: {
    color: theme.colors.error,
  },
  input: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border || "#333",
  },
  textArea: {
    minHeight: 100,
    paddingTop: theme.spacing.md,
  },
  buttonContainer: {
    marginTop: theme.spacing.xl,
  },
  skipContainer: {
    marginTop: theme.spacing.xl,
    alignItems: "center",
    paddingVertical: theme.spacing.md,
  },
  skipText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textDecorationLine: "underline",
  },
  skipSubtext: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  limitReachedContainer: {
    alignItems: "center",
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
  },
  limitReachedTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.warning || theme.colors.secondary,
    marginBottom: theme.spacing.md,
    textAlign: "center",
  },
  limitReachedMessage: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: theme.spacing.lg,
  },
  contactSupportButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  contactSupportText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
    textDecorationLine: "underline",
  },
  pickerButton: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border || "#333",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pickerButtonText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  pickerButtonArrow: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.borderRadius.large,
    borderTopRightRadius: theme.borderRadius.large,
    padding: theme.spacing.lg,
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    textAlign: "center",
  },
  modalSearch: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.sm,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border || "#ddd",
    marginBottom: theme.spacing.sm,
  },
  modalList: {
    flexGrow: 0,
  },
  modalItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.small,
  },
  modalItemSelected: {
    backgroundColor: theme.colors.secondary + "22",
  },
  modalItemText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  modalItemTextSelected: {
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  modalItemCurrency: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
});
