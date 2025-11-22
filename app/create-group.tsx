import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import DropdownInput from "@/components/DropdownInput";
import Input from "@/components/Input";
import { theme } from "@/constants/theme";
import { useUserClubs } from "@/contexts/UserContext";
import { clubService } from "@/services/club";
import { SPORT_TYPES } from "@/services/constants";
import { groupService } from "@/services/group";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
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
  const userClubs = useUserClubs();
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
  const adminClubs = userClubs.filter((club) => club.isAdmin);

  // Prepare dropdown options with "Create New Club" option
  const clubOptions = [
    ...adminClubs.map((club) => ({
      id: club.clubId,
      name: club.clubName,
    })),
    {
      id: "create-new-club",
      name: "➕ Create New Club",
    },
  ];

  // Set default selection on mount
  useEffect(() => {
    if (adminClubs.length > 0 && !selectedClubId) {
      setSelectedClubId(adminClubs[0].clubId);
      setCreateMode("existing-club");
    } else if (adminClubs.length === 0) {
      setSelectedClubId("create-new-club");
      setCreateMode("new-club");
    }
  }, [adminClubs, selectedClubId]);

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

    setLoading(true);

    try {
      if (createMode === "new-club") {
        // Step 1: Create new club
        const clubResult = await clubService.createClub({
          name: clubName.trim(),
          description: '',
          sport: sportType,
          location: '',
          admins: [], // Will be set by Firebase Function
          memberCount: 0,
          isActive: true,
          createdBy: '' // Will be set by Firebase Function
        });
        
        if (!clubResult.success || !clubResult.clubId) {
          showModal("Error", clubResult.error || "Failed to create club", "OK", () => router.push('/(tabs)/groups'), true);
          setLoading(false);
          return;
        }

        // Step 2: Create group in the new club
        const groupResult = await groupService.createGroup(
          clubResult.clubId!,
          groupName.trim(),
          {
            name: groupName.trim(),
            description: '',
            coaches: [],
            admins: [], // Will be set by Firebase Function
            memberCount: 0,
            subGroups: [],
            isActive: true,
            createdBy: '' // Will be set by Firebase Function
          }
        );

        if (!groupResult.success) {
          showModal("Error", groupResult.error || "Failed to create group", "OK", () => router.push('/(tabs)/groups'), true);
          setLoading(false);
          return;
        }

        showModal(
          "Success!",
          `Club "${clubName.trim()}" and group "${groupName.trim()}" created successfully!`,
          "OK",
          () => router.push('/(tabs)/groups')
        );
      } else {
        // Create group in existing club
        const groupResult = await groupService.createGroup(
          selectedClubId,
          groupName.trim(),
          {
            name: groupName.trim(),
            description: '',
            coaches: [],
            admins: [], // Will be set by Firebase Function
            memberCount: 0,
            subGroups: [],
            isActive: true,
            createdBy: '' // Will be set by Firebase Function
          }
        );

        if (!groupResult.success) {
          showModal("Error", groupResult.error || "Failed to create group", "OK", () => router.push('/(tabs)/groups'), true);
          setLoading(false);
          return;
        }

        showModal(
          "Success!",
          `Group "${groupName.trim()}" created successfully!`,
          "OK",
          () => router.push('/(tabs)/groups')
        );
      }
    } catch (error) {
      console.error("Error in handleSubmit:", error);
      showModal("Error", "An unexpected error occurred. Please try again.", "OK", () => router.push('/(tabs)/groups'), true);
    } finally {
      setLoading(false);
    }
  };

  // Check if we should show step 2 (club/group name)
  const showStep2 = selectedClubId !== "";

  // Check if we should show step 4 (sport type)
  const showStep4 = showStep2 && (
    (createMode === "new-club" && clubName.trim().length > 0 && groupName.trim().length > 0) ||
    (createMode === "existing-club" && groupName.trim().length > 0)
  );

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
            placeholder="Select a club..."
          />
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
});
