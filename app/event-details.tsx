// Event Details Screen - Show comprehensive event information
// Features: Event info, user response, responses list, edit button

import ConfirmationModal from "@/components/ConfirmationModal";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/contexts/UserContext";
import {
    recordEventAttendance,
    type AttendanceRecord,
} from "@/services/event/attendanceService";
import { eventCancellationService } from "@/services/event/cancelEvent";
import {
    getEventDetails,
    updateEventResponse,
} from "@/services/event/eventService";
import type { EventData } from "@/services/types/event";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ResponseTab = "accepted" | "declined" | "pending";

export default function EventDetailsScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { userProfile } = useUserProfile();
  const params = useLocalSearchParams();

  const eventId = params.eventId as string;
  const clubId = params.clubId as string;
  const inviteeUserId = params.inviteeUserId as string;
  const inviteeName = params.inviteeName as string;

  console.log("🔍 DEBUG [event-details.tsx] - Route Params:", {
    eventId,
    clubId,
    inviteeUserId,
    inviteeName,
    allParams: params,
  });

  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<ResponseTab>("accepted");
  const [selectedInvitee, setSelectedInvitee] = useState<{
    userId: string;
    userName: string;
    photoUrl?: string;
    status: "pending" | "accepted" | "declined";
    respondedBy?: string;
    respondedByName?: string;
  } | null>(null);
  const [responseSuccess, setResponseSuccess] = useState(false);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    visible: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Attendance recording state
  const [isRecordingAttendance, setIsRecordingAttendance] = useState(false);
  const [attendanceData, setAttendanceData] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [submittingAttendance, setSubmittingAttendance] = useState(false);

  // Cancel event state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  // Recurring event scope modals
  const [showCancelScopeModal, setShowCancelScopeModal] = useState(false);
  const [showEditScopeModal, setShowEditScopeModal] = useState(false);
  const [recurringScope, setRecurringScope] = useState<"single" | "future">(
    "single",
  );

  useEffect(() => {
    loadEventDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, clubId]);

  // Set dynamic header with edit button
  useLayoutEffect(() => {
    if (!event || !userProfile) {
      navigation.setOptions({
        headerRight: () => null,
      });
      return;
    }

    // Check if user can edit (inline logic to avoid dependency issues)
    let showEdit = false;
    if (event.createdBy === user?.uid) {
      showEdit = true;
    } else {
      const clubAccess = userProfile.clubAccess?.find(
        (ca) => ca.clubId === event.clubId,
      );
      if (clubAccess?.role === "club-admin") {
        showEdit = true;
      } else if (event.groupId && clubAccess?.groupAccess) {
        const groupAccess = clubAccess.groupAccess.find(
          (ga) => ga.groupId === event.groupId,
        );
        if (groupAccess?.roles.includes("coach")) {
          showEdit = true;
        }
      }
    }

    // Determine which header actions to show
    const canShowEdit = showEdit && event.status !== "cancelled";
    const canShowCancel =
      showEdit && event.status !== "cancelled" && event.status !== "completed";

    navigation.setOptions({
      headerRight: () =>
        canShowCancel || canShowEdit ? (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {canShowCancel && (
              <TouchableOpacity
                onPress={() => {
                  if (event?.isRecurring) {
                    setShowCancelScopeModal(true);
                  } else {
                    setShowCancelModal(true);
                  }
                }}
                style={{ padding: 8 }}
              >
                <Ionicons name="close-circle" size={24} color="#EF5350" />
              </TouchableOpacity>
            )}
            {canShowEdit && (
              <TouchableOpacity
                onPress={() => {
                  if (!event) return;
                  if (event.isRecurring) {
                    setShowEditScopeModal(true);
                  } else {
                    router.push({
                      pathname: "/create-event",
                      params: {
                        eventId: event.id,
                        clubId: event.clubId,
                        clubName: event.clubName,
                        groupId: event.groupId || undefined,
                        groupName: event.groupName || undefined,
                        mode: "edit",
                      },
                    } as any);
                  }
                }}
                style={{ marginRight: 8, padding: 8 }}
              >
                <Ionicons
                  name="create-outline"
                  size={24}
                  color={theme.colors.white}
                />
              </TouchableOpacity>
            )}
          </View>
        ) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, userProfile, navigation]);

  const loadEventDetails = async () => {
    if (!eventId || !clubId) {
      console.error("Missing eventId or clubId");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log("🔍 DEBUG [event-details.tsx] - Fetching event details:", {
        eventId,
        clubId,
      });
      const eventData = await getEventDetails(eventId, clubId);

      console.log("🔍 DEBUG [event-details.tsx] - Event data fetched:", {
        eventId: eventData?.id,
        clubId: eventData?.clubId,
        title: eventData?.title,
        hasData: !!eventData,
      });

      if (!eventData) {
        setConfirmModal({
          visible: true,
          title: t("common:error"),
          message: t("screens:eventDetails.eventNotFound"),
          onConfirm: () => {
            setConfirmModal({ ...confirmModal, visible: false });
            router.back();
          },
        });
        return;
      }

      setEvent(eventData);
    } catch (error) {
      console.error("Error loading event details:", error);
      setConfirmModal({
        visible: true,
        title: t("common:error"),
        message: t("screens:eventDetails.failedToLoad"),
        onConfirm: () => setConfirmModal({ ...confirmModal, visible: false }),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResponse = async (response: "accepted" | "declined") => {
    if (!event || !user || !targetUserId) return;

    try {
      setSubmitting(true);

      console.log(
        "🔍 DEBUG [event-details.tsx] - Calling updateEventResponse:",
        {
          eventId: event.id,
          clubId: event.clubId,
          userId: targetUserId,
          response,
          respondedBy: isCurrentUserInvitee ? undefined : user.uid,
        },
      );

      const success = await updateEventResponse(
        event.id,
        event.clubId,
        targetUserId,
        response,
        isCurrentUserInvitee ? undefined : user.uid,
      );

      if (success) {
        // Reload event details to show updated response
        await loadEventDetails();

        setConfirmModal({
          visible: true,
          title: t("common:success"),
          message:
            response === "accepted"
              ? t("screens:eventDetails.responseAccepted")
              : t("screens:eventDetails.responseDeclined"),
          onConfirm: () => {
            setConfirmModal({ ...confirmModal, visible: false });
            router.back();
          },
        });
      } else {
        setConfirmModal({
          visible: true,
          title: t("common:error"),
          message: t("screens:eventDetails.failedToUpdate"),
          onConfirm: () => setConfirmModal({ ...confirmModal, visible: false }),
        });
      }
    } catch (error: any) {
      console.error("Error updating response:", error);
      setConfirmModal({
        visible: true,
        title: t("common:error"),
        message: error.message || t("screens:eventDetails.failedToUpdate"),
        onConfirm: () => setConfirmModal({ ...confirmModal, visible: false }),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleInviteeResponse = async (
    inviteeUserId: string,
    response: "accepted" | "declined",
  ) => {
    if (!event || !user) return;

    try {
      setSubmitting(true);

      console.log(
        "🔍 DEBUG [event-details.tsx] - Admin/Coach responding for invitee:",
        {
          eventId: event.id,
          clubId: event.clubId,
          inviteeUserId,
          response,
          respondedBy: user.uid,
        },
      );

      const success = await updateEventResponse(
        event.id,
        event.clubId,
        inviteeUserId,
        response,
        user.uid, // Always pass respondedBy when responding for others
      );

      if (success) {
        // Reload event details to get fresh data
        await loadEventDetails();

        // Wait a brief moment for state to update, then fetch the updated invitee data
        setTimeout(() => {
          // Re-fetch the event to ensure we have the latest data
          getEventDetails(event.id, event.clubId).then((updatedEvent) => {
            if (updatedEvent) {
              // Find the updated invitee data
              const updatedInvitee = updatedEvent.responses?.find(
                (r) => r.userId === inviteeUserId,
              );

              if (updatedInvitee) {
                // Update the selected invitee with fresh data
                setSelectedInvitee({
                  userId: updatedInvitee.userId,
                  userName: updatedInvitee.userName,
                  photoUrl: updatedInvitee.photoUrl,
                  status: updatedInvitee.response as
                    | "pending"
                    | "accepted"
                    | "declined",
                  respondedBy: updatedInvitee.respondedBy,
                  respondedByName: updatedInvitee.respondedByName,
                });

                // Show success state
                setResponseSuccess(true);

                // Auto-close modal after 2 seconds
                setTimeout(() => {
                  setResponseSuccess(false);
                  setSelectedInvitee(null);
                }, 2000);
              }
            }
          });
        }, 100);
      } else {
        setConfirmModal({
          visible: true,
          title: t("common:error"),
          message: t("screens:eventDetails.failedToUpdate"),
          onConfirm: () => setConfirmModal({ ...confirmModal, visible: false }),
        });
      }
    } catch (error: any) {
      console.error("Error updating invitee response:", error);
      setConfirmModal({
        visible: true,
        title: t("common:error"),
        message: error.message || t("screens:eventDetails.failedToUpdate"),
        onConfirm: () => setConfirmModal({ ...confirmModal, visible: false }),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = () => {
    if (!event) return;
    router.push({
      pathname: "/create-event",
      params: {
        eventId: event.id,
        clubId: event.clubId,
        clubName: event.clubName,
        groupId: event.groupId || undefined,
        groupName: event.groupName || undefined,
        mode: "edit",
      },
    } as any);
  };

  const canEditEvent = () => {
    if (!event || !userProfile) return false;

    // Check if user is event creator
    if (event.createdBy === user?.uid) return true;

    // Check if user is admin or coach in the club
    const clubAccess = userProfile.clubAccess?.find(
      (ca) => ca.clubId === event.clubId,
    );

    if (!clubAccess) return false;

    // Check club-level role (club-admin)
    if (clubAccess.role === "club-admin") {
      return true;
    }

    // Check group-level roles (admin or coach)
    if (event.groupId && clubAccess.groupAccess) {
      const groupAccess = clubAccess.groupAccess.find(
        (ga) => ga.groupId === event.groupId,
      );

      if (
        groupAccess?.roles?.some(
          (role: string) =>
            role.toLowerCase() === "admin" || role.toLowerCase() === "coach",
        )
      ) {
        return true;
      }
    }

    return false;
  };

  const isEventFull = () => {
    if (!event || !event.capacity?.max) return false;
    const acceptedCount = event.responseSummary?.accepted || 0;
    return acceptedCount >= event.capacity.max;
  };

  const canRespondAfterDeadline = () => {
    if (!event || !userProfile) return false;

    const clubAccess = userProfile.clubAccess?.find(
      (ca) => ca.clubId === event.clubId,
    );

    if (!clubAccess) return false;

    // Club-admin can always respond after deadline
    if (clubAccess.role === "club-admin") {
      return true;
    }

    // Check if admin/coach in event's group
    if (event.groupId && clubAccess.groupAccess) {
      const groupAccess = clubAccess.groupAccess.find(
        (ga) => ga.groupId === event.groupId,
      );

      if (
        groupAccess?.roles?.some(
          (role: string) =>
            role.toLowerCase() === "admin" || role.toLowerCase() === "coach",
        )
      ) {
        return true;
      }
    }

    return false;
  };

  const getEventTypeColor = (eventType?: string) => {
    switch (eventType?.toLowerCase()) {
      case "training":
        return theme.colors.success;
      case "match":
        return theme.colors.error;
      case "meeting":
        return theme.colors.warning;
      default:
        return theme.colors.secondary;
    }
  };

  const getEventTypeIcon = (eventType?: string) => {
    switch (eventType?.toLowerCase()) {
      case "training":
        return "fitness" as const;
      case "match":
        return "trophy" as const;
      case "meeting":
        return "people" as const;
      default:
        return "calendar" as const;
    }
  };

  const getResponseColor = (status: "accepted" | "declined" | "pending") => {
    switch (status) {
      case "accepted":
        return theme.colors.success;
      case "declined":
        return theme.colors.error;
      case "pending":
        return theme.colors.warning;
    }
  };

  // Attendance Recording Functions
  const canRecordAttendance = () => {
    if (!event || !userProfile) return false;
    if (event.status === "completed") return false; // Cannot record if already completed

    const clubAccess = userProfile.clubAccess?.find(
      (ca) => ca.clubId === event.clubId,
    );

    if (!clubAccess) return false;

    // Check club-level role (club-admin)
    if (clubAccess.role === "club-admin") {
      return true;
    }

    // Check group-level roles (admin or coach)
    if (event.groupId && clubAccess.groupAccess) {
      const groupAccess = clubAccess.groupAccess.find(
        (ga) => ga.groupId === event.groupId,
      );

      if (
        groupAccess?.roles?.some(
          (role: string) =>
            role.toLowerCase() === "admin" || role.toLowerCase() === "coach",
        )
      ) {
        return true;
      }
    }

    return false;
  };

  // Check if event can be cancelled
  // Handle event cancellation
  const handleCancelEvent = async () => {
    if (!event || !user) return;

    setIsCancelling(true);
    try {
      const cancelRequest: any = {
        clubId: event.clubId,
        eventId: event.id,
        cancellationReason: cancellationReason.trim() || undefined,
      };

      // Add recurring parameters if this is a recurring event
      if (event.isRecurring && event.recurringEventId) {
        cancelRequest.recurringEventId = event.recurringEventId;
        cancelRequest.scope = recurringScope;
      }

      const result = await eventCancellationService.cancelEvent(cancelRequest);

      if (result.success) {
        setShowCancelModal(false);
        setCancellationReason("");

        // Reload event to show cancelled state
        await loadEventDetails();

        setConfirmModal({
          visible: true,
          title: t("screens:eventDetails.eventCancelled"),
          message: t("screens:eventDetails.eventCancelledMessage"),
          onConfirm: () => {
            setConfirmModal({ ...confirmModal, visible: false });
          },
        });
      } else {
        setConfirmModal({
          visible: true,
          title: t("common:error"),
          message:
            result.error || t("screens:eventDetails.failedToCancelEvent"),
          onConfirm: () => setConfirmModal({ ...confirmModal, visible: false }),
        });
      }
    } catch (error: any) {
      console.error("Error cancelling event:", error);
      setConfirmModal({
        visible: true,
        title: t("common:error"),
        message: error.message || t("screens:eventDetails.failedToCancelEvent"),
        onConfirm: () => setConfirmModal({ ...confirmModal, visible: false }),
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleStartRecording = () => {
    if (!event) return;

    // Initialize attendance data with accepted members pre-checked
    const initialAttendance = new Map<string, boolean>();
    event.responses?.forEach((response) => {
      // Pre-check members who accepted
      initialAttendance.set(response.userId, response.response === "accepted");
    });

    setAttendanceData(initialAttendance);
    setIsRecordingAttendance(true);
  };

  const handleCancelRecording = () => {
    setIsRecordingAttendance(false);
    setAttendanceData(new Map());
  };

  const handleToggleAttendance = (userId: string, attended: boolean) => {
    setAttendanceData((prev) => {
      const newMap = new Map(prev);
      newMap.set(userId, attended);
      return newMap;
    });
  };

  const handleCompleteEvent = () => {
    if (!event) return;

    const attendedCount = Array.from(attendanceData.values()).filter(
      (attended) => attended,
    ).length;
    const totalInvitees = event.responses?.length || 0;

    setConfirmModal({
      visible: true,
      title: t("screens:eventDetails.completeEventConfirm"),
      message: t("screens:eventDetails.completeEventMessage", {
        attended: attendedCount,
        total: totalInvitees,
      }),
      onConfirm: handleConfirmComplete,
    });
  };

  const handleConfirmComplete = async () => {
    if (!event || !user || !userProfile) return;

    try {
      setSubmittingAttendance(true);
      setConfirmModal({ ...confirmModal, visible: false });

      // Build attendance records array
      const attendanceRecords: AttendanceRecord[] = Array.from(
        attendanceData.entries(),
      ).map(([userId, attended]) => ({
        userId,
        attended,
      }));

      // Record attendance
      await recordEventAttendance(
        event.id,
        event.clubId,
        attendanceRecords,
        user.uid,
        userProfile.displayName || userProfile.name || "Coach",
      );

      // Reload event details
      await loadEventDetails();

      setIsRecordingAttendance(false);
      setAttendanceData(new Map());

      setConfirmModal({
        visible: true,
        title: t("common:success"),
        message: t("screens:eventDetails.attendanceRecordedSuccess"),
        onConfirm: () => {
          setConfirmModal({ ...confirmModal, visible: false });
        },
      });
    } catch (error: any) {
      console.error("Error recording attendance:", error);
      setConfirmModal({
        visible: true,
        title: t("common:error"),
        message: error.message || t("screens:eventDetails.failedToUpdate"),
        onConfirm: () => setConfirmModal({ ...confirmModal, visible: false }),
      });
    } finally {
      setSubmittingAttendance(false);
    }
  };

  const filteredResponses =
    event?.responses?.filter((r) => r.status === activeTab) || [];

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>
            {t("screens:eventDetails.loadingEvent")}
          </Text>
        </View>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Ionicons
            name="alert-circle-outline"
            size={64}
            color={theme.colors.error}
          />
          <Text style={styles.errorText}>
            {t("screens:eventDetails.eventNotFound")}
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>{t("common:goBack")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Use inviteeUserId if provided, otherwise fallback to current user
  const targetUserId = inviteeUserId || user?.uid;
  const isCurrentUserInvitee = !inviteeUserId || inviteeUserId === user?.uid;

  const userResponse = event.responses?.find((r) => r.userId === targetUserId);

  // Normalize userResponse to ensure status field exists (handle both status and response fields)
  const normalizedResponse = userResponse
    ? {
        ...userResponse,
        status: userResponse.status || userResponse.response || "pending",
      }
    : null;

  const isPastEvent = new Date(event.startDate).getTime() < Date.now();
  const isDeadlinePassed = event.responseDeadline
    ? new Date(event.responseDeadline).getTime() < Date.now()
    : false;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Event Header */}
        <View style={styles.eventHeader}>
          <View style={styles.eventTypeContainer}>
            <Ionicons
              name={getEventTypeIcon(event.eventType)}
              size={24}
              color="#1a1d21"
            />
            <Text style={styles.eventTypeText}>
              {event.eventType?.toUpperCase() || "EVENT"}
            </Text>
          </View>
          {event.description && (
            <TouchableOpacity
              onPress={() => setShowDescriptionModal(true)}
              activeOpacity={0.7}
            >
              <Text
                style={styles.eventDescription}
                numberOfLines={2}
                ellipsizeMode="clip"
              >
                {event.description}
              </Text>
              <Text style={[styles.eventDescription, { marginTop: 2 }]}>
                {t("screens:eventDetails.readMore")}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Cancelled Banner */}
        {event.status === "cancelled" && (
          <View style={styles.cancelledEventBanner}>
            <Ionicons name="close-circle" size={24} color="#fff" />
            <View style={styles.cancelledEventBannerContent}>
              <Text style={styles.cancelledEventBannerTitle}>
                {t("screens:eventDetails.eventIsCancelled")}
              </Text>
              {event.cancellationReason && (
                <Text style={styles.cancelledEventBannerReason}>
                  {t("screens:eventDetails.reason")}: {event.cancellationReason}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Recurring Event Badge */}
        {event.isRecurring && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "rgba(76, 175, 80, 0.15)",
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 8,
              marginHorizontal: 16,
              marginTop: 8,
            }}
          >
            <Ionicons name="repeat" size={18} color={theme.colors.secondary} />
            <Text
              style={{
                color: theme.colors.secondary,
                fontSize: 14,
                fontWeight: "500",
                marginLeft: 8,
              }}
            >
              {t("screens:eventDetails.recurringEvent")}
              {event.occurrenceIndex !== undefined &&
                ` (#${event.occurrenceIndex + 1})`}
            </Text>
            {event.isModified && (
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: 12,
                  marginLeft: 8,
                }}
              >
                ({t("screens:eventDetails.modified")})
              </Text>
            )}
          </View>
        )}

        {/* Event Info */}
        <View style={styles.section}>
          <View style={styles.infoRow}>
            <Ionicons
              name="calendar-outline"
              size={20}
              color={theme.colors.secondary}
            />
            <Text style={styles.infoText}>
              {format(event.startDate, "EEEE, MMMM d, yyyy")}
            </Text>
          </View>

          {/* Gathering Time (if exists) */}
          {event.gatheringTime &&
            typeof event.gatheringTime === "string" &&
            (() => {
              try {
                const date = new Date(event.gatheringTime);
                if (!isNaN(date.getTime())) {
                  return (
                    <View style={styles.infoRow}>
                      <Ionicons
                        name="people-outline"
                        size={20}
                        color={theme.colors.accent}
                      />
                      <Text
                        style={[
                          styles.infoText,
                          { color: theme.colors.accent },
                        ]}
                      >
                        {t("screens:eventDetails.gather", {
                          time: format(date, "HH:mm"),
                        })}
                      </Text>
                    </View>
                  );
                }
              } catch (e) {
                // Invalid date, skip rendering
              }
              return null;
            })()}

          {/* Start Time */}
          <View style={styles.infoRow}>
            <Ionicons
              name="time-outline"
              size={20}
              color={theme.colors.secondary}
            />
            <Text style={styles.infoText}>
              {t("screens:eventDetails.start", {
                time: format(event.startDate, "HH:mm"),
              })}
              {event.endDate &&
                (() => {
                  try {
                    const date =
                      typeof event.endDate === "string"
                        ? new Date(event.endDate)
                        : event.endDate;
                    if (!isNaN(date.getTime())) {
                      return ` - ${format(date, "HH:mm")}`;
                    }
                  } catch (e) {
                    // Invalid date, skip
                  }
                  return "";
                })()}
            </Text>
          </View>

          {event.location && (
            <View style={styles.infoRow}>
              <Ionicons
                name="location-outline"
                size={20}
                color={theme.colors.secondary}
              />
              <Text style={styles.infoText}>{event.location}</Text>
            </View>
          )}

          {event.deadline && (
            <View style={styles.infoRow}>
              <Ionicons
                name="alarm-outline"
                size={20}
                color={theme.colors.warning}
              />
              <Text style={styles.infoText}>
                Response deadline: {format(event.deadline, "MMM d, h:mm a")}
                {isDeadlinePassed && (
                  <Text style={styles.deadlineWarning}>
                    {" "}
                    ({t("screens:eventDetails.deadlinePassed")})
                  </Text>
                )}
              </Text>
            </View>
          )}

          {/* Capacity Info */}
          {event.capacity?.max && (
            <View style={styles.infoRow}>
              <Ionicons
                name="people-outline"
                size={20}
                color={
                  (event.responseSummary?.accepted || 0) >= event.capacity.max
                    ? "#F44336"
                    : theme.colors.secondary
                }
              />
              <Text
                style={[
                  styles.infoText,
                  (event.responseSummary?.accepted || 0) >=
                    event.capacity.max && {
                    color: "#F44336",
                    fontWeight: "600",
                  },
                ]}
              >
                {(event.responseSummary?.accepted || 0) >= event.capacity.max
                  ? t("screens:eventDetails.capacityFull", {
                      accepted: event.responseSummary?.accepted || 0,
                      max: event.capacity.max,
                    })
                  : t("screens:eventDetails.capacity", {
                      accepted: event.responseSummary?.accepted || 0,
                      max: event.capacity.max,
                    })}
              </Text>
            </View>
          )}

          {event.maxCapacity && !event.capacity?.max && (
            <View style={styles.infoRow}>
              <Ionicons
                name="people-outline"
                size={20}
                color={theme.colors.secondary}
              />
              <Text style={styles.infoText}>
                {t("screens:eventDetails.capacity", {
                  accepted: event.responseSummary?.accepted || 0,
                  max: event.maxCapacity,
                })}
              </Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Ionicons
              name="business-outline"
              size={20}
              color={theme.colors.secondary}
            />
            <Text style={styles.infoText}>
              {event.clubName}
              {event.groupName && ` • ${event.groupName}`}
              {event.subGroupName && ` • ${event.subGroupName}`}
            </Text>
          </View>
        </View>

        {/* User Response Section - Only show if user is in responses array and event is not cancelled */}
        {!isPastEvent && userResponse && event.status !== "cancelled" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {isCurrentUserInvitee
                ? t("screens:eventDetails.yourResponse")
                : t("screens:eventDetails.inviteeResponse", {
                    name: inviteeName,
                  })}
            </Text>

            {/* Capacity Display */}
            {event.capacity?.max && (
              <View style={styles.capacityInfo}>
                <Ionicons
                  name="people-outline"
                  size={18}
                  color={isEventFull() ? "#F44336" : theme.colors.secondary}
                />
                <Text
                  style={[
                    styles.capacityInfoText,
                    isEventFull() && {
                      color: "#F44336",
                      fontWeight: "600",
                    },
                  ]}
                >
                  {isEventFull()
                    ? t("screens:eventDetails.capacityFull", {
                        accepted: event.responseSummary?.accepted || 0,
                        max: event.capacity.max,
                      })
                    : t("screens:eventDetails.capacity", {
                        accepted: event.responseSummary?.accepted || 0,
                        max: event.capacity.max,
                      })}
                </Text>
              </View>
            )}

            {/* Capacity Warning */}
            {event.capacity?.max && (
              <View style={styles.capacityWarning}>
                <Ionicons
                  name="people-outline"
                  size={16}
                  color={
                    (event.responseSummary?.accepted || 0) >= event.capacity.max
                      ? "#F44336"
                      : theme.colors.secondary
                  }
                />
                <Text
                  style={[
                    styles.capacityText,
                    (event.responseSummary?.accepted || 0) >=
                      event.capacity.max && {
                      color: "#F44336",
                    },
                  ]}
                >
                  {(event.responseSummary?.accepted || 0) >= event.capacity.max
                    ? t("screens:eventDetails.limitedCapacityFull", {
                        max: event.capacity.max,
                        accepted: event.responseSummary?.accepted || 0,
                      })
                    : t("screens:eventDetails.limitedCapacity", {
                        max: event.capacity.max,
                        accepted: event.responseSummary?.accepted || 0,
                      })}
                </Text>
              </View>
            )}

            {/* Response Deadline Info */}
            {event.responseDeadline && (
              <View style={styles.deadlineInfo}>
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={
                    new Date(event.responseDeadline) < new Date()
                      ? "#F44336"
                      : theme.colors.secondary
                  }
                />
                <Text
                  style={[
                    styles.deadlineInfoText,
                    new Date(event.responseDeadline) < new Date() && {
                      color: "#F44336",
                    },
                  ]}
                >
                  Response deadline:{" "}
                  {format(
                    new Date(event.responseDeadline),
                    "MMM dd, yyyy h:mm a",
                  )}
                  {new Date(event.responseDeadline) < new Date() && " (Passed)"}
                </Text>
              </View>
            )}

            {normalizedResponse && (
              <View style={styles.currentResponseContainer}>
                <View
                  style={[
                    styles.currentResponseBadge,
                    {
                      backgroundColor: getResponseColor(
                        normalizedResponse.status,
                      ),
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      normalizedResponse.status === "accepted"
                        ? "checkmark-circle"
                        : normalizedResponse.status === "declined"
                          ? "close-circle"
                          : "time"
                    }
                    size={20}
                    color={theme.colors.white}
                  />
                  <Text style={styles.currentResponseText}>
                    {normalizedResponse.status.charAt(0).toUpperCase() +
                      normalizedResponse.status.slice(1)}
                  </Text>
                </View>

                {normalizedResponse.respondedBy &&
                  normalizedResponse.respondedBy !== user?.uid && (
                    <Text style={styles.guardianNote}>
                      Responded by:{" "}
                      {normalizedResponse.respondedByName || "Guardian"}
                    </Text>
                  )}
              </View>
            )}

            <View style={styles.responseButtons}>
              <TouchableOpacity
                style={[
                  styles.responseButton,
                  styles.acceptButton,
                  normalizedResponse?.status === "accepted" &&
                    styles.disabledButton,
                  isDeadlinePassed &&
                    !canRespondAfterDeadline() && { opacity: 0.5 },
                  isEventFull() &&
                    normalizedResponse?.status !== "accepted" && {
                      opacity: 0.5,
                      backgroundColor: "#999",
                    },
                ]}
                onPress={() => handleResponse("accepted")}
                disabled={
                  submitting ||
                  normalizedResponse?.status === "accepted" ||
                  (isDeadlinePassed && !canRespondAfterDeadline()) ||
                  (isEventFull() && normalizedResponse?.status !== "accepted")
                }
              >
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={theme.colors.white}
                />
                <Text style={styles.responseButtonText}>
                  {t("screens:eventDetails.accept")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.responseButton,
                  styles.declineButton,
                  normalizedResponse?.status === "declined" &&
                    styles.disabledButton,
                  isDeadlinePassed &&
                    !canRespondAfterDeadline() && { opacity: 0.5 },
                ]}
                onPress={() => handleResponse("declined")}
                disabled={
                  submitting ||
                  normalizedResponse?.status === "declined" ||
                  (isDeadlinePassed && !canRespondAfterDeadline())
                }
              >
                <Ionicons
                  name="close-circle"
                  size={20}
                  color={theme.colors.white}
                />
                <Text style={styles.responseButtonText}>
                  {t("screens:eventDetails.decline")}
                </Text>
              </TouchableOpacity>
            </View>

            {isDeadlinePassed && (
              <Text style={styles.deadlinePassedText}>
                {canRespondAfterDeadline()
                  ? t("screens:eventDetails.deadlinePassedSpecialAccess")
                  : t("screens:eventDetails.deadlinePassed")}
              </Text>
            )}
          </View>
        )}

        {/* Record Attendance Button (for admins/coaches) */}
        {canRecordAttendance() &&
          !isRecordingAttendance &&
          event.status !== "completed" &&
          event.status !== "cancelled" && (
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.recordAttendanceButton}
                onPress={handleStartRecording}
              >
                <Ionicons
                  name="checkbox-outline"
                  size={20}
                  color={theme.colors.white}
                />
                <Text style={styles.recordAttendanceButtonText}>
                  {t("screens:eventDetails.recordAttendance")}
                </Text>
              </TouchableOpacity>
            </View>
          )}

        {/* Recording Mode Actions */}
        {isRecordingAttendance && (
          <View style={styles.recordingActionsContainer}>
            <TouchableOpacity
              style={styles.cancelRecordingButton}
              onPress={handleCancelRecording}
              disabled={submittingAttendance}
            >
              <Text style={styles.cancelRecordingButtonText}>
                {t("screens:eventDetails.cancelRecording")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.completeEventButton,
                submittingAttendance && { opacity: 0.5 },
              ]}
              onPress={handleCompleteEvent}
              disabled={submittingAttendance}
            >
              {submittingAttendance ? (
                <ActivityIndicator color={theme.colors.white} size="small" />
              ) : (
                <>
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={theme.colors.white}
                  />
                  <Text style={styles.completeEventButtonText}>
                    Complete Event
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Event Completed - Attendance Summary */}
        {event.status === "completed" && (
          <View style={styles.section}>
            <View style={styles.attendanceSummaryCard}>
              <View style={styles.completedBadge}>
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={theme.colors.white}
                />
                <Text style={styles.completedBadgeText}>
                  {t("screens:eventDetails.attendanceCompleted")}
                </Text>
              </View>

              {event.completedByName && event.completedAt && (
                <Text style={styles.completedInfoText}>
                  Recorded by {event.completedByName} on{" "}
                  {format(
                    new Date(event.completedAt),
                    "MMM dd, yyyy 'at' h:mm a",
                  )}
                </Text>
              )}

              {/* Attendance Stats */}
              <View style={styles.attendanceStats}>
                <View style={styles.attendanceStatItem}>
                  <Ionicons
                    name="people"
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                  <Text style={styles.attendanceStatLabel}>
                    {t("screens:eventDetails.totalInvitees")}
                  </Text>
                  <Text style={styles.attendanceStatValue}>
                    {event.responses?.length || 0}
                  </Text>
                </View>
                <View style={styles.attendanceStatDivider} />
                <View style={styles.attendanceStatItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                  <Text style={styles.attendanceStatLabel}>
                    {t("screens:eventDetails.attendedCount")}
                  </Text>
                  <Text
                    style={[styles.attendanceStatValue, { color: "#4CAF50" }]}
                  >
                    {event.responseSummary?.attended || 0}
                  </Text>
                </View>
                <View style={styles.attendanceStatDivider} />
                <View style={styles.attendanceStatItem}>
                  <Ionicons name="close-circle" size={20} color="#F44336" />
                  <Text style={styles.attendanceStatLabel}>
                    {t("screens:eventDetails.absentCount")}
                  </Text>
                  <Text
                    style={[styles.attendanceStatValue, { color: "#F44336" }]}
                  >
                    {(event.responses?.length || 0) -
                      (event.responseSummary?.attended || 0)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Invitees List */}
        <View style={styles.section}>
          <View style={styles.inviteesHeader}>
            <Text style={styles.sectionTitle}>
              Invitees ({event.responses?.length || 0})
            </Text>
            {isRecordingAttendance && (
              <Text style={styles.recordingModeText}>✓ Check who attended</Text>
            )}
          </View>

          {event.responses && event.responses.length > 0 ? (
            <FlatList
              data={event.responses}
              scrollEnabled={false}
              keyExtractor={(item) => item.userId}
              renderItem={({ item }) => {
                // Normalize status field (handle both 'status' and 'response' fields)
                const statusValue = item.status || item.response || "pending";

                const statusColor =
                  statusValue === "accepted"
                    ? "#4CAF50"
                    : statusValue === "declined"
                      ? "#F44336"
                      : "#FFA726";

                const canClickInvitee =
                  !isRecordingAttendance &&
                  canRespondAfterDeadline() &&
                  event.status !== "completed";
                const isAttended = attendanceData.get(item.userId) || false;
                const actuallyAttended = item.actualAttendance === true;
                const wasMarkedAbsent = item.actualAttendance === false;

                const inviteeContent = (
                  <>
                    {/* Checkbox for recording mode */}
                    {isRecordingAttendance && (
                      <TouchableOpacity
                        style={styles.attendanceCheckbox}
                        onPress={() =>
                          handleToggleAttendance(item.userId, !isAttended)
                        }
                      >
                        <View
                          style={[
                            styles.checkboxBox,
                            isAttended && styles.checkboxBoxChecked,
                          ]}
                        >
                          {isAttended && (
                            <Ionicons
                              name="checkmark"
                              size={16}
                              color={theme.colors.white}
                            />
                          )}
                        </View>
                      </TouchableOpacity>
                    )}

                    {/* Read-only attendance indicator (when event is completed) */}
                    {event.status === "completed" && !isRecordingAttendance && (
                      <View style={styles.attendanceIndicator}>
                        {actuallyAttended ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={24}
                            color="#4CAF50"
                          />
                        ) : wasMarkedAbsent ? (
                          <Ionicons
                            name="close-circle"
                            size={24}
                            color="#F44336"
                          />
                        ) : (
                          <Ionicons
                            name="help-circle"
                            size={24}
                            color="#9E9E9E"
                          />
                        )}
                      </View>
                    )}

                    <View style={styles.inviteeLeft}>
                      {item.photoUrl ? (
                        <Image
                          source={{ uri: item.photoUrl }}
                          style={styles.inviteePhoto}
                        />
                      ) : (
                        <View style={styles.inviteePhotoPlaceholder}>
                          <Ionicons
                            name="person"
                            size={20}
                            color={theme.colors.textSecondary}
                          />
                        </View>
                      )}
                      <View style={styles.inviteeInfo}>
                        <Text style={styles.inviteeName}>
                          {item.userName || "Unknown User"}
                        </Text>
                        {item.respondedBy &&
                          item.respondedBy !== item.userId && (
                            <Text style={styles.inviteeGuardianNote}>
                              via {item.respondedByName || "Guardian"}
                            </Text>
                          )}
                      </View>
                    </View>
                    <View style={styles.inviteeRight}>
                      {!isRecordingAttendance &&
                        event.status !== "completed" && (
                          <View
                            style={[
                              styles.inviteeStatusBadge,
                              { backgroundColor: statusColor },
                            ]}
                          >
                            <Text style={styles.inviteeStatusText}>
                              {statusValue.charAt(0).toUpperCase() +
                                statusValue.slice(1)}
                            </Text>
                          </View>
                        )}
                      {event.status === "completed" &&
                        !isRecordingAttendance && (
                          <View style={styles.attendanceBadge}>
                            <Text
                              style={[
                                styles.attendanceBadgeText,
                                actuallyAttended && { color: "#4CAF50" },
                                wasMarkedAbsent && { color: "#F44336" },
                                !actuallyAttended &&
                                  !wasMarkedAbsent && { color: "#9E9E9E" },
                              ]}
                            >
                              {actuallyAttended
                                ? "Attended"
                                : wasMarkedAbsent
                                  ? "Absent"
                                  : "Not Marked"}
                            </Text>
                          </View>
                        )}
                      {canClickInvitee && !isRecordingAttendance && (
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color={theme.colors.textSecondary}
                          style={{ marginLeft: 8 }}
                        />
                      )}
                    </View>
                  </>
                );

                return canClickInvitee ? (
                  <TouchableOpacity
                    style={styles.inviteeItem}
                    onPress={() => {
                      setSelectedInvitee({
                        userId: item.userId,
                        userName: item.userName || "Unknown User",
                        photoUrl: item.photoUrl,
                        status: statusValue as
                          | "pending"
                          | "accepted"
                          | "declined",
                        respondedBy: item.respondedBy,
                        respondedByName: item.respondedByName,
                      });
                    }}
                  >
                    {inviteeContent}
                  </TouchableOpacity>
                ) : (
                  <View style={styles.inviteeItem}>{inviteeContent}</View>
                );
              }}
              ItemSeparatorComponent={() => (
                <View style={styles.inviteeSeparator} />
              )}
            />
          ) : (
            <Text style={styles.emptyResponsesText}>No invitees yet</Text>
          )}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Invitee Response Modal */}
      <Modal
        visible={selectedInvitee !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedInvitee(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedInvitee?.userName}&apos;s Response
              </Text>
              <TouchableOpacity onPress={() => setSelectedInvitee(null)}>
                <Ionicons name="close" size={28} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {selectedInvitee && event && (
              <ScrollView style={styles.modalScrollView}>
                <View style={styles.inviteeModalContent}>
                  {/* Capacity Display */}
                  {event.capacity?.max && (
                    <View style={styles.modalCapacityInfo}>
                      <Ionicons
                        name="people-outline"
                        size={20}
                        color={
                          isEventFull() ? "#F44336" : theme.colors.secondary
                        }
                      />
                      <Text
                        style={[
                          styles.modalCapacityText,
                          isEventFull() && {
                            color: "#F44336",
                            fontWeight: "600",
                          },
                        ]}
                      >
                        Capacity: {event.responseSummary?.accepted || 0}/
                        {event.capacity.max}
                        {isEventFull() && " - Event Full!"}
                      </Text>
                    </View>
                  )}

                  {/* Invitee Header */}
                  <View style={styles.inviteeModalHeader}>
                    {selectedInvitee.photoUrl ? (
                      <Image
                        source={{ uri: selectedInvitee.photoUrl }}
                        style={styles.inviteeModalPhoto}
                      />
                    ) : (
                      <View style={styles.inviteeModalPhotoPlaceholder}>
                        <Ionicons
                          name="person"
                          size={40}
                          color={theme.colors.textSecondary}
                        />
                      </View>
                    )}
                    <Text style={styles.inviteeModalName}>
                      {selectedInvitee.userName}
                    </Text>
                  </View>

                  {/* Success Banner */}
                  {responseSuccess && (
                    <View style={styles.successBanner}>
                      <Ionicons
                        name="checkmark-circle"
                        size={24}
                        color="#fff"
                      />
                      <Text style={styles.successBannerText}>
                        Response updated successfully!
                      </Text>
                    </View>
                  )}

                  {/* Current Response Status */}
                  <View style={styles.currentResponseContainer}>
                    <View
                      style={[
                        styles.currentResponseBadge,
                        {
                          backgroundColor: getResponseColor(
                            selectedInvitee.status,
                          ),
                        },
                      ]}
                    >
                      <Ionicons
                        name={
                          selectedInvitee.status === "accepted"
                            ? "checkmark-circle"
                            : selectedInvitee.status === "declined"
                              ? "close-circle"
                              : "time"
                        }
                        size={20}
                        color={theme.colors.white}
                      />
                      <Text style={styles.currentResponseText}>
                        {selectedInvitee.status.charAt(0).toUpperCase() +
                          selectedInvitee.status.slice(1)}
                      </Text>
                    </View>

                    {selectedInvitee.respondedBy && (
                      <Text style={styles.guardianNote}>
                        Responded by:{" "}
                        {selectedInvitee.respondedByName || "Guardian"}
                      </Text>
                    )}
                  </View>

                  {/* Response Buttons */}
                  <View style={styles.responseButtons}>
                    <TouchableOpacity
                      style={[
                        styles.responseButton,
                        styles.acceptButton,
                        selectedInvitee.status === "accepted" &&
                          styles.disabledButton,
                        isEventFull() &&
                          selectedInvitee.status !== "accepted" && {
                            opacity: 0.5,
                            backgroundColor: "#999",
                          },
                      ]}
                      onPress={() =>
                        handleInviteeResponse(
                          selectedInvitee.userId,
                          "accepted",
                        )
                      }
                      disabled={
                        submitting ||
                        selectedInvitee.status === "accepted" ||
                        (isEventFull() && selectedInvitee.status !== "accepted")
                      }
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={theme.colors.white}
                      />
                      <Text style={styles.responseButtonText}>Accept</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.responseButton,
                        styles.declineButton,
                        selectedInvitee.status === "declined" &&
                          styles.disabledButton,
                      ]}
                      onPress={() =>
                        handleInviteeResponse(
                          selectedInvitee.userId,
                          "declined",
                        )
                      }
                      disabled={
                        submitting || selectedInvitee.status === "declined"
                      }
                    >
                      <Ionicons
                        name="close-circle"
                        size={20}
                        color={theme.colors.white}
                      />
                      <Text style={styles.responseButtonText}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Description Modal */}
      <Modal
        visible={showDescriptionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDescriptionModal(false)}
      >
        <View style={styles.descriptionModalOverlay}>
          <View style={styles.descriptionModalContainer}>
            <View style={styles.descriptionModalHeader}>
              <Text style={styles.descriptionModalTitle}>
                Event Description
              </Text>
              <TouchableOpacity onPress={() => setShowDescriptionModal(false)}>
                <Ionicons name="close" size={28} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.descriptionModalContent}>
              <View style={styles.descriptionEventTypeRow}>
                <Ionicons
                  name={
                    event?.eventType === "training"
                      ? "fitness"
                      : event?.eventType === "match"
                        ? "football"
                        : "calendar"
                  }
                  size={22}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.descriptionEventType}>
                  {event?.eventType?.toUpperCase() || "EVENT"}
                </Text>
              </View>
              <Text style={styles.descriptionText}>{event?.description}</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cancel Scope Modal (for recurring events) */}
      <Modal
        visible={showCancelScopeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCancelScopeModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: theme.colors.primary,
              borderRadius: 16,
              padding: 24,
              width: "100%",
              maxWidth: 400,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: theme.colors.text,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              {t("screens:eventDetails.cancelScope")}
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: theme.colors.textSecondary,
                textAlign: "center",
                marginBottom: 20,
              }}
            >
              {t("screens:eventDetails.cancelScopeDescription")}
            </Text>

            <TouchableOpacity
              onPress={() => {
                setRecurringScope("single");
                setShowCancelScopeModal(false);
                setShowCancelModal(true);
              }}
              style={{
                padding: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.colors.inputBorder,
                backgroundColor: theme.colors.inputBackground,
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                }}
              >
                {t("screens:eventDetails.thisOccurrenceOnly")}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.textSecondary,
                  marginTop: 4,
                }}
              >
                {t("screens:eventDetails.thisOccurrenceOnlyHint")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setRecurringScope("future");
                setShowCancelScopeModal(false);
                setShowCancelModal(true);
              }}
              style={{
                padding: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#EF5350",
                backgroundColor: "rgba(239, 83, 80, 0.1)",
                marginBottom: 16,
              }}
            >
              <Text
                style={{ fontSize: 16, fontWeight: "600", color: "#EF5350" }}
              >
                {t("screens:eventDetails.allFutureOccurrences")}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.textSecondary,
                  marginTop: 4,
                }}
              >
                {t("screens:eventDetails.allFutureOccurrencesHint")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowCancelScopeModal(false)}
              style={{
                padding: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 16, color: theme.colors.textSecondary }}>
                {t("common:cancel")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Scope Modal (for recurring events) */}
      <Modal
        visible={showEditScopeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditScopeModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: theme.colors.primary,
              borderRadius: 16,
              padding: 24,
              width: "100%",
              maxWidth: 400,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: theme.colors.text,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              {t("screens:eventDetails.editScope")}
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: theme.colors.textSecondary,
                textAlign: "center",
                marginBottom: 20,
              }}
            >
              {t("screens:eventDetails.editScopeDescription")}
            </Text>

            <TouchableOpacity
              onPress={() => {
                setShowEditScopeModal(false);
                if (!event) return;
                router.push({
                  pathname: "/create-event",
                  params: {
                    eventId: event.id,
                    clubId: event.clubId,
                    clubName: event.clubName,
                    groupId: event.groupId || undefined,
                    groupName: event.groupName || undefined,
                    mode: "edit",
                    editScope: "single",
                    recurringEventId: event.recurringEventId || undefined,
                  },
                } as any);
              }}
              style={{
                padding: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.colors.inputBorder,
                backgroundColor: theme.colors.inputBackground,
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                }}
              >
                {t("screens:eventDetails.editThisOnly")}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.textSecondary,
                  marginTop: 4,
                }}
              >
                {t("screens:eventDetails.editThisOnlyHint")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setShowEditScopeModal(false);
                if (!event) return;
                router.push({
                  pathname: "/create-event",
                  params: {
                    eventId: event.id,
                    clubId: event.clubId,
                    clubName: event.clubName,
                    groupId: event.groupId || undefined,
                    groupName: event.groupName || undefined,
                    mode: "edit",
                    editScope: "future",
                    recurringEventId: event.recurringEventId || undefined,
                  },
                } as any);
              }}
              style={{
                padding: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.colors.secondary,
                backgroundColor: "rgba(76, 175, 80, 0.1)",
                marginBottom: 16,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.secondary,
                }}
              >
                {t("screens:eventDetails.editAllFuture")}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.textSecondary,
                  marginTop: 4,
                }}
              >
                {t("screens:eventDetails.editAllFutureHint")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowEditScopeModal(false)}
              style={{
                padding: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 16, color: theme.colors.textSecondary }}>
                {t("common:cancel")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Cancel Event Modal */}
      <Modal
        visible={showCancelModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isCancelling) {
            setShowCancelModal(false);
            setCancellationReason("");
          }
        }}
      >
        <View style={styles.cancelModalOverlay}>
          <View style={styles.cancelModalContainer}>
            <View style={styles.cancelModalHeader}>
              <Ionicons name="warning" size={32} color="#B71C1C" />
              <Text style={styles.cancelModalTitle}>
                {t("screens:eventDetails.cancelEventConfirmTitle")}
              </Text>
            </View>

            <Text style={styles.cancelModalMessage}>
              {t("screens:eventDetails.cancelEventConfirmMessage", {
                title: event?.title,
              })}
            </Text>

            <Text style={styles.cancelModalReasonLabel}>
              {t("screens:eventDetails.cancellationReasonLabel")}
            </Text>
            <TextInput
              style={styles.cancelModalReasonInput}
              placeholder={t(
                "screens:eventDetails.cancellationReasonPlaceholder",
              )}
              placeholderTextColor={theme.colors.textSecondary}
              value={cancellationReason}
              onChangeText={setCancellationReason}
              multiline
              numberOfLines={3}
              maxLength={200}
            />

            <View style={styles.cancelModalActions}>
              <TouchableOpacity
                style={styles.cancelModalKeepButton}
                onPress={() => {
                  setShowCancelModal(false);
                  setCancellationReason("");
                }}
                disabled={isCancelling}
              >
                <Text style={styles.cancelModalKeepButtonText}>
                  {t("screens:eventDetails.keepEvent")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.cancelModalConfirmButton,
                  isCancelling && { opacity: 0.5 },
                ]}
                onPress={handleCancelEvent}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.cancelModalConfirmButtonText}>
                    {t("screens:eventDetails.confirmCancelEvent")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmation Modal */}
      <ConfirmationModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="OK"
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ ...confirmModal, visible: false })}
      />
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
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: theme.spacing.xxl,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
  },
  errorText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.error,
    textAlign: "center",
  },
  backButton: {
    marginTop: theme.spacing.xl,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.medium,
  },
  backButtonText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.white,
  },
  content: {
    flex: 1,
  },
  eventHeader: {
    backgroundColor: theme.colors.secondary,
    padding: theme.spacing.lg,
  },
  eventTypeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  eventTypeText: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.bold,
    color: "#1a1d21",
    marginLeft: theme.spacing.xs,
  },
  eventTitle: {
    fontSize: theme.typography.fontSize.xxlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: "#1a1d21",
    marginBottom: theme.spacing.sm,
  },
  eventDescription: {
    fontSize: theme.typography.fontSize.medium,
    color: "#1a1d21",
    opacity: 0.8,
  },
  section: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.inputBackground,
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  infoText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
    flex: 1,
  },
  deadlineWarning: {
    color: theme.colors.error,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  currentResponseContainer: {
    marginBottom: theme.spacing.md,
  },
  currentResponseBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
  },
  currentResponseText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.white,
    marginLeft: theme.spacing.xs,
  },
  guardianNote: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
    fontStyle: "italic",
  },
  capacityWarning: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  capacityText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.text,
    flex: 1,
  },
  deadlineInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  deadlineInfoText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.text,
    flex: 1,
  },
  respondForSection: {
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.md,
  },
  respondForLabel: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  respondForButton: {
    backgroundColor: theme.colors.white,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.small,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.xs,
  },
  respondForButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  respondForButtonText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    textAlign: "center",
  },
  respondForButtonTextActive: {
    color: theme.colors.white,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  respondForNote: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.warning,
    marginTop: theme.spacing.sm,
    fontStyle: "italic",
  },
  responseButtons: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  responseButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
  },
  acceptButton: {
    backgroundColor: theme.colors.success,
  },
  declineButton: {
    backgroundColor: theme.colors.error,
  },
  disabledButton: {
    opacity: 0.5,
  },
  responseButtonText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.white,
    marginLeft: theme.spacing.xs,
  },
  deadlinePassedText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.error,
    textAlign: "center",
    marginTop: theme.spacing.sm,
    fontStyle: "italic",
  },
  responseSummaryContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: theme.spacing.lg,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
  },
  summaryItem: {
    alignItems: "center",
  },
  summaryCount: {
    fontSize: theme.typography.fontSize.xxlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  summaryLabel: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.medium,
    marginTop: theme.spacing.xs,
  },
  tabContainer: {
    flexDirection: "row",
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: "center",
    borderRadius: theme.borderRadius.small,
  },
  activeTab: {
    backgroundColor: theme.colors.secondary,
  },
  tabText: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
  },
  activeTabText: {
    color: theme.colors.white,
  },
  responsesList: {
    gap: theme.spacing.sm,
  },
  responseItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: theme.spacing.md,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
  },
  responseUser: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  responseUserInfo: {
    marginLeft: theme.spacing.sm,
    flex: 1,
  },
  responseUserName: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  responseGuardianNote: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    fontStyle: "italic",
  },
  responseTime: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  emptyResponsesContainer: {
    padding: theme.spacing.xl,
    alignItems: "center",
  },
  emptyResponsesText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    fontStyle: "italic",
  },
  inviteeItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
  },
  inviteeLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  inviteeRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  inviteePhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.inputBackground,
  },
  inviteePhotoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: "center",
    alignItems: "center",
  },
  inviteeInfo: {
    marginLeft: theme.spacing.sm,
    flex: 1,
  },
  inviteeName: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  inviteeGuardianNote: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    fontStyle: "italic",
  },
  inviteeStatusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.small,
  },
  inviteeStatusText: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.white,
  },
  inviteeSeparator: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.borderRadius.large,
    borderTopRightRadius: theme.borderRadius.large,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
  },
  modalScrollView: {
    maxHeight: "100%",
  },
  inviteeModalContent: {
    padding: theme.spacing.lg,
  },
  inviteeModalHeader: {
    alignItems: "center",
    marginBottom: theme.spacing.lg,
  },
  inviteeModalPhoto: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.inputBackground,
    marginBottom: theme.spacing.sm,
  },
  inviteeModalPhotoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  inviteeModalName: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  successBannerText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semibold,
    color: "#fff",
  },
  capacityInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.small,
  },
  capacityInfoText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  modalCapacityInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
  },
  modalCapacityText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
  },
  descriptionModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.lg,
  },
  descriptionModalContainer: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.large,
    width: "100%",
    maxWidth: 500,
  },
  descriptionModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  descriptionModalTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
  },
  descriptionModalContent: {
    padding: theme.spacing.lg,
  },
  descriptionEventTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  descriptionEventType: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textSecondary,
    letterSpacing: 1,
  },
  descriptionTitle: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  descriptionText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    lineHeight: 24,
  },
  bottomPadding: {
    height: theme.spacing.xl,
  },
  // Attendance Recording Styles
  recordAttendanceButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.medium,
    gap: theme.spacing.sm,
  },
  recordAttendanceButtonText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.white,
  },
  recordingActionsContainer: {
    flexDirection: "row",
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  cancelRecordingButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  cancelRecordingButtonText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
  },
  completeEventButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    backgroundColor: theme.colors.success,
    gap: theme.spacing.sm,
  },
  completeEventButtonText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.white,
  },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.success,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  completedBadgeText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.white,
  },
  completedInfoText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  inviteesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  recordingModeText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  attendanceCheckbox: {
    marginRight: theme.spacing.sm,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.small,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
  checkboxBoxChecked: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  // Attendance Summary Styles
  attendanceSummaryCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
  },
  attendanceStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  attendanceStatItem: {
    alignItems: "center",
    flex: 1,
    gap: theme.spacing.xs,
  },
  attendanceStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: theme.colors.border,
  },
  attendanceStatLabel: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  attendanceStatValue: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  attendanceIndicator: {
    marginRight: theme.spacing.sm,
  },
  attendanceBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.small,
  },
  attendanceBadgeText: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  // Cancel Event Styles
  cancelledEventBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#B71C1C",
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.medium,
    gap: theme.spacing.sm,
  },
  cancelledEventBannerContent: {
    flex: 1,
  },
  cancelledEventBannerTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.bold,
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cancelledEventBannerReason: {
    fontSize: theme.typography.fontSize.small,
    color: "rgba(255, 255, 255, 0.85)",
    marginTop: 2,
  },
  cancelModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.lg,
  },
  cancelModalContainer: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.large,
    padding: theme.spacing.lg,
    width: "100%",
    maxWidth: 400,
  },
  cancelModalHeader: {
    alignItems: "center",
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  cancelModalTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: "center",
  },
  cancelModalMessage: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: theme.spacing.lg,
    lineHeight: 22,
  },
  cancelModalReasonLabel: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  cancelModalReasonInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    backgroundColor: theme.colors.inputBackground,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: theme.spacing.lg,
  },
  cancelModalActions: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  cancelModalKeepButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  cancelModalKeepButtonText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
  },
  cancelModalConfirmButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    backgroundColor: "#B71C1C",
  },
  cancelModalConfirmButtonText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semibold,
    color: "#fff",
  },
});
