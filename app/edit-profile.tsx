// /app/edit-profile.tsx

import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Button from '../components/Button';
import { getDefaultProfilePicture } from '../constants/profilePictures';
import { theme } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfile } from '../contexts/UserContext';

export default function EditProfileScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { userProfile } = useUserProfile();
    
    // Form state
    const [displayName, setDisplayName] = useState(userProfile?.displayName || '');
    const [email, setEmail] = useState(userProfile?.email || user?.email || '');
    const [phoneNumber, setPhoneNumber] = useState(userProfile?.phoneNumber || '');
    const [dateOfBirth, setDateOfBirth] = useState(
        userProfile?.dateOfBirth ? new Date(userProfile.dateOfBirth).toLocaleDateString() : ''
    );
    
    const [loading, setLoading] = useState(false);
    const [showImagePicker, setShowImagePicker] = useState(false);

    const handleSave = async () => {
        setLoading(true);
        try {
            // TODO: Implement user profile update function
            console.log('Saving profile:', {
                displayName,
                email,
                phoneNumber,
                dateOfBirth,
            });
            
            // For now, just show success
            Alert.alert('Success', 'Profile updated successfully!');
            router.back();
        } catch (error) {
            console.error('Error updating profile:', error);
            Alert.alert('Error', 'Failed to update profile. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleImagePress = () => {
        setShowImagePicker(true);
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <FontAwesome name="arrow-left" size={20} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Edit Profile</Text>
                <View style={styles.headerSpacer} />
            </View>

            <KeyboardAvoidingView 
                style={styles.content}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {/* Profile Picture Section */}
                    <View style={styles.imageSection}>
                        <TouchableOpacity onPress={handleImagePress} style={styles.imageContainer}>
                            {user?.photoURL || userProfile?.photoURL ? (
                                <Image 
                                    source={{ uri: user?.photoURL || userProfile?.photoURL || getDefaultProfilePicture(false) }}
                                    style={styles.profileImage}
                                />
                            ) : (
                                <View style={styles.placeholderImage}>
                                    <MaterialIcons name="person" size={50} color={theme.colors.textSecondary} />
                                </View>
                            )}
                            <View style={styles.editIconContainer}>
                                <MaterialIcons name="photo-camera" size={20} color={theme.colors.white} />
                            </View>
                        </TouchableOpacity>
                        <Text style={styles.imageLabel}>Tap to change profile picture</Text>
                    </View>

                    {/* Form Fields */}
                    <View style={styles.formSection}>
                        <View style={styles.fieldContainer}>
                            <Text style={styles.fieldLabel}>Display Name</Text>
                            <TextInput
                                style={styles.textInput}
                                value={displayName}
                                onChangeText={setDisplayName}
                                placeholder="Enter your display name"
                                placeholderTextColor={theme.colors.textSecondary}
                            />
                        </View>

                        <View style={styles.fieldContainer}>
                            <Text style={styles.fieldLabel}>Email</Text>
                            <TextInput
                                style={styles.textInput}
                                value={email}
                                onChangeText={setEmail}
                                placeholder="Enter your email"
                                placeholderTextColor={theme.colors.textSecondary}
                                keyboardType="email-address"
                                autoCapitalize="none"
                            />
                        </View>

                        <View style={styles.fieldContainer}>
                            <Text style={styles.fieldLabel}>Phone Number</Text>
                            <TextInput
                                style={styles.textInput}
                                value={phoneNumber}
                                onChangeText={setPhoneNumber}
                                placeholder="Enter your phone number"
                                placeholderTextColor={theme.colors.textSecondary}
                                keyboardType="phone-pad"
                            />
                        </View>

                        <View style={styles.fieldContainer}>
                            <Text style={styles.fieldLabel}>Date of Birth</Text>
                            <TextInput
                                style={styles.textInput}
                                value={dateOfBirth}
                                onChangeText={setDateOfBirth}
                                placeholder="MM/DD/YYYY"
                                placeholderTextColor={theme.colors.textSecondary}
                            />
                        </View>
                    </View>
                </ScrollView>

                {/* Save Button */}
                <View style={styles.buttonContainer}>
                    <Button
                        label={loading ? "Saving..." : "Save Changes"}
                        onPress={handleSave}
                        disabled={loading}
                        theme="primary"
                    />
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.white,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.inputBorder,
    },
    backButton: {
        padding: 5,
    },
    headerTitle: {
        flex: 1,
        fontSize: 18,
        fontWeight: '600',
        color: theme.colors.text,
        textAlign: 'center',
        marginRight: 30, // Compensate for back button
    },
    headerSpacer: {
        width: 30,
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingVertical: 20,
    },
    imageSection: {
        alignItems: 'center',
        marginBottom: 30,
    },
    imageContainer: {
        position: 'relative',
        marginBottom: 10,
    },
    profileImage: {
        width: 100,
        height: 100,
        borderRadius: 50,
    },
    placeholderImage: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: theme.colors.inputBackground,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.inputBorder,
    },
    editIconContainer: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: theme.colors.primary,
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: theme.colors.white,
    },
    imageLabel: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        textAlign: 'center',
    },
    formSection: {
        gap: 20,
    },
    fieldContainer: {
        gap: 8,
    },
    fieldLabel: {
        fontSize: 16,
        fontWeight: '500',
        color: theme.colors.text,
    },
    textInput: {
        borderWidth: 1,
        borderColor: theme.colors.inputBorder,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        color: theme.colors.text,
        backgroundColor: theme.colors.inputBackground,
    },
    buttonContainer: {
        paddingHorizontal: 20,
        paddingVertical: 20,
        borderTopWidth: 1,
        borderTopColor: theme.colors.inputBorder,
    },
});
