import { FontAwesome } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { theme } from "../constants/theme";
import {
  uploadOwnProfilePicture,
  uploadProfilePictureForMember,
} from "../services/profilePictureService";
import Button from "./Button";
import ConfirmationModal from "./ConfirmationModal";

interface ProfilePictureUploadProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (newImageUrl: string) => void;
  currentImageUrl?: string;
  // For self-upload
  userId?: string;
  // For admin/coach uploading for a member
  targetUserId?: string;
  clubId?: string;
  groupId?: string;
  isForMember?: boolean;
}

export default function ProfilePictureUpload({
  visible,
  onClose,
  onSuccess,
  currentImageUrl,
  userId,
  targetUserId,
  clubId,
  groupId,
  isForMember = false,
}: ProfilePictureUploadProps) {
  const { t } = useTranslation(["components", "common"]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Cross-platform alert modal state (replaces Alert.alert)
  const [alertModal, setAlertModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: "", message: "" });

  const showAlert = (title: string, message: string) =>
    setAlertModal({ visible: true, title, message });
  const hideAlert = () =>
    setAlertModal({ visible: false, title: "", message: "" });

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert(
        t("components:profilePictureUpload.permissionRequired"),
        t("components:profilePictureUpload.galleryPermissionMessage"),
      );
      return false;
    }
    return true;
  };

  const pickImage = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1], // Square aspect ratio
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      showAlert(
        t("components:profilePictureUpload.permissionRequired"),
        t("components:profilePictureUpload.cameraPermissionMessage"),
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1], // Square aspect ratio
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const uploadImage = async () => {
    if (!selectedImage) return;

    setUploading(true);
    try {
      let result;

      if (isForMember && targetUserId && clubId && groupId) {
        // Admin/coach uploading for a member
        result = await uploadProfilePictureForMember(
          targetUserId,
          clubId,
          groupId,
          selectedImage,
        );
      } else if (userId) {
        // Self-upload
        result = await uploadOwnProfilePicture(userId, selectedImage);
      } else {
        showAlert(
          t("components:profilePictureUpload.uploadFailed"),
          t("components:profilePictureUpload.missingUserInfo"),
        );
        return;
      }

      if (result.success && result.photoURL) {
        onSuccess(result.photoURL);
        setSelectedImage(null);
        onClose();
      } else {
        showAlert(
          t("components:profilePictureUpload.uploadFailed"),
          result.error ||
            t("components:profilePictureUpload.failedToUploadProfilePicture"),
        );
      }
    } catch (error) {
      console.error("Upload error:", error);
      showAlert(
        t("components:profilePictureUpload.uploadFailed"),
        t("components:profilePictureUpload.unexpectedError"),
      );
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedImage(null);
    onClose();
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {isForMember
                ? t("components:profilePictureUpload.uploadMemberPhoto")
                : t("components:profilePictureUpload.uploadProfilePicture")}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <FontAwesome
                name="times"
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Current or Selected Image Preview */}
          <View style={styles.imagePreview}>
            <Image
              source={{
                uri:
                  selectedImage ||
                  currentImageUrl ||
                  "https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fadult_profile_icon.png?alt=media",
              }}
            />
            {selectedImage && (
              <View style={styles.selectedImageOverlay}>
                <Text style={styles.selectedImageText}>
                  {t("components:profilePictureUpload.newImageSelected")}
                </Text>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <Button
              label={t("components:profilePictureUpload.chooseFromGallery")}
              onPress={pickImage}
              icon="photo"
              theme="secondary"
            />

            {Platform.OS !== "web" && (
              <Button
                label={t("components:profilePictureUpload.takePhoto")}
                onPress={takePhoto}
                icon="camera"
                theme="secondary"
              />
            )}

            {selectedImage && (
              <Button
                label={
                  uploading
                    ? t("components:profilePictureUpload.uploading")
                    : t("components:profilePictureUpload.uploadImage")
                }
                onPress={uploadImage}
                disabled={uploading}
                theme="primary"
              />
            )}
          </View>
        </View>
      </View>

      {/* Cross-platform alert modal */}
      <ConfirmationModal
        visible={alertModal.visible}
        title={alertModal.title}
        message={alertModal.message}
        confirmText="OK"
        onConfirm={hideAlert}
        onCancel={hideAlert}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    width: "90%",
    maxWidth: 400,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: theme.colors.text,
  },
  closeButton: {
    padding: 4,
  },
  imagePreview: {
    alignItems: "center",
    marginBottom: 20,
    position: "relative",
  },
  previewImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: theme.colors.secondary,
  },
  selectedImageOverlay: {
    position: "absolute",
    bottom: 0,
    backgroundColor: theme.colors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  selectedImageText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: "bold",
  },
  buttonContainer: {
    gap: 12,
  },
  actionButton: {
    // Button component handles its own styling
  },
  uploadButton: {
    marginTop: 8,
  },
});
