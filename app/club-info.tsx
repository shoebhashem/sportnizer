// /app/club-info.tsx — Club Info Screen
// View mode: displays logo, name, location, address, phone (read-only)
// Edit mode: toggle via header ✏️ icon — all fields become editable (club-admin only)

import { FontAwesome, Ionicons, MaterialIcons } from "@expo/vector-icons";
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

import Button from "../components/Button";
import ConfirmationModal from "../components/ConfirmationModal";
import { theme } from "../constants/theme";
import { useUser } from "../contexts/UserContext";
import { clubService } from "../services/club";
import { uploadClubLogo } from "../services/clubLogoService";
import { functions } from "../services/core/firebase";
import { ClubData } from "../services/types/club";

export default function ClubInfoScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { clubId, mode } = useLocalSearchParams<{
    clubId: string;
    mode: "view" | "edit";
  }>();
  const { userProfile } = useUser();

  // Determine if user is club-admin (can edit)
  const isClubAdmin = userProfile?.clubAccess?.some(
    (c) => c.clubId === clubId && c.role === "club-admin",
  );
  const canEdit = mode === "edit" && isClubAdmin;

  // Club data state
  const [club, setClub] = useState<ClubData | null>(null);
  const [loading, setLoading] = useState(true);

  // View / Edit mode
  const [isEditing, setIsEditing] = useState(false);

  // Editable form state
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [address, setAddress] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [description, setDescription] = useState("");

  // Logo state
  const [currentLogoUrl, setCurrentLogoUrl] = useState<string | null>(null);
  const [showLogoPicker, setShowLogoPicker] = useState(false);
  const [selectedLogoUri, setSelectedLogoUri] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // UI state
  const [saving, setSaving] = useState(false);

  // Generic alert modal state
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

  // Initialize form state from club data (defined early for use in fetchClub)
  const initFormFromClub = useCallback((clubData: ClubData) => {
    setName(clubData.name || "");
    setLocation(clubData.location || "");
    setAddress(clubData.address || "");
    setPhoneNumber(clubData.phoneNumber || "");
    setDescription(clubData.description || "");
    setCurrentLogoUrl(clubData.logoUrl || null);
  }, []);

  // Fetch club data
  const fetchClub = useCallback(async () => {
    if (!clubId) return;

    setLoading(true);
    try {
      const result = await clubService.getClub(clubId);
      if (result.success && result.data) {
        setClub(result.data);
        initFormFromClub(result.data);
      }
    } catch (error) {
      console.error("Error fetching club:", error);
      showAlert("Error", "Failed to load club information");
    } finally {
      setLoading(false);
    }
  }, [clubId, initFormFromClub]);

  useEffect(() => {
    fetchClub();
  }, [fetchClub]);

  // ----- Actions (defined before useLayoutEffect to avoid stale closures) -----
  const handleStartEdit = useCallback(() => {
    if (club) {
      initFormFromClub(club);
    }
    setIsEditing(true);
  }, [club, initFormFromClub]);

  const handleCancelEdit = useCallback(() => {
    if (club) {
      initFormFromClub(club);
    }
    setSelectedLogoUri(null);
    setIsEditing(false);
  }, [club, initFormFromClub]);

  const handleSave = useCallback(async () => {
    console.log("📝 handleSave called");
    if (!name.trim()) {
      showAlert("Validation", "Club name cannot be empty.");
      return;
    }

    if (!clubId) return;

    setSaving(true);
    try {
      const clubDataToUpdate: {
        name?: string;
        location?: string;
        address?: string;
        phoneNumber?: string;
        description?: string;
        logoUrl?: string;
      } = {};

      // Only include changed fields
      if (name.trim() !== (club?.name || "")) {
        clubDataToUpdate.name = name.trim();
      }
      if (location.trim() !== (club?.location || "")) {
        clubDataToUpdate.location = location.trim();
      }
      if (address.trim() !== (club?.address || "")) {
        clubDataToUpdate.address = address.trim();
      }
      if (phoneNumber.trim() !== (club?.phoneNumber || "")) {
        clubDataToUpdate.phoneNumber = phoneNumber.trim();
      }
      if (description.trim() !== (club?.description || "")) {
        clubDataToUpdate.description = description.trim();
      }

      // Upload logo if a new one was selected
      if (selectedLogoUri) {
        setUploadingLogo(true);
        const logoResult = await uploadClubLogo(clubId, selectedLogoUri);
        setUploadingLogo(false);

        if (logoResult.success && logoResult.logoUrl) {
          clubDataToUpdate.logoUrl = logoResult.logoUrl;
          setCurrentLogoUrl(logoResult.logoUrl);
        } else {
          showAlert(
            "Warning",
            "Logo upload failed, but other changes will be saved.",
          );
        }
      }

      console.log("📝 Changes to save:", clubDataToUpdate);

      // Update club if there are changes
      if (Object.keys(clubDataToUpdate).length > 0) {
        const updateClubFn = httpsCallable(functions, "updateClub");
        const result = await updateClubFn({
          clubId,
          clubData: clubDataToUpdate,
        });
        const response = result.data as { success: boolean; error?: string };

        if (!response.success) {
          throw new Error(response.error || "Failed to update club");
        }

        // Refresh club data
        await fetchClub();
        showAlert("Success", "Club information updated successfully!");
      } else {
        console.log("📝 No changes detected");
      }

      setSelectedLogoUri(null);
      setIsEditing(false);
    } catch (error: any) {
      console.error("Error saving club info:", error);
      showAlert("Error", error.message || "Failed to update club information.");
    } finally {
      setSaving(false);
      setUploadingLogo(false);
    }
  }, [
    name,
    location,
    address,
    phoneNumber,
    description,
    club,
    clubId,
    selectedLogoUri,
    fetchClub,
  ]);

  // ----- Header icons -----
  useLayoutEffect(() => {
    navigation.setOptions({
      title: club?.name || "Club Info",
      headerRight: () => {
        // Only show edit controls if user can edit
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
    club?.name,
    navigation,
    handleStartEdit,
    handleCancelEdit,
    handleSave,
  ]);

  // ----- Logo Picker -----
  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert(
        "Permission Required",
        "Sorry, we need camera roll permissions to upload logos.",
      );
      return false;
    }
    return true;
  };

  const pickLogoFromLibrary = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedLogoUri(result.assets[0].uri);
      setShowLogoPicker(false);
    }
  };

  const takeLogoPhoto = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      showAlert(
        "Permission Required",
        "Sorry, we need camera permissions to take photos.",
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedLogoUri(result.assets[0].uri);
      setShowLogoPicker(false);
    }
  };

  // ----- Render -----
  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color={theme.colors.secondary} />
      </View>
    );
  }

  if (!club) {
    return (
      <View style={[styles.loadingContainer, { paddingBottom: insets.bottom }]}>
        <Text style={styles.errorText}>Club not found</Text>
      </View>
    );
  }

  const displayLogoUri = selectedLogoUri || currentLogoUrl;

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
        >
          {/* ---- Logo Section ---- */}
          <View style={styles.logoSection}>
            <TouchableOpacity
              onPress={() => isEditing && setShowLogoPicker(true)}
              style={styles.logoContainer}
              activeOpacity={isEditing ? 0.8 : 1}
              disabled={!isEditing}
            >
              {displayLogoUri ? (
                <Image
                  source={{ uri: displayLogoUri }}
                  style={styles.logoImage}
                />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Ionicons
                    name="trophy"
                    size={48}
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
              <Text style={styles.tapToChangeText}>Tap to change logo</Text>
            )}
          </View>

          {/* ---- Info Section ---- */}
          <View style={styles.infoSection}>
            {/* Club Name */}
            <View style={styles.fieldRow}>
              <View style={styles.fieldIconContainer}>
                <FontAwesome
                  name="building"
                  size={16}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.fieldContent}>
                <Text style={styles.fieldLabel}>Club Name</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.fieldInput}
                    value={name}
                    onChangeText={setName}
                    placeholder="Enter club name"
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                ) : (
                  <Text style={styles.fieldValue}>{club.name}</Text>
                )}
              </View>
            </View>

            {/* Location (City/Region) */}
            <View style={styles.fieldRow}>
              <View style={styles.fieldIconContainer}>
                <Ionicons
                  name="location-outline"
                  size={18}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.fieldContent}>
                <Text style={styles.fieldLabel}>Location</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.fieldInput}
                    value={location}
                    onChangeText={setLocation}
                    placeholder="e.g., Springfield, IL"
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                ) : (
                  <Text
                    style={[
                      styles.fieldValue,
                      !club.location && styles.fieldEmpty,
                    ]}
                  >
                    {club.location || "Not set"}
                  </Text>
                )}
              </View>
            </View>

            {/* Address */}
            <View style={styles.fieldRow}>
              <View style={styles.fieldIconContainer}>
                <Ionicons
                  name="home-outline"
                  size={18}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.fieldContent}>
                <Text style={styles.fieldLabel}>Address</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.fieldInput}
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Enter full address"
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                ) : (
                  <Text
                    style={[
                      styles.fieldValue,
                      !club.address && styles.fieldEmpty,
                    ]}
                  >
                    {club.address || "Not set"}
                  </Text>
                )}
              </View>
            </View>

            {/* Phone */}
            <View style={styles.fieldRow}>
              <View style={styles.fieldIconContainer}>
                <FontAwesome
                  name="phone"
                  size={16}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.fieldContent}>
                <Text style={styles.fieldLabel}>Phone</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.fieldInput}
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    placeholder="Enter phone number"
                    placeholderTextColor={theme.colors.textSecondary}
                    keyboardType="phone-pad"
                  />
                ) : (
                  <Text
                    style={[
                      styles.fieldValue,
                      !club.phoneNumber && styles.fieldEmpty,
                    ]}
                  >
                    {club.phoneNumber || "Not set"}
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
                <Text style={styles.fieldLabel}>Description</Text>
                {isEditing ? (
                  <TextInput
                    style={[styles.fieldInput, styles.textArea]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Tell us about your club..."
                    placeholderTextColor={theme.colors.textSecondary}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                ) : (
                  <Text
                    style={[
                      styles.fieldValue,
                      !club.description && styles.fieldEmpty,
                    ]}
                  >
                    {club.description || "Not set"}
                  </Text>
                )}
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Logo Picker Modal */}
      <Modal
        visible={showLogoPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLogoPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Club Logo</Text>

            {selectedLogoUri && (
              <Image
                source={{ uri: selectedLogoUri }}
                style={styles.previewImage}
              />
            )}

            <View style={styles.modalButtons}>
              <Button
                label="📷 Take Photo"
                theme="secondary"
                onPress={takeLogoPhoto}
              />
              <View style={{ height: 12 }} />
              <Button
                label="🖼️ Choose from Library"
                theme="secondary"
                onPress={pickLogoFromLibrary}
              />
              <View style={{ height: 12 }} />
              <Button
                label="Cancel"
                theme="secondary"
                onPress={() => setShowLogoPicker(false)}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Alert Modal */}
      <ConfirmationModal
        visible={alertModal.visible}
        title={alertModal.title}
        message={alertModal.message}
        confirmText="OK"
        onConfirm={hideAlert}
        onCancel={hideAlert}
      />

      {/* Uploading Logo Overlay */}
      {uploadingLogo && (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.uploadingText}>Uploading logo...</Text>
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
  // ---- Logo ----
  logoSection: {
    alignItems: "center",
    marginBottom: 28,
  },
  logoContainer: {
    position: "relative",
    marginBottom: 8,
  },
  logoImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: theme.colors.secondary,
  },
  logoPlaceholder: {
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
