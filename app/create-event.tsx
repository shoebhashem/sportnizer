import { FontAwesome } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Button from "../components/Button";
import ConfirmationModal from "../components/ConfirmationModal";
import CustomDateTimePicker from "../components/DateTimePicker";
import RoleFilterModal from "../components/RoleFilterModal";
import { theme } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";
import { eventCreationService } from "../services/event/createEvent";
import { getEventDetails } from "../services/event/eventService";
import { fetchGroupMembers } from "../services/fetchGroupMembers";

interface EventData {
  title: string;
  description: string;
  startDate: Date;
  startTime: Date;
  gatheringTime?: string; // Optional gathering time in HH:mm format (e.g., "15:30")
  endDate: Date;
  endTime: Date;
  location: string;
  type: "practice" | "game" | "meeting" | "other";
  mode: "simple" | "advanced"; // Simple or advanced creation mode
  duration?: number; // Duration in minutes for simple mode
  capacity: {
    enabled: boolean;
    maxAttendees?: number;
  };
  responseDeadline: {
    enabled: boolean; // Whether custom deadline is enabled
    date?: Date; // Custom deadline date (if enabled)
  };
}

type GroupRole = "player" | "player-underage" | "coach" | "admin";

interface EventContext {
  level: "club" | "group" | "subgroup";
  clubId: string;
  clubName: string;
  groupId?: string;
  groupName?: string;
  subgroupId?: string;
  subgroupName?: string;
  sourceScreen?: string;
}

interface ModalState {
  visible: boolean;
  title: string;
  message: string;
  type?: "error" | "success" | "info";
}

