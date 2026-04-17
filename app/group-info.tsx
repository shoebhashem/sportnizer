// /app/group-info.tsx — Group Info Screen
// View mode: displays name, sport type, description (read-only for all users)
// Edit mode: toggle via header ✏️ icon — fields become editable (club-admin or group admin only)

import { FontAwesome5, Ionicons, MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { httpsCallable } from "firebase/functions";
import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useState,
} from "react";
import {
    ActivityIndicator,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "react-i18next";
import Button from "../components/Button";
import ConfirmationModal from "../components/ConfirmationModal";
import { theme } from "../constants/theme";
import { useGroupData } from "../contexts/GroupDataContext";
import { useUser } from "../contexts/UserContext";
import { functions } from "../services/core/firebase";
import { uploadGroupPicture } from "../services/groupPictureService";
import { GroupData } from "../services/types/group";
import { canManageGroup } from "../utils/permissionHelpers";

export default function GroupInfoScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation(["screens", "common"]);
  const navigation = useNavigation();
  const { clubId, groupId, mode } = useLocalSearchParams<{
    clubId: string;
    groupId: string;
    mode: "view" | "edit";
  }>();
  const { userProfile } = useUser();
  const { getGroup: getGroupFromContext } = useGroupData();

  // Get live group data from context
  const contextGroup = getGroupFromContext(clubId!, groupId!);

  // Determine if user can edit: club-admin OR group admin/coach
  const canEdit = React.useMemo(() => {
    if (mode !== "edit" || !userProfile) return false;
    return canManageGroup(userProfile, clubId!, groupId!);
  }, [mode, userProfile, clubId, groupId]);

  // Group data state
  const [group, setGroup] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);

  // View / Edit mode
  const [isEditing, setIsEditing] = useState(false);

  // Editable form state
  const [name, setName] = useState("");
  const [sport, setSport] = useState("");
  const [description, setDescription] = useState("");

  // Picture state
  const [currentPictureUrl, setCurrentPictureUrl] = useState<string | null>(
    null,
  );
  const [showPicturePicker, setShowPicturePicker] = useState(false);
  const [selectedPictureUri, setSelectedPictureUri] = useState<string | null>(
    null,
  );
  const [uploadingPicture, setUploadingPicture] = useState(false);

  // UI state
  const [saving, setSaving] = useState(false);

  // Alert modal state
  const [alertModal, setAlertModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({ visible: false, title: "", message: "" });

  const showAlert = (title: string, message: string, onConfirm?: () => void) =>
    setAlertModal({ visible: true, title, message, onConfirm });
  const hideAlert = () => {
    alertModal.onConfirm?.();
    setAlertModal({ visible: false, title: "", message: "" });
  };

  // Initialize form state from group data
  const initFormFromGroup = useCallback((groupData: GroupData) => {
    setName(groupData.name || "");
    setSport(groupData.sport || "");
    setDescription(groupData.description || "");
    setCurrentPictureUrl(groupData.pictureUrl || null);
  }, []);

  // Fetch group data from context (real-time)
  const fetchGroup = useCallback(async () => {
    if (!clubId || !groupId) return;

    setLoading(true);
    try {
      if (contextGroup) {
        setGroup(contextGroup);
        initFormFromGroup(contextGroup);
      } else {
        showAlert(
          t("common:error"),
          t("screens:groupInfo.failedToLoadGroupInfo"),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [clubId, groupId, contextGroup, initFormFromGroup]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  // Sync context changes to local state when not editing
  useEffect(() => {
    if (contextGroup && !isEditing) {
      setGroup(contextGroup);
      initFormFromGroup(contextGroup);
    }
  }, [contextGroup, isEditing, initFormFromGroup]);

  // ----- Actions -----
  const handleStartEdit = useCallback(() => {
    if (group) {
      initFormFromGroup(group);
    }
    setIsEditing(true);
  }, [group, initFormFromGroup]);

  const handleCancelEdit = useCallback(() => {
    if (group) {
      initFormFromGroup(group);
    }
    setSelectedPictureUri(null);
    setIsEditing(false);
  }, [group, initFormFromGroup]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      showAlert(
        t("common:validation.validationError"),
        t("screens:groupInfo.groupNameEmpty"),
      );
      return;
    }

    if (!clubId || !groupId) return;

    setSaving(true);
    try {
      const groupDataToUpdate: {
        name?: string;
        sport?: string;
        description?: string;
      } = {};

      // Only include changed fields
      if (name.trim() !== (group?.name || "")) {
        groupDataToUpdate.name = name.trim();
      }
      if (sport.trim() !== (group?.sport || "")) {
        groupDataToUpdate.sport = sport.trim();
      }
      if (description.trim() !== (group?.description || "")) {
        groupDataToUpdate.description = description.trim();
      }

      // Upload picture if a new one was selected
      if (selectedPictureUri) {
        setUploadingPicture(true);
        const pictureResult = await uploadGroupPicture(
          clubId!,
          groupId!,
          selectedPictureUri,
        );
        setUploadingPicture(false);

        if (pictureResult.success && pictureResult.pictureUrl) {
          setCurrentPictureUrl(pictureResult.pictureUrl);
        } else {
          showAlert(
            t("common:warning"),
            t("screens:groupInfo.pictureUploadWarning"),
          );
        }
      }

      if (Object.keys(groupDataToUpdate).length > 0) {
        const updateGroupFn = httpsCallable(functions, "updateGroup");
        const result = await updateGroupFn({
          clubId,
          groupId,
          groupData: groupDataToUpdate,
        });
        const response = result.data as { success: boolean; error?: string };

        if (!response.success) {
          throw new Error(response.error || "Failed to update group");
        }

        // Context will auto-refresh via onSnapshot
        showAlert(t("common:success"), t("screens:groupInfo.groupInfoUpdated"));
      }

      setSelectedPictureUri(null);
      setIsEditing(false);
    } catch (error: any) {
      console.error("Error saving group info:", error);
      showAlert(
        t("common:error"),
        error.message || t("screens:groupInfo.failedToUpdateGroupInfo"),
      );
    } finally {
      setSaving(false);
      setUploadingPicture(false);
    }
  }, [
    name,
    sport,
    description,
    group,
    clubId,
    groupId,
    selectedPictureUri,
    fetchGroup,
  ]);

  // ----- Header icons -----
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => {
        if (!canEdit) return null;

        return isEditing ? (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity
              onPress={handleCancelEdit}
              style={{ marginRight: 12, padding: 8 }}
            >
              <Ionicons
                name="close-outline"
                size={26}
                color={theme.colors.white}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={{ marginRight: 8, padding: 8 }}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <Ionicons
                  name="checkmark-outline"
                  size={26}
                  color={theme.colors.secondary}
                />
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleStartEdit}
            style={{ marginRight: 8, padding: 8 }}
          >
            <Ionicons
              name="create-outline"
              size={24}
              color={theme.colors.white}
            />
          </TouchableOpacity>
        );
      },
    });
  }, [
    isEditing,
    saving,
    canEdit,
    group?.name,
    navigation,
    handleStartEdit,
    handleCancelEdit,
    handleSave,
  ]);

  // ----- Render -----
  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color={theme.colors.secondary} />
      </View>
    );
  }

  if (!group) {
    return (
      <View style={[styles.loadingContainer, { paddingBottom: insets.bottom }]}>
        <Text style={styles.errorText}>
          {t("screens:groupInfo.groupNotFound")}
        </Text>
      </View>
    );
  }

  const displayPictureUri = selectedPictureUri || currentPictureUrl;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ---- Group Picture Section ---- */}
          <View style={styles.pictureSection}>
            <TouchableOpacity
              onPress={() => isEditing && setShowPicturePicker(true)}
              style={styles.pictureContainer}
              activeOpacity={isEditing ? 0.8 : 1}
              disabled={!isEditing}
            >
              {displayPictureUri ? (
                <Image
                  source={{ uri: displayPictureUri }}
                  style={styles.pictureImage}
                />
              ) : (
                <View style={styles.picturePlaceholder}>
                  <FontAwesome5
                    name="users"
                    size={40}
                    color={theme.colors.secondary}
                  />
                </View>
              )}
              {isEditing && (
                <View style={styles.cameraIconBadge}>
                  <MaterialIcons
                    name="photo-camera"
                    size={18}
                    color={theme.colors.white}
                  />
                </View>
              )}
            </TouchableOpacity>
            {isEditing && (
              <Text style={styles.tapToChangeText}>
                {t("screens:groupInfo.tapToChangePicture")}
              </Text>
            )}
          </View>

          {/* ---- Info Section ---- */}
          <View style={styles.infoSection}>
            {/* Group Name */}
            <View style={styles.fieldRow}>
              <View style={styles.fieldIconContainer}>
                <Ionicons
                  name="people-outline"
                  size={18}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.fieldContent}>
                <Text style={styles.fieldLabel}>
                  {t("screens:groupInfo.groupName")}
                </Text>
                {isEditing ? (
                  <TextInput
                    style={styles.fieldInput}
                    value={name}
                    onChangeText={setName}
                    placeholder={t("screens:groupInfo.groupNamePlaceholder")}
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                ) : (
                  <Text style={styles.fieldValue}>{group.name}</Text>
                )}
              </View>
            </View>

            {/* Sport Type */}
            <View style={styles.fieldRow}>
              <View style={styles.fieldIconContainer}>
                <FontAwesome5
                  name="running"
                  size={16}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.fieldContent}>
                <Text style={styles.fieldLabel}>
                  {t("screens:groupInfo.sportType")}
                </Text>
                {isEditing ? (
                  <TextInput
                    style={styles.fieldInput}
                    value={sport}
                    onChangeText={setSport}
                    placeholder={t("screens:groupInfo.sportTypePlaceholder")}
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                ) : (
                  <Text
                    style={[
                      styles.fieldValue,
                      !group.sport && styles.fieldEmpty,
                    ]}
                  >
                    {group.sport || t("common:notSet")}
                  </Text>
                )}
              </View>
            </View>

            {/* Description */}
            <View style={[styles.fieldRow, styles.fieldRowMultiline]}>
              <View style={styles.fieldIconContainer}>
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.fieldContent}>
                <Text style={styles.fieldLabel}>
                  {t("screens:groupInfo.description")}
                </Text>
                {isEditing ? (
                  <TextInput
                    style={[styles.fieldInput, styles.textArea]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder={t("screens:groupInfo.descriptionPlaceholder")}
                    placeholderTextColor={theme.colors.textSecondary}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                ) : (
                  <Text
                    style={[
                      styles.fieldValue,
                      !group.description && styles.fieldEmpty,
                    ]}
                  >
                    {group.description || t("common:notSet")}
                  </Text>
                )}
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Alert Modal */}
      <ConfirmationModal
        visible={alertModal.visible}
        title={alertModal.title}
        message={alertModal.message}
        confirmText="OK"
        onConfirm={hideAlert}
        onCancel={hideAlert}
      />

      {/* Picture Picker Modal */}
      <Modal
        visible={showPicturePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPicturePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {t("screens:groupInfo.changeGroupPicture")}
            </Text>

            {selectedPictureUri && (
              <Image
                source={{ uri: selectedPictureUri }}
                style={styles.previewImage}
              />
            )}

            <View style={styles.modalButtons}>
              <Button
                label={t("screens:groupInfo.takePhoto")}
                theme="secondary"
                onPress={async () => {
                  const { status: libStatus } =
                    await ImagePicker.requestMediaLibraryPermissionsAsync();
                  if (libStatus !== "granted") {
                    showAlert(
                      t("common:permissionRequired"),
                      t("common:cameraRollPermission"),
                    );
                    return;
                  }
                  const { status: camStatus } =
                    await ImagePicker.requestCameraPermissionsAsync();
                  if (camStatus !== "granted") {
                    showAlert(
                      t("common:permissionRequired"),
                      t("common:cameraPermission"),
                    );
                    return;
                  }
                  const result = await ImagePicker.launchCameraAsync({
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.8,
                  });
                  if (!result.canceled && result.assets[0]) {
                    setSelectedPictureUri(result.assets[0].uri);
                    setShowPicturePicker(false);
                  }
                }}
              />
              <View style={{ height: 12 }} />
              <Button
                label={t("screens:groupInfo.chooseFromLibrary")}
                theme="secondary"
                onPress={async () => {
                  const { status } =
                    await ImagePicker.requestMediaLibraryPermissionsAsync();
                  if (status !== "granted") {
                    showAlert(
                      t("common:permissionRequired"),
                      t("common:cameraRollPermission"),
                    );
                    return;
                  }
                  const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.8,
                  });
                  if (!result.canceled && result.assets[0]) {
                    setSelectedPictureUri(result.assets[0].uri);
                    setShowPicturePicker(false);
                  }
                }}
              />
              <View style={{ height: 12 }} />
              <Button
                label={t("common:cancel")}
                theme="secondary"
                onPress={() => setShowPicturePicker(false)}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Uploading Picture Overlay */}
      {uploadingPicture && (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.uploadingText}>
            {t("screens:groupInfo.uploadingPicture")}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  // ---- Picture Section ----
  pictureSection: {
    alignItems: "center",
    marginBottom: 28,
  },
  pictureContainer: {
    position: "relative",
    marginBottom: 8,
  },
  pictureImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: theme.colors.secondary,
  },
  picturePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: theme.colors.inputBorder,
  },
  cameraIconBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    backgroundColor: theme.colors.secondary,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  tapToChangeText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  // ---- Info Fields ----
  infoSection: {
    marginBottom: 24,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    overflow: "hidden",
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  fieldRowMultiline: {
    alignItems: "flex-start",
  },
  fieldIconContainer: {
    width: 28,
    alignItems: "center",
  },
  fieldContent: {
    flex: 1,
    marginLeft: 12,
  },
  fieldLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldValue: {
    fontSize: 16,
    color: theme.colors.text,
  },
  fieldEmpty: {
    color: theme.colors.textSecondary,
    fontStyle: "italic",
  },
  fieldInput: {
    fontSize: 16,
    color: theme.colors.text,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.secondary,
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: "top",
    paddingTop: 4,
  },
  // ---- Modal ----
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: theme.colors.primary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: 20,
  },
  modalButtons: {
    marginTop: 8,
  },
  previewImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignSelf: "center",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: theme.colors.secondary,
  },
  // ---- Uploading Overlay ----
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  uploadingText: {
    marginTop: 16,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
});
