// Event Details Screen - Show comprehensive event information
// Features: Event info, user response, responses list, edit button

import ConfirmationModal from "@/components/ConfirmationModal";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/contexts/UserContext";
import {
    getEventDetails,
    updateEventResponse,
} from "@/services/event/eventService";
import type { EventData } from "@/services/types/event";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ResponseTab = "accepted" | "declined" | "pending";

export default function EventDetailsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { userProfile } = useUserProfile();
  const params = useLocalSearchParams();

  const eventId = params.eventId as string;
  const clubId = params.clubId as string;

  console.log("🔍 DEBUG [event-details.tsx] - Route Params:", {
    eventId,
    clubId,
    allParams: params,
  });

  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<ResponseTab>("accepted");
  const [confirmModal, setConfirmModal] = useState({
    visible: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  useEffect(() => {
    loadEventDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, clubId]);

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
          title: "Error",
          message: "Event not found",
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
        title: "Error",
        message: "Failed to load event details",
        onConfirm: () => setConfirmModal({ ...confirmModal, visible: false }),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResponse = async (response: "accepted" | "declined") => {
    if (!event || !user) return;

    try {
      setSubmitting(true);

      console.log(
        "🔍 DEBUG [event-details.tsx] - Calling updateEventResponse:",
        {
          eventId: event.id,
          clubId: event.clubId,
          userId: user.uid,
          response,
        },
      );

      const success = await updateEventResponse(
        event.id,
        event.clubId,
        user.uid,
        response,
      );

      if (success) {
        // Reload event details to show updated response
        await loadEventDetails();

        setConfirmModal({
          visible: true,
          title: "Success",
          message: `You have ${response === "accepted" ? "accepted" : "declined"} this event`,
          onConfirm: () => {
            setConfirmModal({ ...confirmModal, visible: false });
            router.back();
          },
        });
      } else {
        setConfirmModal({
          visible: true,
          title: "Error",
          message: "Failed to update response",
          onConfirm: () => setConfirmModal({ ...confirmModal, visible: false }),
        });
      }
    } catch (error: any) {
      console.error("Error updating response:", error);
      setConfirmModal({
        visible: true,
        title: "Error",
        message: error.message || "Failed to update response",
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

  const filteredResponses =
    event?.responses?.filter((r) => r.status === activeTab) || [];

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading event details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Ionicons
            name="alert-circle-outline"
            size={64}
            color={theme.colors.error}
          />
          <Text style={styles.errorText}>Event not found</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const userResponse = event.responses?.find((r) => r.userId === user?.uid);

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
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backIcon}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Event Details</Text>
        {canEditEvent() && (
          <TouchableOpacity onPress={handleEdit} style={styles.editIcon}>
            <Ionicons
              name="create-outline"
              size={24}
              color={theme.colors.white}
            />
          </TouchableOpacity>
        )}
      </View>

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
            <Text
              style={styles.eventDescription}
              numberOfLines={3}
              ellipsizeMode="tail"
            >
              {event.description}
            </Text>
          )}
        </View>

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
                        Gathering: {format(date, "HH:mm")}
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
              Start: {format(event.startDate, "HH:mm")}
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
                  <Text style={styles.deadlineWarning}> (Passed)</Text>
                )}
              </Text>
            </View>
          )}

          {event.maxCapacity && (
            <View style={styles.infoRow}>
              <Ionicons
                name="people-outline"
                size={20}
                color={theme.colors.secondary}
              />
              <Text style={styles.infoText}>
                Capacity: {event.responseSummary?.accepted || 0}/
                {event.maxCapacity}
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

        {/* User Response Section */}
        {!isPastEvent && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Response</Text>

            {/* Capacity Warning */}
            {event.capacity?.max && (
              <View style={styles.capacityWarning}>
                <Ionicons
                  name="people-outline"
                  size={16}
                  color={
                    event.responseSummary?.accepted >= event.capacity.max
                      ? "#F44336"
                      : theme.colors.secondary
                  }
                />
                <Text
                  style={[
                    styles.capacityText,
                    event.responseSummary?.accepted >= event.capacity.max && {
                      color: "#F44336",
                    },
                  ]}
                >
                  Limited to {event.capacity.max} participants •{" "}
                  {event.responseSummary?.accepted || 0} accepted
                  {event.responseSummary?.accepted >= event.capacity.max &&
                    " • Event Full!"}
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
                ]}
                onPress={() => handleResponse("accepted")}
                disabled={
                  submitting ||
                  normalizedResponse?.status === "accepted" ||
                  isDeadlinePassed
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
                  normalizedResponse?.status === "declined" &&
                    styles.disabledButton,
                ]}
                onPress={() => handleResponse("declined")}
                disabled={
                  submitting ||
                  normalizedResponse?.status === "declined" ||
                  isDeadlinePassed
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

            {isDeadlinePassed && (
              <Text style={styles.deadlinePassedText}>
                Response deadline has passed
              </Text>
            )}
          </View>
        )}

        {/* Invitees List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Invitees ({event.responses?.length || 0})
          </Text>

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

                return (
                  <View style={styles.inviteeItem}>
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
                  </View>
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

      {/* Confirmation Modal */}
      <ConfirmationModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="OK"
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ ...confirmModal, visible: false })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.layout.containerPadding,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  backIcon: {
    padding: theme.spacing.xs,
  },
  headerTitle: {
    flex: 1,
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.white,
    textAlign: "center",
    marginHorizontal: theme.spacing.sm,
  },
  editIcon: {
    padding: theme.spacing.xs,
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
  bottomPadding: {
    height: theme.spacing.xl,
  },
});