export default function CreateEventScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();

  // DEBUG: Log received params
  console.log("🔍 CreateEvent - Received Params:", {
    params,
    subgroupId: params.subgroupId,
    groupId: params.groupId,
    clubId: params.clubId,
    clubName: params.clubName,
    groupName: params.groupName,
    subgroupName: params.subgroupName,
  });

  // Extract event context from params - detect level based on available params
  const eventContext: EventContext | null = useMemo(() => {
    if (!params.clubId) return null;

    // Check for subgroup-level event (most specific)
    if (params.subgroupId && params.groupId) {
      console.log("🔍 CreateEvent - Building SUBGROUP context");
      return {
        level: "subgroup",
        clubId: params.clubId as string,
        clubName: params.clubName as string,
        groupId: params.groupId as string,
        groupName: params.groupName as string,
        subgroupId: params.subgroupId as string,
        subgroupName: params.subgroupName as string,
        sourceScreen: params.sourceScreen as string,
      };
    }

    // Check for group-level event
    if (params.groupId) {
      console.log("🔍 CreateEvent - Building GROUP context");
      return {
        level: "group",
        clubId: params.clubId as string,
        clubName: params.clubName as string,
        groupId: params.groupId as string,
        groupName: params.groupName as string,
        sourceScreen: params.sourceScreen as string,
      };
    }

    // Default to club-level event
    console.log("🔍 CreateEvent - Building CLUB context");
    return {
      level: "club",
      clubId: params.clubId as string,
      clubName: params.clubName as string,
      sourceScreen: params.sourceScreen as string,
    };
  }, [
    params.clubId,
    params.clubName,
    params.groupId,
    params.groupName,
    params.subgroupId,
    params.subgroupName,
    params.sourceScreen,
  ]);

  const [eventData, setEventData] = useState<EventData>({
    title: "",
    description: "",
    startDate: new Date(),
    startTime: new Date(),
    gatheringTime: undefined,
    endDate: (() => {
      const date = new Date();
      date.setHours(date.getHours() + 2); // Default 2 hours later
      return date;
    })(),
    endTime: (() => {
      const time = new Date();
      time.setHours(time.getHours() + 2); // Default 2 hours later
      return time;
    })(),
    location: "",
    type: "practice",
    mode: "simple", // Default to simple mode
    duration: 120, // Default 2 hours in minutes
    capacity: {
      enabled: false,
      maxAttendees: undefined,
    },
    responseDeadline: {
      enabled: false, // Default to using event start date as deadline
      date: undefined,
    },
  });

  // Edit mode detection
  const isEditMode = !!params.eventId;
  const eventId = params.eventId as string | undefined;

  const [selectedRoles, setSelectedRoles] = useState<GroupRole[]>([]);
  const [memberCount, setMemberCount] = useState<number>(0);
  const [showRoleFilterModal, setShowRoleFilterModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isLoadingEvent, setIsLoadingEvent] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showGatheringTimePicker, setShowGatheringTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showResponseDeadlinePicker, setShowResponseDeadlinePicker] =
    useState(false);
  const [showResponseDeadlineTimePicker, setShowResponseDeadlineTimePicker] =
    useState(false);
  const [modal, setModal] = useState<ModalState>({
    visible: false,
    title: "",
    message: "",
    type: "error",
  });

  // Load event data if in edit mode
  useEffect(() => {
    if (isEditMode && eventId && eventContext) {
      loadEventData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, eventId]);

  const loadEventData = async () => {
    if (!eventId || !eventContext) return;

    setIsLoadingEvent(true);
    try {
      const event = await getEventDetails(eventId, eventContext.clubId);

      if (!event) {
        setModal({
          visible: true,
          title: "Error",
          message: "Event not found",
          type: "error",
        });
        router.back();
        return;
      }

      // Check if event has ended - cannot edit past events
      if (event.endDate) {
        const eventEndTime = new Date(event.endDate);
        const now = new Date();

        if (eventEndTime < now) {
          setModal({
            visible: true,
            title: "Event Ended",
            message: "This event has ended and cannot be edited",
            type: "error",
          });
          setTimeout(() => router.back(), 2000);
          return;
        }
      }

      // Determine if event was created in simple or advanced mode
      // If event has capacity or deadline, it was created in advanced mode
      const wasAdvancedMode = !!event.capacityLimit || !!event.responseDeadline;

      // Convert event type
      const eventTypeMap: Record<
        string,
        "practice" | "game" | "meeting" | "other"
      > = {
        training: "practice",
        match: "game",
        meeting: "meeting",
        other: "other",
      };

      // Populate form with event data
      setEventData({
        title: event.title,
        description: event.description || "",
        startDate: new Date(event.startDate),
        startTime: new Date(event.startDate),
        gatheringTime: event.gatheringTime
          ? (() => {
              const date = new Date(event.gatheringTime);
              const hours = date.getHours().toString().padStart(2, "0");
              const minutes = date.getMinutes().toString().padStart(2, "0");
              return `${hours}:${minutes}`;
            })()
          : undefined,
        endDate: event.endDate
          ? new Date(event.endDate)
          : new Date(event.startDate),
        endTime: event.endDate
          ? new Date(event.endDate)
          : new Date(event.startDate),
        location: event.location || "",
        type: (eventTypeMap[event.eventType as keyof typeof eventTypeMap] ||
          "other") as "practice" | "game" | "meeting" | "other",
        mode: wasAdvancedMode ? "advanced" : "simple",
        duration: event.endDate
          ? Math.round(
              (new Date(event.endDate).getTime() -
                new Date(event.startDate).getTime()) /
                (1000 * 60),
            )
          : 120,
        capacity: {
          enabled: !!event.capacityLimit,
          maxAttendees: event.capacityLimit || undefined,
        },
        responseDeadline: {
          enabled: !!event.responseDeadline,
          date: event.responseDeadline
            ? new Date(event.responseDeadline)
            : undefined,
        },
      });
    } catch (error) {
      console.error("Error loading event:", error);
      setModal({
        visible: true,
        title: "Error",
        message: "Failed to load event data",
        type: "error",
      });
    } finally {
      setIsLoadingEvent(false);
    }
  };

  const loadMemberCount = useCallback(async () => {
    if (!eventContext) return;

    setIsLoadingMembers(true);
    try {
      // Only fetch member count for group and subgroup events
      // For club-level events, member count is not relevant
      if (eventContext.level === "club") {
        setMemberCount(0);
        setIsLoadingMembers(false);
        return;
      }

      const result = await fetchGroupMembers(
        eventContext.clubId,
        eventContext.groupId!,
      );

      if (result.success && result.members) {
        let filteredMembers = result.members;

        // Apply role filter if active
        if (selectedRoles.length > 0) {
          filteredMembers = result.members.filter((member) =>
            member.roles?.some((role) =>
              selectedRoles.includes(role as GroupRole),
            ),
          );
        }

        setMemberCount(filteredMembers.length);
      }
    } catch (error) {
      console.error("Error loading member count:", error);
    } finally {
      setIsLoadingMembers(false);
    }
  }, [eventContext, selectedRoles]);

  // Load member count on mount
  useEffect(() => {
    if (eventContext) {
      loadMemberCount();
    }
  }, [eventContext, loadMemberCount]);

  const eventTypes = [
    { key: "practice", label: "Training", icon: "dribbble" },
    { key: "game", label: "Match", icon: "trophy" },
    { key: "other", label: "Custom", icon: "calendar" },
  ];

  // Auto-generate title for Training and Match events
  const getAutoTitle = (type: string) => {
    if (type === "practice") return "Training";
    if (type === "game") return "Match";
    return "";
  };

  // Update title when event type changes (for Training/Match)
  useEffect(() => {
    if (eventData.type === "practice" || eventData.type === "game") {
      const autoTitle = getAutoTitle(eventData.type);
      if (eventData.title !== autoTitle) {
        setEventData((prev) => ({ ...prev, title: autoTitle }));
      }
    }
  }, [eventData.type]);

  const validateEventData = (): boolean => {
    // For custom events, title is required
    if (eventData.type === "other" && !eventData.title.trim()) {
      setModal({
        visible: true,
        title: "Missing Information",
        message: "Please enter an event title for custom events",
        type: "error",
      });
      return false;
    }

    if (!eventData.location.trim()) {
      setModal({
        visible: true,
        title: "Missing Information",
        message: "Please enter a location",
        type: "error",
      });
      return false;
    }

    // Validate end time is after start time
    const startDateTime = new Date(eventData.startDate);
    startDateTime.setHours(eventData.startTime.getHours());
    startDateTime.setMinutes(eventData.startTime.getMinutes());

    const endDateTime = new Date(eventData.endDate);
    endDateTime.setHours(eventData.endTime.getHours());
    endDateTime.setMinutes(eventData.endTime.getMinutes());

    if (endDateTime <= startDateTime) {
      setModal({
        visible: true,
        title: "Invalid Time",
        message: "Event end time must be after start time",
        type: "error",
      });
      return false;
    }

    // For new events, validate start time is in the future
    if (!isEditMode) {
      const now = new Date();
      if (startDateTime < now) {
        setModal({
          visible: true,
          title: "Invalid Time",
          message: "Event must start in the future",
          type: "error",
        });
        return false;
      }
    }

    // Validate gathering time is before start time
    if (eventData.gatheringTime) {
      const [gatheringHours, gatheringMinutes] = eventData.gatheringTime
        .split(":")
        .map(Number);
      const gatheringDateTime = new Date(eventData.startDate);
      gatheringDateTime.setHours(gatheringHours);
      gatheringDateTime.setMinutes(gatheringMinutes);

      if (gatheringDateTime >= startDateTime) {
        setModal({
          visible: true,
          title: "Invalid Time",
          message: "Gathering time must be before event start time",
          type: "error",
        });
        return false;
      }
    }

    // Validate response deadline is before start time
    if (eventData.responseDeadline.enabled && eventData.responseDeadline.date) {
      if (eventData.responseDeadline.date >= startDateTime) {
        setModal({
          visible: true,
          title: "Invalid Deadline",
          message: "Response deadline must be before event start time",
          type: "error",
        });
        return false;
      }
    }

    return true;
  };

  const handleCreateEvent = async () => {
    if (!validateEventData() || !eventContext || !user) {
      return;
    }

    setIsCreating(true);

    try {
      // Combine start date and time
      const startDateTime = new Date(eventData.startDate);
      startDateTime.setHours(eventData.startTime.getHours());
      startDateTime.setMinutes(eventData.startTime.getMinutes());

      // Combine end date and time
      const endDateTime = new Date(eventData.endDate);
      endDateTime.setHours(eventData.endTime.getHours());
      endDateTime.setMinutes(eventData.endTime.getMinutes());

      // Map event type to backend format
      const eventTypeMap = {
        practice: "training" as const,
        game: "match" as const,
        meeting: "meeting" as const,
        other: "other" as const,
      };

      // Build targetScope based on event level
      let targetScope: any;
      if (eventContext.level === "subgroup") {
        targetScope = {
          level: "subgroup" as const,
          clubId: eventContext.clubId,
          clubName: eventContext.clubName,
          groupId: eventContext.groupId!,
          groupName: eventContext.groupName!,
          subgroupId: eventContext.subgroupId!,
          subgroupName: eventContext.subgroupName!,
        };
      } else if (eventContext.level === "group") {
        targetScope = {
          level: "group" as const,
          clubId: eventContext.clubId,
          clubName: eventContext.clubName,
          groupId: eventContext.groupId!,
          groupName: eventContext.groupName!,
        };
      } else {
        // club level
        targetScope = {
          level: "club" as const,
          clubId: eventContext.clubId,
          clubName: eventContext.clubName,
        };
      }

      // Prepare request for createEventV2
      const request = {
        clubId: eventContext.clubId,
        clubName: eventContext.clubName,
        title: eventData.title,
        description: eventData.description || undefined,
        eventType: eventTypeMap[eventData.type],
        startDate: eventData.startDate.toISOString().split("T")[0],
        startTime: startDateTime.toISOString(),
        endDate: eventData.endDate.toISOString().split("T")[0],
        endTime: endDateTime.toISOString(),
        gatheringTime: eventData.gatheringTime, // Send as HH:mm string
        location: eventData.location,
        targetScope,
        roleFilter: selectedRoles.length > 0 ? selectedRoles : undefined,
        capacityLimit: eventData.capacity.enabled
          ? eventData.capacity.maxAttendees
          : undefined,
        responseDeadline:
          eventData.responseDeadline.enabled && eventData.responseDeadline.date
            ? eventData.responseDeadline.date.toISOString()
            : undefined,
        createdBy: user.uid,
        createdByName: user.displayName || user.email || "Unknown",
      };

      // DEBUG: Log request before calling backend
      console.log("🔍 CreateEvent - Request to backend:", {
        clubId: request.targetScope.clubId,
        clubName: request.targetScope.clubName,
        groupId: request.targetScope.groupId,
        groupName: request.targetScope.groupName,
        clubIdType: typeof request.targetScope.clubId,
        clubNameType: typeof request.targetScope.clubName,
        fullTargetScope: request.targetScope,
        // GATHERING TIME DEBUG
        gatheringTime: request.gatheringTime,
        startTime: request.startTime,
        startDate: request.startDate,
      });

      // Call backend
      const result = await eventCreationService.createEvent(request);

      if (!result.success) {
        throw new Error(result.error || "Failed to create event");
      }

      // Show success message
      setModal({
        visible: true,
        title: "Success!",
        message: `Event "${eventData.title}" has been created and sent to ${result.totalRecipients} recipients.`,
        type: "success",
      });
    } catch (error) {
      console.error("Error creating event:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      setModal({
        visible: true,
        title: "Creation Failed",
        message: `There was an error creating the event: ${errorMessage}. Please try again.`,
        type: "error",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateEvent = async () => {
    if (!validateEventData() || !eventContext || !user || !eventId) {
      return;
    }

    setIsCreating(true);

    try {
      // Combine start date and time
      const startDateTime = new Date(eventData.startDate);
      startDateTime.setHours(eventData.startTime.getHours());
      startDateTime.setMinutes(eventData.startTime.getMinutes());

      // Combine end date and time
      const endDateTime = new Date(eventData.endDate);
      endDateTime.setHours(eventData.endTime.getHours());
      endDateTime.setMinutes(eventData.endTime.getMinutes());

      // Map event type to backend format
      const eventTypeMap = {
        practice: "training" as const,
        game: "match" as const,
        meeting: "meeting" as const,
        other: "other" as const,
      };

      // Build update payload
      const updatePayload: any = {
        title: eventData.title || getAutoTitle(eventData.type),
        description: eventData.description,
        eventType: eventTypeMap[eventData.type],
        location: eventData.location,
        startDate: startDateTime.toISOString(),
        endDate: endDateTime.toISOString(),
        gatheringTime: eventData.gatheringTime || null, // Send as HH:mm string
        capacityLimit: eventData.capacity.enabled
          ? eventData.capacity.maxAttendees
          : null,
        responseDeadline:
          eventData.responseDeadline.enabled && eventData.responseDeadline.date
            ? eventData.responseDeadline.date.toISOString()
            : null,
      };

      // Call update service
      const { functions } = await import("../firebaseConfig");
      const { httpsCallable } = await import("firebase/functions");
      const updateEventFn = httpsCallable(functions, "updateEvent");

      const result = await updateEventFn({
        clubId: eventContext.clubId,
        eventId: eventId,
        eventData: updatePayload,
      });

      const response = result.data as { success: boolean; error?: string };

      if (!response.success) {
        throw new Error(response.error || "Failed to update event");
      }

      // Show success message
      setModal({
        visible: true,
        title: "Success!",
        message: `Event "${eventData.title}" has been updated successfully.`,
        type: "success",
      });
    } catch (error) {
      console.error("Error updating event:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      setModal({
        visible: true,
        title: "Update Failed",
        message: `There was an error updating the event: ${errorMessage}. Please try again.`,
        type: "error",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleModalClose = () => {
    if (modal.type === "success") {
      // Reset form only if creating (not editing)
      if (!isEditMode) {
        setEventData({
          title: "",
          description: "",
          startDate: new Date(),
          startTime: new Date(),
          gatheringTime: undefined,
          endDate: (() => {
            const date = new Date();
            date.setHours(date.getHours() + 2);
            return date;
          })(),
          endTime: (() => {
            const time = new Date();
            time.setHours(time.getHours() + 2);
            return time;
          })(),
          location: "",
          type: "practice",
          mode: "simple", // Default to simple mode
          duration: 120, // Default 2 hours in minutes
          capacity: {
            enabled: false,
            maxAttendees: undefined,
          },
          responseDeadline: {
            enabled: false, // Default to using event start date as deadline
            date: undefined,
          },
        });
      } else {
        // In edit mode, don't reset - just close modal
        setModal({ ...modal, visible: false });
      }
      // Navigate back after edit
      if (isEditMode) {
        router.back();
      } else {
        router.replace("/(tabs)/" as any);
      }
    } else {
      setModal({ ...modal, visible: false });
    }
  };

  const getButtonLabel = (): string => {
    if (isCreating) {
      return isEditMode ? "Saving Changes..." : "Creating Event...";
    }
    if (isEditMode) {
      return "Save Changes";
    }
    if (eventContext && eventContext.level !== "club" && memberCount > 0) {
      return `Create Event (${memberCount} recipients)`;
    }
    return "Create Event";
  };

  const isButtonDisabled = (): boolean => {
    return isCreating || !eventData.title.trim() || !eventData.location.trim();
  };

  const getRecipientLabel = (): string => {
    if (selectedRoles.length === 0) return "All roles";
    if (selectedRoles.length === 1) {
      const role = selectedRoles[0];
      return role === "player-underage"
        ? "Youth Players"
        : role === "player"
          ? "Players"
          : role === "coach"
            ? "Coaches"
            : "Admins";
    }
    return `${selectedRoles.length} roles selected`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString();
  };

  const formatTime = (time: Date | string) => {
    if (typeof time === "string") {
      // Already in HH:mm format
      return time;
    }
    const hours = time.getHours().toString().padStart(2, "0");
    const minutes = time.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  // Check if group context is available (should always be true when navigating from manage-group)
  if (!eventContext) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
        >
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 16,
              textAlign: "center",
            }}
          >
            Error: No group context found. Please navigate from the manage-group
            screen.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              marginTop: 20,
              paddingHorizontal: 20,
              paddingVertical: 10,
              backgroundColor: theme.colors.secondary,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.inputBorder,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginRight: 16 }}
        >
          <FontAwesome name="arrow-left" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "bold",
            color: theme.colors.text,
          }}
        >
          {isEditMode ? "Edit Event" : "Create Event"}
        </Text>
      </View>

      {/* Show loading indicator while loading event data */}
      {isLoadingEvent ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 32,
          }}
        >
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={{ marginTop: 16, color: theme.colors.text }}>
            Loading event...
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1, padding: 16 }}>
          {/* Creation Mode Toggle */}
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: theme.colors.text,
                marginBottom: 12,
              }}
            >
              Creation Mode
            </Text>

            <View
              style={{
                flexDirection: "row",
                backgroundColor: theme.colors.inputBackground,
                borderRadius: 12,
                padding: 4,
                borderWidth: 1,
                borderColor: theme.colors.inputBorder,
              }}
            >
              {/* Simple Mode */}
              <TouchableOpacity
                onPress={() => {
                  setEventData((prev) => ({
                    ...prev,
                    mode: "simple",
                    // Reset advanced fields when switching to simple
                    gatheringTime: undefined,
                    capacity: { enabled: false, maxAttendees: undefined },
                    responseDeadline: { enabled: false, date: undefined },
                  }));
                }}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  backgroundColor:
                    eventData.mode === "simple"
                      ? theme.colors.secondary
                      : "transparent",
                }}
              >
                <FontAwesome
                  name="magic"
                  size={16}
                  color={
                    eventData.mode === "simple"
                      ? "white"
                      : theme.colors.textSecondary
                  }
                  style={{ marginRight: 8 }}
                />
                <View style={{ alignItems: "center" }}>
                  <Text
                    style={{
                      color:
                        eventData.mode === "simple"
                          ? "white"
                          : theme.colors.text,
                      fontWeight:
                        eventData.mode === "simple" ? "600" : "normal",
                      fontSize: 16,
                    }}
                  >
                    Simple
                  </Text>
                  <Text
                    style={{
                      color:
                        eventData.mode === "simple"
                          ? "white"
                          : theme.colors.textSecondary,
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    Quick setup
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Advanced Mode */}
              <TouchableOpacity
                onPress={() =>
                  setEventData((prev) => ({ ...prev, mode: "advanced" }))
                }
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  backgroundColor:
                    eventData.mode === "advanced"
                      ? theme.colors.secondary
                      : "transparent",
                }}
              >
                <FontAwesome
                  name="cogs"
                  size={16}
                  color={
                    eventData.mode === "advanced"
                      ? "white"
                      : theme.colors.textSecondary
                  }
                  style={{ marginRight: 8 }}
                />
                <View style={{ alignItems: "center" }}>
                  <Text
                    style={{
                      color:
                        eventData.mode === "advanced"
                          ? "white"
                          : theme.colors.text,
                      fontWeight:
                        eventData.mode === "advanced" ? "600" : "normal",
                      fontSize: 16,
                    }}
                  >
                    Advanced
                  </Text>
                  <Text
                    style={{
                      color:
                        eventData.mode === "advanced"
                          ? "white"
                          : theme.colors.textSecondary,
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    Full control
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Event Type Selector */}
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: theme.colors.text,
                marginBottom: 12,
              }}
            >
              Event Type *
            </Text>
            <View
              style={{
                flexDirection: "row",
                backgroundColor: theme.colors.inputBackground,
                borderRadius: 8,
                padding: 4,
                borderWidth: 1,
                borderColor: theme.colors.inputBorder,
              }}
            >
              {eventTypes.map((type) => (
                <TouchableOpacity
                  key={type.key}
                  onPress={() => {
                    setEventData((prev) => ({
                      ...prev,
                      type: type.key as any,
                      title: type.key === "other" ? "" : getAutoTitle(type.key),
                    }));
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 6,
                    backgroundColor:
                      eventData.type === type.key
                        ? theme.colors.secondary
                        : "transparent",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color:
                        eventData.type === type.key
                          ? "#1a1d21"
                          : theme.colors.textSecondary,
                      fontWeight:
                        eventData.type === type.key ? "600" : "normal",
                      fontSize: 15,
                    }}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Custom Event Title (only for "other" type) */}
          {eventData.type === "other" && (
            <View style={{ marginBottom: 20 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                  marginBottom: 8,
                }}
              >
                Event Title *
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.inputBorder,
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 16,
                  backgroundColor: theme.colors.inputBackground,
                  color: theme.colors.text,
                }}
                value={eventData.title}
                onChangeText={(text) =>
                  setEventData((prev) => ({ ...prev, title: text }))
                }
                placeholder="Enter custom event title"
                placeholderTextColor={theme.colors.textSecondary}
                maxLength={100}
              />
            </View>
          )}

          {/* Recipients Section */}
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: theme.colors.text,
                marginBottom: 8,
              }}
            >
              Recipients
            </Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: theme.colors.inputBorder,
                borderRadius: 8,
                padding: 12,
                backgroundColor: theme.colors.inputBackground,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <FontAwesome
                  name="users"
                  size={16}
                  color={theme.colors.textSecondary}
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={{ fontSize: 16, color: theme.colors.text, flex: 1 }}
                >
                  {eventContext.level === "subgroup"
                    ? eventContext.subgroupName
                    : eventContext.level === "group"
                      ? eventContext.groupName
                      : eventContext.clubName}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{ fontSize: 14, color: theme.colors.textSecondary }}
                >
                  {isLoadingMembers
                    ? "Loading..."
                    : `${memberCount} member${memberCount !== 1 ? "s" : ""}`}
                  {selectedRoles.length > 0 && ` (${getRecipientLabel()})`}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowRoleFilterModal(true)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 6,
                    backgroundColor:
                      selectedRoles.length > 0
                        ? theme.colors.secondary
                        : theme.colors.inputBorder,
                  }}
                >
                  <FontAwesome
                    name="filter"
                    size={14}
                    color={
                      selectedRoles.length > 0
                        ? "white"
                        : theme.colors.textSecondary
                    }
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "500",
                      color:
                        selectedRoles.length > 0 ? "white" : theme.colors.text,
                    }}
                  >
                    Filter Roles
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Start Date and Time */}
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                  marginBottom: 8,
                }}
              >
                Start Date
              </Text>
              <TouchableOpacity
                onPress={() => setShowStartDatePicker(true)}
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.inputBorder,
                  borderRadius: 8,
                  padding: 12,
                  backgroundColor: theme.colors.inputBackground,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: theme.colors.text, fontSize: 16 }}>
                  {formatDate(eventData.startDate)}
                </Text>
                <FontAwesome
                  name="calendar"
                  size={16}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                  marginBottom: 8,
                }}
              >
                Start Time
              </Text>
              <TouchableOpacity
                onPress={() => setShowStartTimePicker(true)}
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.inputBorder,
                  borderRadius: 8,
                  padding: 12,
                  backgroundColor: theme.colors.inputBackground,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: theme.colors.text, fontSize: 16 }}>
                  {formatTime(eventData.startTime)}
                </Text>
                <FontAwesome
                  name="clock-o"
                  size={16}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Duration (Simple Mode) */}
          {eventData.mode === "simple" && (
            <View style={{ marginBottom: 20 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                  marginBottom: 8,
                }}
              >
                Duration
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {[
                  { minutes: 60, label: "1 hour" },
                  { minutes: 90, label: "1.5 hours" },
                  { minutes: 120, label: "2 hours" },
                  { minutes: 180, label: "3 hours" },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.minutes}
                    onPress={() => {
                      // Update duration and automatically calculate end time
                      const newEndTime = new Date(eventData.startTime);
                      newEndTime.setMinutes(
                        newEndTime.getMinutes() + option.minutes,
                      );
                      const newEndDate = new Date(eventData.startDate);
                      if (
                        newEndTime.getDate() !== eventData.startTime.getDate()
                      ) {
                        newEndDate.setDate(newEndDate.getDate() + 1);
                      }
                      setEventData((prev) => ({
                        ...prev,
                        duration: option.minutes,
                        endTime: newEndTime,
                        endDate: newEndDate,
                      }));
                    }}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor:
                        eventData.duration === option.minutes
                          ? theme.colors.secondary
                          : theme.colors.inputBorder,
                      backgroundColor:
                        eventData.duration === option.minutes
                          ? theme.colors.secondary + "20"
                          : theme.colors.inputBackground,
                    }}
                  >
                    <Text
                      style={{
                        color:
                          eventData.duration === option.minutes
                            ? theme.colors.secondary
                            : theme.colors.textSecondary,
                        fontWeight:
                          eventData.duration === option.minutes
                            ? "600"
                            : "normal",
                        fontSize: 14,
                      }}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}

                {/* Custom Duration Input */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: theme.colors.inputBorder,
                    borderRadius: 20,
                    backgroundColor: theme.colors.inputBackground,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <TextInput
                    style={{
                      width: 50,
                      fontSize: 14,
                      color: theme.colors.text,
                      textAlign: "center",
                    }}
                    value={eventData.duration?.toString() || ""}
                    onChangeText={(text) => {
                      const minutes = parseInt(text) || 60;
                      const newEndTime = new Date(eventData.startTime);
                      newEndTime.setMinutes(newEndTime.getMinutes() + minutes);
                      const newEndDate = new Date(eventData.startDate);
                      if (
                        newEndTime.getDate() !== eventData.startTime.getDate()
                      ) {
                        newEndDate.setDate(newEndDate.getDate() + 1);
                      }
                      setEventData((prev) => ({
                        ...prev,
                        duration: minutes,
                        endTime: newEndTime,
                        endDate: newEndDate,
                      }));
                    }}
                    placeholder="120"
                    placeholderTextColor={theme.colors.textSecondary}
                    keyboardType="numeric"
                  />
                  <Text
                    style={{
                      color: theme.colors.textSecondary,
                      fontSize: 12,
                      marginLeft: 4,
                    }}
                  >
                    min
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Gathering Time (Optional) - Advanced Mode Only */}
          {eventData.mode === "advanced" && (
            <View style={{ marginBottom: 20 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                  marginBottom: 8,
                }}
              >
                Gathering Time (Optional)
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <TouchableOpacity
                    onPress={() =>
                      eventData.gatheringTime
                        ? setShowGatheringTimePicker(true)
                        : null
                    }
                    disabled={!eventData.gatheringTime}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.inputBorder,
                      borderRadius: 8,
                      padding: 12,
                      backgroundColor: eventData.gatheringTime
                        ? theme.colors.inputBackground
                        : theme.colors.inputBackground + "80",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      opacity: eventData.gatheringTime ? 1 : 0.6,
                    }}
                  >
                    <Text
                      style={{
                        color: eventData.gatheringTime
                          ? theme.colors.text
                          : theme.colors.textSecondary,
                        fontSize: 16,
                      }}
                    >
                      {eventData.gatheringTime
                        ? formatTime(eventData.gatheringTime)
                        : "No gathering time"}
                    </Text>
                    <FontAwesome
                      name="clock-o"
                      size={16}
                      color={
                        eventData.gatheringTime
                          ? theme.colors.textSecondary
                          : theme.colors.textSecondary + "80"
                      }
                    />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    if (eventData.gatheringTime) {
                      // Remove gathering time
                      setEventData((prev) => ({
                        ...prev,
                        gatheringTime: undefined,
                      }));
                    } else {
                      // Add gathering time (30 minutes before start time)
                      const tempTime = new Date(eventData.startTime);
                      tempTime.setMinutes(tempTime.getMinutes() - 30);
                      const hours = tempTime
                        .getHours()
                        .toString()
                        .padStart(2, "0");
                      const minutes = tempTime
                        .getMinutes()
                        .toString()
                        .padStart(2, "0");
                      const gatheringTime = `${hours}:${minutes}`;
                      setEventData((prev) => ({ ...prev, gatheringTime }));
                    }
                  }}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderRadius: 8,
                    backgroundColor: eventData.gatheringTime
                      ? theme.colors.error
                      : theme.colors.secondary,
                  }}
                >
                  <Text
                    style={{
                      color: "white",
                      fontWeight: "600",
                      fontSize: 14,
                    }}
                  >
                    {eventData.gatheringTime ? "Remove" : "Add"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* End Date and Time (Advanced Mode Only) */}
          {eventData.mode === "advanced" && (
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                marginBottom: 20,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: theme.colors.text,
                    marginBottom: 8,
                  }}
                >
                  End Date
                </Text>
                <TouchableOpacity
                  onPress={() => setShowEndDatePicker(true)}
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.inputBorder,
                    borderRadius: 8,
                    padding: 12,
                    backgroundColor: theme.colors.inputBackground,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontSize: 16 }}>
                    {formatDate(eventData.endDate)}
                  </Text>
                  <FontAwesome
                    name="calendar"
                    size={16}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: theme.colors.text,
                    marginBottom: 8,
                  }}
                >
                  End Time
                </Text>
                <TouchableOpacity
                  onPress={() => setShowEndTimePicker(true)}
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.inputBorder,
                    borderRadius: 8,
                    padding: 12,
                    backgroundColor: theme.colors.inputBackground,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontSize: 16 }}>
                    {formatTime(eventData.endTime)}
                  </Text>
                  <FontAwesome
                    name="clock-o"
                    size={16}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Location */}
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: theme.colors.text,
                marginBottom: 8,
              }}
            >
              Location *
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: theme.colors.inputBorder,
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
                backgroundColor: theme.colors.inputBackground,
                color: theme.colors.text,
              }}
              value={eventData.location}
              onChangeText={(text) =>
                setEventData((prev) => ({ ...prev, location: text }))
              }
              placeholder="Enter event location"
              placeholderTextColor={theme.colors.textSecondary}
              maxLength={200}
            />
          </View>

          {/* Description */}
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: theme.colors.text,
                marginBottom: 8,
              }}
            >
              Description
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: theme.colors.inputBorder,
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
                backgroundColor: theme.colors.inputBackground,
                color: theme.colors.text,
                height: 100,
                textAlignVertical: "top",
              }}
              value={eventData.description}
              onChangeText={(text) =>
                setEventData((prev) => ({ ...prev, description: text }))
              }
              placeholder="Enter event description (optional)"
              placeholderTextColor={theme.colors.textSecondary}
              multiline
              maxLength={500}
            />
          </View>

          {/* Capacity Management (Advanced Mode Only) */}
          {eventData.mode === "advanced" && (
            <View style={{ marginBottom: 20 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                  marginBottom: 8,
                }}
              >
                Capacity Limit
              </Text>

              {/* Enable/Disable Toggle */}
              <TouchableOpacity
                onPress={() =>
                  setEventData((prev) => ({
                    ...prev,
                    capacity: {
                      ...prev.capacity,
                      enabled: !prev.capacity.enabled,
                      maxAttendees: !prev.capacity.enabled ? 10 : undefined,
                    },
                  }))
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.inputBorder,
                  backgroundColor: theme.colors.inputBackground,
                  marginBottom: eventData.capacity.enabled ? 12 : 0,
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    borderWidth: 2,
                    borderColor: eventData.capacity.enabled
                      ? theme.colors.secondary
                      : theme.colors.inputBorder,
                    backgroundColor: eventData.capacity.enabled
                      ? theme.colors.secondary
                      : "transparent",
                    marginRight: 12,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {eventData.capacity.enabled && (
                    <FontAwesome name="check" size={12} color="white" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: 16,
                      fontWeight: "500",
                    }}
                  >
                    Limit number of attendees
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.textSecondary,
                      fontSize: 14,
                      marginTop: 2,
                    }}
                  >
                    Only first {eventData.capacity.maxAttendees || 10} members
                    who accept can attend
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Max Attendees Input */}
              {eventData.capacity.enabled && (
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "500",
                      color: theme.colors.text,
                      marginBottom: 8,
                    }}
                  >
                    Maximum Attendees
                  </Text>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.inputBorder,
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 16,
                      backgroundColor: theme.colors.inputBackground,
                      color: theme.colors.text,
                    }}
                    value={eventData.capacity.maxAttendees?.toString() || ""}
                    onChangeText={(text) => {
                      const number = parseInt(text) || undefined;
                      setEventData((prev) => ({
                        ...prev,
                        capacity: { ...prev.capacity, maxAttendees: number },
                      }));
                    }}
                    placeholder="e.g. 10"
                    placeholderTextColor={theme.colors.textSecondary}
                    keyboardType="numeric"
                  />
                </View>
              )}
            </View>
          )}

          {/* Response Deadline (Advanced Mode Only) */}
          {eventData.mode === "advanced" && (
            <View style={{ marginBottom: 20 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                  marginBottom: 8,
                }}
              >
                Response Deadline
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.textSecondary,
                  marginBottom: 12,
                }}
              >
                When should members respond by? Default is event start date.
              </Text>

              {/* Enable/Disable Custom Deadline Toggle */}
              <TouchableOpacity
                onPress={() =>
                  setEventData((prev) => ({
                    ...prev,
                    responseDeadline: {
                      ...prev.responseDeadline,
                      enabled: !prev.responseDeadline.enabled,
                      date: !prev.responseDeadline.enabled
                        ? (() => {
                            // Default to 1 day before start date when enabling
                            const deadline = new Date(prev.startDate);
                            deadline.setDate(deadline.getDate() - 1);
                            return deadline;
                          })()
                        : undefined,
                    },
                  }))
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.inputBorder,
                  backgroundColor: theme.colors.inputBackground,
                  marginBottom: eventData.responseDeadline.enabled ? 12 : 0,
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    borderWidth: 2,
                    borderColor: eventData.responseDeadline.enabled
                      ? theme.colors.secondary
                      : theme.colors.inputBorder,
                    backgroundColor: eventData.responseDeadline.enabled
                      ? theme.colors.secondary
                      : "transparent",
                    marginRight: 12,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {eventData.responseDeadline.enabled && (
                    <FontAwesome name="check" size={12} color="white" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: 16,
                      fontWeight: "500",
                    }}
                  >
                    Set custom response deadline
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.textSecondary,
                      fontSize: 14,
                      marginTop: 2,
                    }}
                  >
                    {eventData.responseDeadline.enabled
                      ? `Deadline: ${eventData.responseDeadline.date ? eventData.responseDeadline.date.toLocaleDateString() : "Select date"}`
                      : "Members can respond until event start date"}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Custom Deadline Date Picker */}
              {eventData.responseDeadline.enabled && (
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "500",
                      color: theme.colors.text,
                      marginBottom: 8,
                    }}
                  >
                    Deadline Date
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowResponseDeadlinePicker(true)}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.inputBorder,
                      borderRadius: 8,
                      padding: 12,
                      backgroundColor: theme.colors.inputBackground,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 12,
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontSize: 16 }}>
                      {eventData.responseDeadline.date
                        ? eventData.responseDeadline.date.toLocaleDateString()
                        : "Select deadline date"}
                    </Text>
                    <FontAwesome
                      name="calendar"
                      size={16}
                      color={theme.colors.textSecondary}
                    />
                  </TouchableOpacity>

                  {/* Deadline Time Picker */}
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "500",
                      color: theme.colors.text,
                      marginBottom: 8,
                    }}
                  >
                    Deadline Time
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowResponseDeadlineTimePicker(true)}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.inputBorder,
                      borderRadius: 8,
                      padding: 12,
                      backgroundColor: theme.colors.inputBackground,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontSize: 16 }}>
                      {eventData.responseDeadline.date
                        ? formatTime(eventData.responseDeadline.date)
                        : "Select deadline time"}
                    </Text>
                    <FontAwesome
                      name="clock-o"
                      size={16}
                      color={theme.colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* Bottom Action - outside loading conditional */}
      {!isLoadingEvent && (
        <View
          style={{
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: theme.colors.inputBorder,
            paddingBottom: Platform.OS === "ios" ? 34 : 16,
          }}
        >
          <Button
            label={getButtonLabel()}
            onPress={isEditMode ? handleUpdateEvent : handleCreateEvent}
            disabled={isButtonDisabled()}
          />
        </View>
      )}

      {/* Web Modal Overlay */}
      {Platform.OS === "web" &&
        (showStartDatePicker ||
          showStartTimePicker ||
          showGatheringTimePicker ||
          showEndDatePicker ||
          showEndTimePicker ||
          showResponseDeadlinePicker ||
          showResponseDeadlineTimePicker) && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              zIndex: 999,
            }}
          />
        )}

      {/* Start Date Picker */}
      <CustomDateTimePicker
        value={eventData.startDate}
        mode="date"
        isVisible={showStartDatePicker}
        onConfirm={(date) => {
          setEventData((prev) => ({ ...prev, startDate: date }));
          setShowStartDatePicker(false);
        }}
        onCancel={() => setShowStartDatePicker(false)}
        title="Select Start Date"
      />

      {/* Start Time Picker */}
      <CustomDateTimePicker
        value={eventData.startTime}
        mode="time"
        isVisible={showStartTimePicker}
        onConfirm={(time) => {
          setEventData((prev) => ({ ...prev, startTime: time }));
          setShowStartTimePicker(false);
        }}
        onCancel={() => setShowStartTimePicker(false)}
        title="Select Start Time"
      />

      {/* Gathering Time Picker */}
      <CustomDateTimePicker
        value={(() => {
          if (eventData.gatheringTime) {
            const [hours, minutes] = eventData.gatheringTime
              .split(":")
              .map(Number);
            const date = new Date();
            date.setHours(hours);
            date.setMinutes(minutes);
            return date;
          }
          return eventData.startTime;
        })()}
        mode="time"
        isVisible={showGatheringTimePicker}
        onConfirm={(time) => {
          // Extract hours and minutes and store as HH:mm string
          const hours = time.getHours().toString().padStart(2, "0");
          const minutes = time.getMinutes().toString().padStart(2, "0");
          const gatheringTime = `${hours}:${minutes}`;
          setEventData((prev) => ({
            ...prev,
            gatheringTime,
          }));
          setShowGatheringTimePicker(false);
        }}
        onCancel={() => setShowGatheringTimePicker(false)}
        title="Select Gathering Time"
      />

      {/* End Date Picker */}
      <CustomDateTimePicker
        value={eventData.endDate}
        mode="date"
        isVisible={showEndDatePicker}
        onConfirm={(date) => {
          setEventData((prev) => ({ ...prev, endDate: date }));
          setShowEndDatePicker(false);
        }}
        onCancel={() => setShowEndDatePicker(false)}
        title="Select End Date"
      />

      {/* End Time Picker */}
      <CustomDateTimePicker
        value={eventData.endTime}
        mode="time"
        isVisible={showEndTimePicker}
        onConfirm={(time) => {
          setEventData((prev) => ({ ...prev, endTime: time }));
          setShowEndTimePicker(false);
        }}
        onCancel={() => setShowEndTimePicker(false)}
        title="Select End Time"
      />

      {/* Response Deadline Date Picker */}
      <CustomDateTimePicker
        value={eventData.responseDeadline.date || eventData.startDate}
        mode="date"
        isVisible={showResponseDeadlinePicker}
        onConfirm={(date) => {
          setEventData((prev) => ({
            ...prev,
            responseDeadline: { ...prev.responseDeadline, date },
          }));
          setShowResponseDeadlinePicker(false);
        }}
        onCancel={() => setShowResponseDeadlinePicker(false)}
        title="Select Response Deadline"
      />

      {/* Response Deadline Time Picker */}
      <CustomDateTimePicker
        value={eventData.responseDeadline.date || eventData.startDate}
        mode="time"
        isVisible={showResponseDeadlineTimePicker}
        onConfirm={(time) => {
          setEventData((prev) => {
            // Combine the existing date with the new time
            const currentDate = prev.responseDeadline.date || prev.startDate;
            const newDate = new Date(currentDate);
            newDate.setHours(time.getHours());
            newDate.setMinutes(time.getMinutes());

            return {
              ...prev,
              responseDeadline: { ...prev.responseDeadline, date: newDate },
            };
          });
          setShowResponseDeadlineTimePicker(false);
        }}
        onCancel={() => setShowResponseDeadlineTimePicker(false)}
        title="Select Response Deadline Time"
      />

      {/* Role Filter Modal */}
      <RoleFilterModal
        visible={showRoleFilterModal}
        selectedRoles={selectedRoles}
        onApply={(roles) => setSelectedRoles(roles)}
        onClose={() => setShowRoleFilterModal(false)}
      />

      {/* Confirmation Modal */}
      <ConfirmationModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        confirmText="OK"
        cancelText=""
        onConfirm={handleModalClose}
        onCancel={handleModalClose}
        confirmButtonTheme="primary"
      />
    </SafeAreaView>
  );
}
