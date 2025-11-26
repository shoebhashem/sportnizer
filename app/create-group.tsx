import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import DropdownInput from "@/components/DropdownInput";
import Input from "@/components/Input";
import { theme } from "@/constants/theme";
import { useUser } from "@/contexts/UserContext";
import { SPORT_TYPES } from "@/services/constants";
import {
  createNewClubAndGroup,
  createNewGroupInExistingClub,
  type CreateNewClubAndGroupInput,
  type CreateNewGroupInExistingClubInput
} from "@/services/orchestration";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type CreateMode = "existing-club" | "new-club";

export default function CreateGroupScreen() {
  // User context for getting user data and admin clubs
  const { firebaseUser, userProfile, isLoading: userLoading, refreshUserProfile } = useUser();
  
  const [loading, setLoading] = useState(false);

  // Step 1: Club selection
  const [selectedClubId, setSelectedClubId] = useState<string>("");
  const [createMode, setCreateMode] = useState<CreateMode>("existing-club");

  // Step 2/2.5: Club/Group name
  const [clubName, setClubName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [clubNameError, setClubNameError] = useState("");
  const [groupNameError, setGroupNameError] = useState("");

  // Step 4: Sport type
  const [sportType, setSportType] = useState("");
  const [sportTypeError, setSportTypeError] = useState("");

  // Get admin clubs from user profile
  const adminClubs = useMemo(() => {
    if (!userProfile?.clubAccess) return [];
    return userProfile.clubAccess
      .filter(club => club.role === 'club-admin')
      .map(club => ({
        value: club.clubId,
        label: club.clubName
      }));
  }, [userProfile?.clubAccess]);

  // Prepare dropdown options with "Create New Club" option
  const clubOptions = useMemo(() => {
    const options = [
      { id: "create-new-club", name: "➕ Create New Club" },
      ...adminClubs.map(club => ({ id: club.value, name: club.label }))
    ];
    return options;
  }, [adminClubs]);

  // Step visibility logic
  const showStep2 = selectedClubId !== "";
  const showStep4 = showStep2 && groupName.trim() !== "" && (createMode === "existing-club" || clubName.trim() !== "");

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalConfirmText, setModalConfirmText] = useState("OK");
  const [modalOnConfirm, setModalOnConfirm] = useState<() => void>(() => {});
  const [showCancelButton, setShowCancelButton] = useState(false);

  // Helper function to show modal
  const showModal = (title: string, message: string, confirmText: string = "OK", onConfirm: () => void = () => {}, isError: boolean = false) => {
    setModalTitle(title);
    setModalMessage(message);
    setModalConfirmText(confirmText);
    setModalOnConfirm(() => () => {
      hideModal();
      onConfirm();
    });
    setShowCancelButton(isError);
    setModalVisible(true);
  };

  // Helper function to hide modal
  const hideModal = () => {
    setModalVisible(false);
  };

  // Get admin clubs for dropdown

  // Prepare dropdown options with "Create New Club" option
 

 

  // Handle club selection change
  const handleClubSelection = (value: string) => {
    setSelectedClubId(value);
    setCreateMode(value === "create-new-club" ? "new-club" : "existing-club");
    
    // Reset errors when changing selection
    setClubNameError("");
    setGroupNameError("");
    setSportTypeError("");
  };

  // Validation functions
  const validateInputs = () => {
    let isValid = true;
    
    // Reset errors
    setClubNameError("");
    setGroupNameError("");
    setSportTypeError("");

    if (createMode === "new-club") {
      if (!clubName.trim() || clubName.trim().length < 3) {
        setClubNameError("Club name must be at least 3 characters");
        isValid = false;
      }
    }

    if (!groupName.trim() || groupName.trim().length < 3) {
      setGroupNameError("Group name must be at least 3 characters");
      isValid = false;
    }

    if (!sportType) {
      setSportTypeError("Please select a sport type");
      isValid = false;
    }

    return isValid;
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!validateInputs()) {
      return;
    }

    if (!firebaseUser || !userProfile) {
      showModal("Error", "User authentication required. Please login again.", "OK", () => router.push('/(tabs)/groups'), true);
      return;
    }

    setLoading(true);

    try {
      if (createMode === "new-club") {
        // Create new club and group
        const input: CreateNewClubAndGroupInput = {
          clubData: {
            name: clubName.trim(),
            description: "", // Could be added as optional field later
            location: ""     // Could be added as optional field later
          },
          groupData: {
            name: groupName.trim(),
            sport: sportType,
            description: ""  // Could be added as optional field later
          },
          userId: firebaseUser.uid,
          userDisplayName: userProfile.displayName || firebaseUser.displayName || "Unknown User",
          userEmail: userProfile.email || firebaseUser.email || "",
          userPhotoURL: userProfile.photoURL || firebaseUser.photoURL || undefined
        };

        const result = await createNewClubAndGroup(input);
        
        if (result.success) {
          // Refresh user profile to get updated club/group access
          await refreshUserProfile();
          showModal(
            "Success!", 
            `Club "${clubName}" and group "${groupName}" created successfully!`, 
            "Continue", 
            () => router.push('/(tabs)/groups')
          );
        } else {
          showModal("Error", result.error || "Failed to create club and group", "OK", undefined, true);
        }
      } else {
        // Create group in existing club
        const input: CreateNewGroupInExistingClubInput = {
          clubId: selectedClubId,
          groupData: {
            name: groupName.trim(),
            sport: sportType,
            description: ""  // Could be added as optional field later
          },
          userId: firebaseUser.uid,
          userDisplayName: userProfile.displayName || firebaseUser.displayName || "Unknown User",
          userEmail: userProfile.email || firebaseUser.email || "",
          userPhotoURL: userProfile.photoURL || firebaseUser.photoURL || undefined
        };

        const result = await createNewGroupInExistingClub(input);
        
        if (result.success) {
          // Refresh user profile to get updated group access
          await refreshUserProfile();
          const selectedClub = adminClubs.find(club => club.value === selectedClubId);
          showModal(
            "Success!", 
            `Group "${groupName}" created successfully in "${selectedClub?.label || 'selected club'}"!`, 
            "Continue", 
            () => router.push('/(tabs)/groups')
          );
        } else {
          showModal("Error", result.error || "Failed to create group", "OK", undefined, true);
        }
      }
    } catch (error) {
      console.error("Error in handleSubmit:", error);
      showModal("Error", "An unexpected error occurred. Please try again.", "OK", () => router.push('/(tabs)/groups'), true);
    } finally {
      setLoading(false);
    }
  };


  // Show loading state while user data is being fetched
  if (userLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Ionicons 
            name="arrow-back" 
            size={24} 
            color={theme.colors.secondary}
            onPress={() => router.back()}
            style={styles.backButton}
          />
          <Text style={styles.title}>Create New Group</Text>
        </View>
        <View style={[styles.contentContainer, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={{ color: theme.colors.text, marginTop: theme.spacing.md }}>Loading user data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show error if user is not authenticated
  if (!firebaseUser || !userProfile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Ionicons 
            name="arrow-back" 
            size={24} 
            color={theme.colors.secondary}
            onPress={() => router.back()}
            style={styles.backButton}
          />
          <Text style={styles.title}>Create New Group</Text>
        </View>
        <View style={[styles.contentContainer, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ color: theme.colors.error, textAlign: 'center', fontSize: theme.typography.fontSize.large }}>
            Authentication required. Please log in to create groups.
          </Text>
          <View style={{ marginTop: theme.spacing.lg }}>
            <Button
              label="Go Back"
              theme="primary"
              onPress={() => router.back()}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Ionicons 
          name="arrow-back" 
          size={24} 
          color={theme.colors.secondary}
          onPress={() => router.back()}
          style={styles.backButton}
        />
        <Text style={styles.title}>Create New Group</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Step 1: Club Selection */}
        <View style={styles.stepContainer}>
          <Text style={styles.stepTitle}>Step 1: Select Club</Text>
          <Text style={styles.stepDescription}>
            Choose an existing club or create a new one
          </Text>
          
          <DropdownInput
            label="Club"
            value={selectedClubId}
            onValueChange={handleClubSelection}
            options={clubOptions}
            placeholder={adminClubs.length === 0 ? "Create New Club (No admin clubs found)" : "Select a club..."}
          />
          
          {adminClubs.length === 0 && (
            <Text style={styles.helpText}>
              💡 You don&apos;t have admin access to any clubs yet. You can create a new club and group together, or ask an existing club admin to give you permissions.
            </Text>
          )}
        </View>

        {/* Step 2/2.5: Club Name (if creating new) and Group Name */}
        {showStep2 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>
              {createMode === "new-club" ? "Step 2: Club & Group Details" : "Step 2: Group Details"}
            </Text>
            <Text style={styles.stepDescription}>
              {createMode === "new-club" 
                ? "Enter the name for your new club and group"
                : "Enter the name for your new group"
              }
            </Text>

            {createMode === "new-club" && (
              <Input
                label="Club Name"
                value={clubName}
                onChangeText={setClubName}
                placeholder="Enter club name"
                error={clubNameError}
              />
            )}

            <Input
              label="Group Name"
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Enter group name"
              error={groupNameError}
            />
          </View>
        )}

        {/* Step 4: Sport Type */}
        {showStep4 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Step 3: Sport Type</Text>
            <Text style={styles.stepDescription}>
              Select the sport type for this group
            </Text>

            <DropdownInput
              label="Sport Type"
              value={sportType}
              onValueChange={setSportType}
              options={SPORT_TYPES}
              placeholder="Select sport type"
              error={sportTypeError}
            />
          </View>
        )}

        {/* Submit Button - only show when all steps are visible and filled */}
        {showStep4 && (
          <View style={styles.submitContainer}>
            <Button
              label={createMode === "new-club" ? "Create Club & Group" : "Create Group"}
              theme="primary"
              onPress={handleSubmit}
              disabled={loading}
            />
            {loading && (
              <ActivityIndicator 
                size="small" 
                color={theme.colors.secondary} 
                style={styles.loadingIndicator}
              />
            )}
          </View>
        )}
      </ScrollView>
      
      <ConfirmationModal
        visible={modalVisible}
        title={modalTitle}
        message={modalMessage}
        confirmText={modalConfirmText}
        onConfirm={modalOnConfirm}
        onCancel={hideModal}
        {...(showCancelButton && { cancelText: "Cancel" })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.layout.containerPadding,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  backButton: {
    marginRight: theme.spacing.md,
  },
  title: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.secondary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: theme.layout.containerPadding,
    paddingBottom: theme.spacing.xl,
  },
  stepContainer: {
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  stepTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  stepDescription: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
    lineHeight: 20,
  },
  submitContainer: {
    marginTop: theme.spacing.lg,
    alignItems: "center",
  },
  loadingIndicator: {
    marginTop: theme.spacing.md,
  },
  helpText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    lineHeight: 18,
    fontStyle: 'italic',
  },
});
