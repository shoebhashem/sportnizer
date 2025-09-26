import Button from "@/components/Button";
import DropdownInput from "@/components/DropdownInput";
import Input from "@/components/Input";
import { theme } from "@/constants/theme";
import { createClub } from "@/services/club/createClubService";
import { SPORT_TYPES } from "@/services/constants";
import { createGroup } from "@/services/group/createGroupService";
import { ClubMembership } from "@/services/types/club";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface CreateGroupModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (result: { clubId?: string; groupId: string }) => void;
  userClubs: ClubMembership[];
}

export default function CreateGroupModal({
  visible,
  onClose,
  onSuccess,
  userClubs,
}: CreateGroupModalProps) {
  const [currentStep, setCurrentStep] = useState<
    "select" | "new-club" | "existing-club"
  >("select");
  const [selectedClubId, setSelectedClubId] = useState<string>("");

  const [clubName, setClubName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [sportType, setSportType] = useState("");
  const [loading, setLoading] = useState(false);

  const [clubNameError, setClubNameError] = useState("");
  const [groupNameError, setGroupNameError] = useState("");
  const [sportTypeError, setSportTypeError] = useState("");

  // Defensive checks for userClubs prop
  const safeUserClubs = Array.isArray(userClubs) ? userClubs : [];
  const adminClubs = safeUserClubs.filter((club) => club && club.isAdmin) || [];

  const resetForm = () => {
    setCurrentStep("select");
    setSelectedClubId("");
    setClubName("");
    setGroupName("");
    setSportType("");
    setClubNameError("");
    setGroupNameError("");
    setSportTypeError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validateNewClubForm = () => {
    let isValid = true;
    setClubNameError("");
    setGroupNameError("");
    setSportTypeError("");

    if (!clubName.trim() || clubName.trim().length < 3) {
      setClubNameError("Club name must be at least 3 characters");
      isValid = false;
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

  const validateExistingClubForm = () => {
    let isValid = true;
    setGroupNameError("");

    if (!groupName.trim() || groupName.trim().length < 3) {
      setGroupNameError("Group name must be at least 3 characters");
      isValid = false;
    }
    if (!selectedClubId) {
      // Handle no club selected error if needed
      isValid = false;
    }
    return isValid;
  };

  const handleCreateNewClub = async () => {
    if (!validateNewClubForm()) return;

    setLoading(true);
    try {
      const clubResult = await createClub({
        name: clubName.trim(),
        sportType,
      });

      if (clubResult.success && clubResult.data) {
        const groupResult = await createGroup({
          name: groupName.trim(),
          clubId: clubResult.data.id,
        });

        if (groupResult.success && groupResult.data) {
          onSuccess({
            clubId: clubResult.data.id,
            groupId: groupResult.data.id,
          });
          handleClose();
        }
      }
    } catch (error) {
      console.error("Error creating club and group:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroupInExistingClub = async () => {
    if (!validateExistingClubForm()) return;

    setLoading(true);
    try {
      const result = await createGroup({
        name: groupName.trim(),
        clubId: selectedClubId,
      });

      if (result.success && result.data) {
        onSuccess({
          clubId: selectedClubId,
          groupId: result.data.id,
        });
        handleClose();
      }
    } catch (error) {
      console.error("Error creating group:", error);
    } finally {
      setLoading(false);
    }
  };

  const renderSelectionStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.title}>Create New Group</Text>
      <Text style={styles.subtitle}>
        Choose whether to create a new club or add to an existing one
      </Text>

      <TouchableOpacity
        style={styles.optionButton}
        onPress={() => setCurrentStep("new-club")}
      >
        <View style={styles.optionContent}>
          <Ionicons name="add-circle-outline" size={24} color={theme.colors.secondary} />
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Create New Club</Text>
            <Text style={styles.optionDescription}>
              Start a new club and create your first group
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {adminClubs.length > 0 && (
        <TouchableOpacity
          style={styles.optionButton}
          onPress={() => setCurrentStep("existing-club")}
        >
          <View style={styles.optionContent}>
            <Ionicons name="people-outline" size={24} color={theme.colors.secondary} />
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Add to Existing Club</Text>
              <Text style={styles.optionDescription}>
                Create a group in one of your clubs
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  const renderNewClubStep = () => (
    <ScrollView style={styles.stepContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setCurrentStep("select")}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Create New Club</Text>
        <View style={styles.spacer} />
      </View>

      <Input
        label="Club Name"
        value={clubName}
        onChangeText={setClubName}
        placeholder="Enter club name"
        error={clubNameError}
      />

      <DropdownInput
        label="Sport Type"
        value={sportType}
        onValueChange={setSportType}
        options={SPORT_TYPES}
        placeholder="Select sport type"
        error={sportTypeError}
      />

      <Input
        label="First Group Name"
        value={groupName}
        onChangeText={setGroupName}
        placeholder="Enter group name"
        error={groupNameError}
      />

      <View style={styles.buttonContainer}>
        <Button
          title="Create Club & Group"
          onPress={handleCreateNewClub}
          disabled={loading}
        />
      </View>
    </ScrollView>
  );

  const renderExistingClubStep = () => (
    <ScrollView style={styles.stepContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setCurrentStep("select")}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Add to Existing Club</Text>
        <View style={styles.spacer} />
      </View>

      <DropdownInput
        label="Select Club"
        value={selectedClubId}
        onValueChange={setSelectedClubId}
        options={adminClubs.map((club) => ({
          label: club.name,
          value: club.id,
        }))}
        placeholder="Choose a club"
      />

      <Input
        label="Group Name"
        value={groupName}
        onChangeText={setGroupName}
        placeholder="Enter group name"
        error={groupNameError}
      />

      <View style={styles.buttonContainer}>
        <Button
          title="Create Group"
          onPress={handleCreateGroupInExistingClub}
          disabled={loading}
        />
      </View>
    </ScrollView>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case "select":
        return renderSelectionStep();
      case "new-club":
        return renderNewClubStep();
      case "existing-club":
        return renderExistingClubStep();
      default:
        return renderSelectionStep();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.modalOverlay} onPress={handleClose}>
        <View style={styles.modalContainer}>
          <Pressable onPress={() => {}} style={styles.modal}>
            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={theme.colors.secondary} />
              </View>
            )}
            {renderCurrentStep()}
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContainer: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "white",
    borderRadius: 12,
    maxHeight: "80%",
  },
  modal: {
    flex: 1,
    position: "relative",
  },
  stepContainer: {
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: theme.colors.text,
    textAlign: "center",
    flex: 1,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: 30,
    lineHeight: 20,
  },
  optionButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    backgroundColor: "white",
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  optionText: {
    flex: 1,
    marginLeft: 12,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: theme.colors.text,
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  cancelButton: {
    marginTop: 20,
    padding: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  buttonContainer: {
    marginTop: 20,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  spacer: {
    width: 24,
  },
});
