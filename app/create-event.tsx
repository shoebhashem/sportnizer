import { FontAwesome } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
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
import RoleFilterModal, { ClubRole } from "../components/RoleFilterModal";
import { theme } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";
import { useGroupData } from "../contexts/GroupDataContext";
import { useUser } from "../contexts/UserContext";
import { eventCreationService } from "../services/event/createEvent";
import { getEventDetails } from "../services/event/eventService";
import { recurringEventService } from "../services/event/recurringEvent";

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
  const { t } = useTranslation(["screens", "common"]);
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const { userProfile } = useUser();
  const { getGroupMembers, getSubgroupMembers } = useGroupData();

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
      // Initialize endDate to match startDate (same day)
      return new Date();
    })(),
    endTime: (() => {
      // Initialize endTime based on startTime + default duration (120 min)
      const time = new Date();
      time.setMinutes(time.getMinutes() + 120);
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

  const [selectedRoles, setSelectedRoles] = useState<ClubRole[]>([]);
  // Use memberCount from params if present, else default to 0
  const initialMemberCount =
    typeof params.memberCount === "string"
      ? parseInt(params.memberCount, 10)
      : typeof params.memberCount === "number"
        ? params.memberCount
        : 0;
  const [memberCount, setMemberCount] = useState<number>(initialMemberCount);
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

  // Recurring event state
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<
    "weekly" | "biweekly" | "monthly"
  >("weekly");
  const [recurringEndType, setRecurringEndType] = useState<
    "date" | "occurrences"
  >("date");
  const [recurringEndDate, setRecurringEndDate] = useState<Date>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3); // Default: 3 months from now
    return d;
  });
  const [recurringOccurrenceCount, setRecurringOccurrenceCount] =
    useState<number>(10);
  const [showRecurringEndDatePicker, setShowRecurringEndDatePicker] =
    useState(false);

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
          title: t("common:error"),
          message: t("screens:createEvent.eventNotFound"),
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
            title: t("screens:createEvent.eventEnded"),
            message: t("screens:createEvent.eventEndedMessage"),
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
        title: t("common:error"),
        message: t("screens:createEvent.failedToLoadEvent"),
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

      let members: any[] = [];
      if (
        eventContext.level === "subgroup" &&
        eventContext.groupId &&
        eventContext.subgroupId
      ) {
        // Get subgroup members from context
        members = getSubgroupMembers(
          eventContext.clubId,
          eventContext.groupId,
          eventContext.subgroupId,
        );
      } else if (eventContext.groupId) {
        // Get group members from context
        members = getGroupMembers(eventContext.clubId, eventContext.groupId);
      }

      let filteredMembers = members;

      // Apply role filter if active
      if (selectedRoles.length > 0) {
        filteredMembers = members.filter((member) =>
          member.roles?.some((role: string) =>
            selectedRoles.includes(role as ClubRole),
          ),
        );
      }

      setMemberCount(filteredMembers.length);
    } catch (error) {
      console.error("Error loading member count:", error);
    } finally {
      setIsLoadingMembers(false);
    }
  }, [eventContext, selectedRoles, getGroupMembers, getSubgroupMembers]);

  // Load member count on mount
  useEffect(() => {
    // Only load member count if not passed from parent
    if (eventContext && initialMemberCount === 0) {
      loadMemberCount();
    }
  }, [eventContext, loadMemberCount, initialMemberCount]);

  const eventTypes = [
    { key: "practice", label: t("common:training"), icon: "dribbble" },
    { key: "game", label: t("common:match"), icon: "trophy" },
    { key: "other", label: t("common:other"), icon: "calendar" },
  ];

  // Auto-generate title for Training and Match events
  const getAutoTitle = (type: string) => {
    if (type === "practice") return "Training";
    if (type === "game") return "Match";
    return "";
  };

  const validateEventData = (): boolean => {
    // Title is required for all event types
    if (!eventData.title.trim()) {
      setModal({
        visible: true,
        title: t("common:validation.missingInformation"),
        message: t("screens:createEvent.errors.titleRequired"),
        type: "error",
      });
      return false;
    }

    if (!eventData.location.trim()) {
      setModal({
        visible: true,
        title: t("common:validation.missingInformation"),
        message: t("screens:createEvent.errors.locationRequired"),
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
        title: t("screens:createEvent.errors.invalidTime"),
        message: t("screens:createEvent.errors.endBeforeStart"),
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
          title: t("screens:createEvent.errors.invalidTime"),
          message: t("screens:createEvent.errors.startInPast"),
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
          title: t("screens:createEvent.errors.invalidTime"),
          message: t("screens:createEvent.errors.gatheringAfterStart"),
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
          title: t("screens:createEvent.errors.invalidDeadline"),
          message: t("screens:createEvent.errors.deadlineAfterStart"),
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
        gatheringTime: eventData.gatheringTime
          ? (() => {
              // Parse HH:mm and combine with event start date (in local timezone)
              const [hours, minutes] = eventData.gatheringTime
                .split(":")
                .map(Number);
              const gatheringDateTime = new Date(eventData.startDate);
              gatheringDateTime.setHours(hours);
              gatheringDateTime.setMinutes(minutes);
              gatheringDateTime.setSeconds(0);
              gatheringDateTime.setMilliseconds(0);
              return gatheringDateTime.toISOString();
            })()
          : undefined,
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
        createdByName:
          userProfile?.displayName ||
          user.displayName ||
          user.email ||
          "Unknown",
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
      if (isRecurring) {
        // Create recurring event series
        const recurringRequest = {
          ...request,
          frequency: recurringFrequency,
          endType: recurringEndType,
          ...(recurringEndType === "date" && {
            seriesEndDate: recurringEndDate.toISOString(),
          }),
          ...(recurringEndType === "occurrences" && {
            occurrenceCount: recurringOccurrenceCount,
          }),
        };

        console.log("📅 Creating recurring event:", {
          frequency: recurringFrequency,
          endType: recurringEndType,
          ...(recurringEndType === "date" && {
            seriesEndDate: recurringEndDate.toISOString(),
          }),
          ...(recurringEndType === "occurrences" && {
            occurrenceCount: recurringOccurrenceCount,
          }),
        });

        const result =
          await recurringEventService.createRecurringEvent(recurringRequest);

        if (!result.success) {
          throw new Error(result.error || "Failed to create recurring event");
        }

        // Show success message
        setModal({
          visible: true,
          title: t("screens:createEvent.eventCreated"),
          message: t("screens:createEvent.recurringEventCreatedMessage", {
            title: eventData.title,
            count: result.totalOccurrences,
            recipients: result.totalRecipients,
          }),
          type: "success",
        });
      } else {
        // Create single event
        const result = await eventCreationService.createEvent(request);

        if (!result.success) {
          throw new Error(result.error || "Failed to create event");
        }

        // Show success message
        setModal({
          visible: true,
          title: t("screens:createEvent.eventCreated"),
          message: t("screens:createEvent.eventCreatedMessage", {
            title: eventData.title,
            count: result.totalRecipients,
          }),
          type: "success",
        });
      }
    } catch (error) {
      console.error("Error creating event:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      setModal({
        visible: true,
        title: t("screens:createEvent.creationFailed"),
        message: t("screens:createEvent.creationFailedMessage", {
          error: errorMessage,
        }),
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
        gatheringTime: eventData.gatheringTime
          ? (() => {
              // Parse HH:mm and combine with event start date (in local timezone)
              const [hours, minutes] = eventData.gatheringTime
                .split(":")
                .map(Number);
              const gatheringDateTime = new Date(eventData.startDate);
              gatheringDateTime.setHours(hours);
              gatheringDateTime.setMinutes(minutes);
              gatheringDateTime.setSeconds(0);
              gatheringDateTime.setMilliseconds(0);
              return gatheringDateTime.toISOString();
            })()
          : null,
        capacityLimit: eventData.capacity.enabled
          ? eventData.capacity.maxAttendees
          : null,
        responseDeadline:
          eventData.responseDeadline.enabled && eventData.responseDeadline.date
            ? eventData.responseDeadline.date.toISOString()
            : null,
      };

      // Call update service
      const { functions } = await import("../services/core/firebase");
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
        title: t("screens:createEvent.eventUpdated"),
        message: t("screens:createEvent.eventUpdatedMessage", {
          title: eventData.title,
        }),
        type: "success",
      });
    } catch (error) {
      console.error("Error updating event:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      setModal({
        visible: true,
        title: t("screens:createEvent.updateFailed"),
        message: t("screens:createEvent.updateFailedMessage", {
          error: errorMessage,
        }),
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
            // Initialize endDate to match startDate (same day)
            return new Date();
          })(),
          endTime: (() => {
            // Initialize endTime based on startTime + default duration (120 min)
            const time = new Date();
            time.setMinutes(time.getMinutes() + 120);
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
      if (isEditMode) return t("screens:createEvent.savingChanges");
      if (isRecurring) return t("screens:createEvent.creatingRecurringEvent");
      return t("screens:createEvent.creatingEvent");
    }
    if (isEditMode) {
      return t("screens:createEvent.saveChanges");
    }
    if (isRecurring) {
      return t("screens:createEvent.createRecurringEvent", {
        count: getEstimatedOccurrences(),
      });
    }
    if (eventContext && eventContext.level !== "club" && memberCount > 0) {
      return t("screens:createEvent.createEventWithRecipients", {
        count: memberCount,
      });
    }
    return t("screens:createEvent.createEvent");
  };

  const isButtonDisabled = (): boolean => {
    return isCreating || !eventData.title.trim() || !eventData.location.trim();
  };

  const getRecipientLabel = (): string => {
    if (selectedRoles.length === 0) return t("screens:createEvent.allRoles");
    if (selectedRoles.length === 1) {
      const role = selectedRoles[0];
      return role === "player-underage"
        ? t("common:youthPlayers")
        : role === "player"
          ? t("common:players")
          : role === "coach"
            ? t("common:coaches")
            : t("common:admins");
    }
    return t("screens:createEvent.rolesSelected", {
      count: selectedRoles.length,
    });
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

  // Get day name from start date for recurring events
  const getDayName = (date: Date): string => {
    return date.toLocaleDateString(undefined, { weekday: "long" });
  };

  // Calculate estimated occurrence count for display
  const getEstimatedOccurrences = (): number => {
    if (recurringEndType === "occurrences") return recurringOccurrenceCount;
    const startMs = eventData.startDate.getTime();
    const endMs = recurringEndDate.getTime();
    const diffMs = endMs - startMs;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    switch (recurringFrequency) {
      case "weekly":
        return Math.max(1, Math.floor(diffDays / 7) + 1);
      case "biweekly":
        return Math.max(1, Math.floor(diffDays / 14) + 1);
      case "monthly":
        return Math.max(1, Math.floor(diffDays / 30) + 1);
    }
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
            <Text style={{ color: "white", fontWeight: "600" }}>
              {t("common:goBack")}
            </Text>
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
          {isEditMode
            ? t("screens:createEvent.editEvent")
            : t("screens:createEvent.createEvent")}
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
            {t("screens:createEvent.loadingEvent")}
          </Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
          enabled={Platform.OS !== "web"}
        >
          <ScrollView
            style={{ flex: 1, padding: 16 }}
            contentContainerStyle={{ paddingBottom: 100 }}
            keyboardShouldPersistTaps="handled"
          >
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
                {t("screens:createEvent.creationMode")}
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
                      {t("screens:createEvent.simpleMode")}
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
                      {t("screens:createEvent.quickSetup")}
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
                      {t("screens:createEvent.advancedMode")}
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
                      {t("screens:createEvent.fullControl")}
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
                {t("screens:createEvent.eventType")}
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
                        title:
                          type.key === "other" ? "" : getAutoTitle(type.key),
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

            {/* Event Title */}
            <View style={{ marginBottom: 20 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                  marginBottom: 8,
                }}
              >
                {t("screens:createEvent.eventTitle")}
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
                placeholder={t("screens:createEvent.eventTitlePlaceholder")}
                placeholderTextColor={theme.colors.textSecondary}
                maxLength={100}
              />
            </View>

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
                {t("screens:createEvent.recipients")}
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
                          selectedRoles.length > 0
                            ? "white"
                            : theme.colors.text,
                      }}
                    >
                      {t("screens:createEvent.filterRoles")}
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
                  {t("screens:createEvent.startDate")}
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
                  {t("screens:createEvent.startTime")}
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
                  {t("screens:createEvent.duration")}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  {[
                    {
                      minutes: 60,
                      label: t("screens:createEvent.duration1Hour"),
                    },
                    {
                      minutes: 90,
                      label: t("screens:createEvent.duration1_5Hours"),
                    },
                    {
                      minutes: 120,
                      label: t("screens:createEvent.duration2Hours"),
                    },
                    {
                      minutes: 180,
                      label: t("screens:createEvent.duration3Hours"),
                    },
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
                        newEndTime.setMinutes(
                          newEndTime.getMinutes() + minutes,
                        );
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
                      {t("screens:createEvent.min")}
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
                  {t("screens:createEvent.gatheringTimeOptional")}
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
                          : t("screens:createEvent.noGatheringTime")}
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
                      {eventData.gatheringTime
                        ? t("common:remove")
                        : t("common:add")}
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
                    {t("screens:createEvent.endDate")}
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
                    {t("screens:createEvent.endTime")}
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
                {t("screens:createEvent.locationRequired")}
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
                placeholder={t("screens:createEvent.locationPlaceholder")}
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
                {t("screens:createEvent.descriptionLabel")}
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
                placeholder={t("screens:createEvent.descriptionPlaceholder")}
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
                  {t("screens:createEvent.capacityLimit")}
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
                      {t("screens:createEvent.limitNumberOfAttendees")}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.textSecondary,
                        fontSize: 14,
                        marginTop: 2,
                      }}
                    >
                      {t("screens:createEvent.onlyFirstNMembers", {
                        count: eventData.capacity.maxAttendees || 10,
                      })}
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
                      {t("screens:createEvent.maximumAttendees")}
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
                  {t("screens:createEvent.responseDeadline")}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: theme.colors.textSecondary,
                    marginBottom: 12,
                  }}
                >
                  {t("screens:createEvent.responseDeadlineHint")}
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
                      {t("screens:createEvent.setCustomDeadline")}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.textSecondary,
                        fontSize: 14,
                        marginTop: 2,
                      }}
                    >
                      {eventData.responseDeadline.enabled
                        ? `${t("screens:createEvent.deadlineDate")}: ${eventData.responseDeadline.date ? eventData.responseDeadline.date.toLocaleDateString() : t("screens:createEvent.deadlineSelectDate")}`
                        : t("screens:createEvent.membersCanRespondUntilStart")}
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
                      {t("screens:createEvent.deadlineDate")}
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
                          : t("screens:createEvent.deadlineSelectDate")}
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
                      {t("screens:createEvent.deadlineTime")}
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
                          : t("screens:createEvent.deadlineSelectTime")}
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

            {/* ============================================================ */}
            {/* Recurring Event Section (Advanced mode, Create only) */}
            {/* ============================================================ */}
            {eventData.mode === "advanced" && !isEditMode && (
              <View style={{ marginBottom: 20, marginTop: 4 }}>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: theme.colors.text,
                    marginBottom: 8,
                  }}
                >
                  {t("screens:createEvent.recurringEvent")}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: theme.colors.textSecondary,
                    marginBottom: 12,
                  }}
                >
                  {t("screens:createEvent.recurringEventHint")}
                </Text>

                {/* Enable/Disable Recurring Toggle */}
                <TouchableOpacity
                  onPress={() => setIsRecurring(!isRecurring)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: theme.colors.inputBorder,
                    backgroundColor: theme.colors.inputBackground,
                    marginBottom: isRecurring ? 16 : 0,
                  }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      borderWidth: 2,
                      borderColor: isRecurring
                        ? theme.colors.secondary
                        : theme.colors.inputBorder,
                      backgroundColor: isRecurring
                        ? theme.colors.secondary
                        : "transparent",
                      marginRight: 12,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isRecurring && (
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
                      {t("screens:createEvent.enableRecurring")}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.textSecondary,
                        fontSize: 14,
                        marginTop: 2,
                      }}
                    >
                      {isRecurring
                        ? t("screens:createEvent.recurringEnabled")
                        : t("screens:createEvent.recurringDisabled")}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Recurring Options (shown when enabled) */}
                {isRecurring && (
                  <View>
                    {/* Day derived from start date */}
                    <View
                      style={{
                        backgroundColor: theme.colors.inputBackground,
                        borderRadius: 8,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: theme.colors.inputBorder,
                        marginBottom: 16,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <FontAwesome
                        name="calendar"
                        size={16}
                        color={theme.colors.secondary}
                        style={{ marginRight: 10 }}
                      />
                      <Text style={{ color: theme.colors.text, fontSize: 15 }}>
                        {t("screens:createEvent.recurringDay", {
                          day: getDayName(eventData.startDate),
                        })}
                      </Text>
                    </View>

                    {/* Frequency Selector - Pill Toggle */}
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "500",
                        color: theme.colors.text,
                        marginBottom: 8,
                      }}
                    >
                      {t("screens:createEvent.frequency")}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        backgroundColor: theme.colors.inputBackground,
                        borderRadius: 8,
                        padding: 4,
                        borderWidth: 1,
                        borderColor: theme.colors.inputBorder,
                        marginBottom: 16,
                      }}
                    >
                      {(
                        [
                          {
                            key: "weekly",
                            label: t("screens:createEvent.weekly"),
                          },
                          {
                            key: "biweekly",
                            label: t("screens:createEvent.biweekly"),
                          },
                          {
                            key: "monthly",
                            label: t("screens:createEvent.monthly"),
                          },
                        ] as const
                      ).map((freq) => (
                        <TouchableOpacity
                          key={freq.key}
                          onPress={() => setRecurringFrequency(freq.key)}
                          style={{
                            flex: 1,
                            paddingVertical: 10,
                            borderRadius: 6,
                            backgroundColor:
                              recurringFrequency === freq.key
                                ? theme.colors.secondary
                                : "transparent",
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{
                              color:
                                recurringFrequency === freq.key
                                  ? "#1a1d21"
                                  : theme.colors.textSecondary,
                              fontWeight:
                                recurringFrequency === freq.key
                                  ? "600"
                                  : "normal",
                              fontSize: 14,
                            }}
                          >
                            {freq.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* End Condition Selector - Pill Toggle */}
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "500",
                        color: theme.colors.text,
                        marginBottom: 8,
                      }}
                    >
                      {t("screens:createEvent.endCondition")}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        backgroundColor: theme.colors.inputBackground,
                        borderRadius: 8,
                        padding: 4,
                        borderWidth: 1,
                        borderColor: theme.colors.inputBorder,
                        marginBottom: 16,
                      }}
                    >
                      {(
                        [
                          {
                            key: "date",
                            label: t("screens:createEvent.endByDate"),
                          },
                          {
                            key: "occurrences",
                            label: t("screens:createEvent.endByCount"),
                          },
                        ] as const
                      ).map((endOpt) => (
                        <TouchableOpacity
                          key={endOpt.key}
                          onPress={() => setRecurringEndType(endOpt.key)}
                          style={{
                            flex: 1,
                            paddingVertical: 10,
                            borderRadius: 6,
                            backgroundColor:
                              recurringEndType === endOpt.key
                                ? theme.colors.secondary
                                : "transparent",
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{
                              color:
                                recurringEndType === endOpt.key
                                  ? "#1a1d21"
                                  : theme.colors.textSecondary,
                              fontWeight:
                                recurringEndType === endOpt.key
                                  ? "600"
                                  : "normal",
                              fontSize: 14,
                            }}
                          >
                            {endOpt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* End Date Picker */}
                    {recurringEndType === "date" && (
                      <View style={{ marginBottom: 12 }}>
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "500",
                            color: theme.colors.text,
                            marginBottom: 8,
                          }}
                        >
                          {t("screens:createEvent.seriesEndDate")}
                        </Text>
                        <TouchableOpacity
                          onPress={() => setShowRecurringEndDatePicker(true)}
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
                          <Text
                            style={{ color: theme.colors.text, fontSize: 16 }}
                          >
                            {formatDate(recurringEndDate)}
                          </Text>
                          <FontAwesome
                            name="calendar"
                            size={16}
                            color={theme.colors.textSecondary}
                          />
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Occurrence Count Input */}
                    {recurringEndType === "occurrences" && (
                      <View style={{ marginBottom: 12 }}>
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "500",
                            color: theme.colors.text,
                            marginBottom: 8,
                          }}
                        >
                          {t("screens:createEvent.numberOfOccurrences")}
                        </Text>
                        <TextInput
                          value={recurringOccurrenceCount.toString()}
                          onChangeText={(text) => {
                            const num = parseInt(text, 10);
                            if (!isNaN(num) && num >= 2 && num <= 52) {
                              setRecurringOccurrenceCount(num);
                            } else if (text === "") {
                              setRecurringOccurrenceCount(2);
                            }
                          }}
                          keyboardType="number-pad"
                          style={{
                            borderWidth: 1,
                            borderColor: theme.colors.inputBorder,
                            borderRadius: 8,
                            padding: 12,
                            backgroundColor: theme.colors.inputBackground,
                            color: theme.colors.text,
                            fontSize: 16,
                          }}
                          placeholder="2-52"
                          placeholderTextColor={theme.colors.textSecondary}
                        />
                        <Text
                          style={{
                            fontSize: 12,
                            color: theme.colors.textSecondary,
                            marginTop: 4,
                          }}
                        >
                          {t("screens:createEvent.occurrenceRange")}
                        </Text>
                      </View>
                    )}

                    {/* Summary */}
                    <View
                      style={{
                        backgroundColor: theme.colors.inputBackground,
                        borderRadius: 8,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: theme.colors.secondary,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <FontAwesome
                        name="repeat"
                        size={16}
                        color={theme.colors.secondary}
                        style={{ marginRight: 10 }}
                      />
                      <Text
                        style={{
                          color: theme.colors.text,
                          fontSize: 14,
                          flex: 1,
                        }}
                      >
                        {t("screens:createEvent.recurringSummary", {
                          count: getEstimatedOccurrences(),
                          frequency: t(
                            `screens:createEvent.${recurringFrequency}`,
                          ).toLowerCase(),
                          day: getDayName(eventData.startDate),
                        })}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
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
          showResponseDeadlineTimePicker ||
          showRecurringEndDatePicker) && (
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
          setEventData((prev) => {
            // In simple mode with duration: recalculate end date/time
            if (prev.mode === "simple" && prev.duration) {
              const newEndTime = new Date(prev.startTime);
              newEndTime.setMinutes(newEndTime.getMinutes() + prev.duration);

              const newEndDate = new Date(date);
              // Check if end time rolls over to next day
              if (newEndTime.getDate() !== prev.startTime.getDate()) {
                newEndDate.setDate(newEndDate.getDate() + 1);
              }

              return {
                ...prev,
                startDate: date,
                endDate: newEndDate,
                endTime: newEndTime,
              };
            }

            // In advanced mode: sync endDate to match startDate (preserve time offset)
            const timeDiff = prev.endDate.getTime() - prev.startDate.getTime();
            const newEndDate = new Date(date.getTime() + timeDiff);

            return {
              ...prev,
              startDate: date,
              endDate: newEndDate,
            };
          });
          setShowStartDatePicker(false);
        }}
        onCancel={() => setShowStartDatePicker(false)}
        title={t("screens:createEvent.selectStartDate")}
      />

      {/* Start Time Picker */}
      <CustomDateTimePicker
        value={eventData.startTime}
        mode="time"
        isVisible={showStartTimePicker}
        onConfirm={(time) => {
          setEventData((prev) => {
            // In simple mode with duration: recalculate end date/time
            if (prev.mode === "simple" && prev.duration) {
              const newEndTime = new Date(time);
              newEndTime.setMinutes(newEndTime.getMinutes() + prev.duration);

              const newEndDate = new Date(prev.startDate);
              // Check if end time rolls over to next day
              if (newEndTime.getDate() !== time.getDate()) {
                newEndDate.setDate(newEndDate.getDate() + 1);
              }

              return {
                ...prev,
                startTime: time,
                endDate: newEndDate,
                endTime: newEndTime,
              };
            }

            // Advanced mode: just update start time
            return { ...prev, startTime: time };
          });
          setShowStartTimePicker(false);
        }}
        onCancel={() => setShowStartTimePicker(false)}
        title={t("screens:createEvent.selectStartTime")}
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
        title={t("screens:createEvent.selectGatheringTime")}
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
        title={t("screens:createEvent.selectEndDate")}
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
        title={t("screens:createEvent.selectEndTime")}
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
        title={t("screens:createEvent.selectResponseDeadline")}
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
        title={t("screens:createEvent.selectResponseDeadlineTime")}
      />

      {/* Recurring End Date Picker */}
      <CustomDateTimePicker
        mode="date"
        isVisible={showRecurringEndDatePicker}
        value={recurringEndDate}
        onConfirm={(date: Date) => {
          setRecurringEndDate(date);
          setShowRecurringEndDatePicker(false);
        }}
        onCancel={() => setShowRecurringEndDatePicker(false)}
        title={t("screens:createEvent.selectSeriesEndDate")}
      />

      {/* Role Filter Modal */}
      <RoleFilterModal
        visible={showRoleFilterModal}
        selectedRoles={selectedRoles}
        onApply={(roles) => setSelectedRoles(roles)}
        onClose={() => setShowRoleFilterModal(false)}
        level={eventContext?.level}
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
