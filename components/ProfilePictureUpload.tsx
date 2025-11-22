import { FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
    Alert,
    Image,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

import { theme } from '../constants/theme';
// TODO: Implement profile picture upload in new memberService/userService
import { uploadMemberProfilePicture, uploadUserProfilePicture } from '../services/archived/user/profilePictureService';
import Button from './Button';

interface ProfilePictureUploadProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (newImageUrl: string) => void;
  currentImageUrl?: string;
  // For member photos (when guardian uploads for child)
  groupId?: string;
  memberId?: string;
  isForMember?: boolean;
}

export default function ProfilePictureUpload({
  visible,
  onClose,
  onSuccess,
  currentImageUrl,
  groupId,
  memberId,
  isForMember = false
}: ProfilePictureUploadProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Sorry, we need camera roll permissions to upload profile pictures.'
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
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Sorry, we need camera permissions to take photos.'
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
      
      if (isForMember && groupId && memberId) {
        // Upload for group member (child)
        result = await uploadMemberProfilePicture(groupId, memberId, selectedImage);
      } else {
        // Upload for current user
        result = await uploadUserProfilePicture(selectedImage);
      }

      if (result.success && result.profilePictureUrl) {
        onSuccess(result.profilePictureUrl);
        setSelectedImage(null);
        onClose();
      } else {
        Alert.alert('Upload Failed', result.error || 'Failed to upload profile picture');
      }
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Upload Failed', 'An unexpected error occurred');
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
              {isForMember ? 'Upload Member Photo' : 'Upload Profile Picture'}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <FontAwesome name="times" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Current or Selected Image Preview */}
          <View style={styles.imagePreview}>
            <Image
              source={{ 
                uri: selectedImage || currentImageUrl || 'https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fadult_profile_icon.png?alt=media'
              }}
              style={styles.previewImage}
              defaultSource={require('@/assets/images/avatars/adult-default.png')}
            />
            {selectedImage && (
              <View style={styles.selectedImageOverlay}>
                <Text style={styles.selectedImageText}>New Image Selected</Text>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <Button
              label="Choose from Gallery"
              onPress={pickImage}
              icon="photo"
              theme="secondary"
            />
            
            <Button
              label="Take Photo"
              onPress={takePhoto}
              icon="camera"
              theme="secondary"
            />

            {selectedImage && (
              <Button
                label={uploading ? "Uploading..." : "Upload Image"}
                onPress={uploadImage}
                disabled={uploading}
                theme="primary"
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    width: '90%',
    maxWidth: 400,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  closeButton: {
    padding: 4,
  },
  imagePreview: {
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  previewImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: theme.colors.secondary,
  },
  selectedImageOverlay: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: theme.colors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  selectedImageText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
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
