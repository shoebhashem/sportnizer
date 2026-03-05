import { theme } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import ConfirmationModal from "../../components/ConfirmationModal";
import EventCard from "../../components/EventCard";
import InvitationModal from "../../components/InvitationModal";
import PaymentCard from "../../components/PaymentCard";
import { useAuth } from "../../contexts/AuthContext";
import { useEvents } from "../../contexts/EventContext";
import { useUser } from "../../contexts/UserContext";
import { getCurrentUser } from "../../services/auth/authService";
import { clubService } from "../../services/club";
import { fetchDependentProfiles } from "../../services/fetchDependentProfiles";
import {
    acceptGroupInvite,
    fetchGroupInvites,
    GroupInviteInfo,
    rejectGroupInvite,
} from "../../services/fetchGroupInvites";
import { paymentService, PendingPayment } from "../../services/paymentService";
import { NewsFlowItem } from "../../services/types";
import type { EventData } from "../../services/types/event";

// Extended event data with invitee context
interface ExpandedEventData extends EventData {
  inviteeUserId: string;
  inviteeName: string;
  isCurrentUser: boolean;
  isYouthMember?: boolean;
  responseStatus: string;
}

interface ModalState {
  visible: boolean;
  title: string;
  message: string;
  type?: "error" | "success" | "info";
}

export default function Index() {
  const router = useRouter();
  const { t } = useTranslation(["screens", "common"]);
  const { user } = useAuth();
  const { userProfile } = useUser();
  const {
    events: contextEvents,
    refreshEvents,
    isLoading: eventsLoading,
  } = useEvents();
  const [weekEvents, setWeekEvents] = useState<ExpandedEventData[]>([]);
  const [newsItems, setNewsItems] = useState<NewsFlowItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<ModalState>({
    visible: false,
    title: "",
    message: "",
    type: "error",
  });

  // Invitation state
  const [pendingInvites, setPendingInvites] = useState<GroupInviteInfo[]>([]);
  const [currentInvite, setCurrentInvite] = useState<GroupInviteInfo | null>(
    null,
  );
  const [isInviteModalVisible, setIsInviteModalVisible] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [processedInvites, setProcessedInvites] = useState<Set<string>>(
    new Set(),
  ); // Track processed invites
  const [hasLoadedInitialInvites, setHasLoadedInitialInvites] = useState(false); // Track if we've done initial load

  // Pending payments state
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);

  // Alert modal state (cross-platform replacement for Alert.alert)
  const [alertModal, setAlertModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({ visible: false, title: "", message: "" });

  const showAlert = (title: string, message: string, onConfirm?: () => void) =>
    setAlertModal({ visible: true, title, message, onConfirm });
  const hideAlert = () => {
    alertModal.onConfirm?.();
    setAlertModal({ visible: false, title: "", message: "" });
  };

  // Club logos state
  const [clubLogos, setClubLogos] = useState<Record<string, string | null>>({});

  // Load pending payments
  const loadPendingPayments = useCallback(async () => {
    try {
      const result = await paymentService.getPendingPayments();
      if (result.success && result.payments) {
        setPendingPayments(result.payments);
      }
    } catch (error) {
      console.log("Could not load pending payments:", error);
    }
  }, []);

  // Filter pending payments due within 7 days (for home screen display)
  const urgentPayments = useMemo(() => {
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    return pendingPayments.filter((payment) => {
      // Only show pending (not paid) payments
      if (payment.status === "paid") return false;

      // Show if overdue or due within 7 days
      if (payment.isOverdue) return true;

      if (payment.dueDate) {
        return payment.dueDate <= sevenDaysFromNow;
      }

      // If no due date, don't show on home screen
      return false;
    });
  }, [pendingPayments]);

  // Load pending payments on mount
  useEffect(() => {
    if (user?.uid) {
      loadPendingPayments();
    }
  }, [user?.uid, loadPendingPayments]);

  // Load club logos when userProfile changes
  useEffect(() => {
    const fetchClubLogos = async () => {
      if (!userProfile?.clubAccess || userProfile.clubAccess.length === 0) {
        return;
      }

      const logos: Record<string, string | null> = {};

      await Promise.all(
        userProfile.clubAccess.map(async (club) => {
          try {
            const result = await clubService.getClub(club.clubId);
            if (result.success && result.data?.logoUrl) {
              logos[club.clubId] = result.data.logoUrl;
            } else {
              logos[club.clubId] = null;
            }
          } catch (error) {
            console.log(`Could not fetch logo for club ${club.clubId}:`, error);
            logos[club.clubId] = null;
          }
        }),
      );

      setClubLogos(logos);
    };

    fetchClubLogos();
  }, [userProfile?.clubAccess]);

  const loadInvitations = useCallback(async () => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        console.log("No current user, skipping invitation check");
        return;
      }

      console.log("Fetching group invitations...");
      const response = await fetchGroupInvites(currentUser.uid);
      console.log("Found invitations:", response);

      // Extract invitations from response
      const allInvites = response.invites || [];

      // Filter out invitations we've already processed
      const newInvites = allInvites.filter((invite) => {
        return !processedInvites.has(invite.inviteId);
      });

      console.log("New unprocessed invitations:", newInvites);
      setPendingInvites(newInvites);

      // Show the first new invitation if any exist and no modal is currently visible
      if (newInvites.length > 0 && !isInviteModalVisible && !currentInvite) {
        setCurrentInvite(newInvites[0]);
        setIsInviteModalVisible(true);
      }
    } catch (error) {
      console.error("Error loading invitations:", error);
    }
  }, [isInviteModalVisible, currentInvite, processedInvites]);

  // Helper function to convert Timestamp to Date
  const convertTimestampToDate = (timestamp: any): Date | string => {
    if (!timestamp) return new Date();
    if (timestamp.toDate) {
      // Firestore Timestamp
      return timestamp.toDate();
    } else if (timestamp.seconds) {
      // Cached Timestamp
      return new Date(timestamp.seconds * 1000);
    }
    // Already a Date or string
    return timestamp;
  };

  // Process events from EventContext - expand for user and dependents
  useEffect(() => {
    const processEvents = async () => {
      if (!user?.uid) {
        setWeekEvents([]);
        return;
      }

      try {
        // Fetch dependent profiles (children) from userProfile
        const dependentProfiles = userProfile?.dependents
          ? await fetchDependentProfiles(userProfile.dependents)
          : [];
        const dependentIds = dependentProfiles.map((d) => d.uid);
        const allUserIds = [user.uid, ...dependentIds];

        // Filter to next 7 days from today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sevenDaysFromNow = new Date(today);
        sevenDaysFromNow.setDate(today.getDate() + 7);

        const weekEventsFromContext = contextEvents.filter((event) => {
          // Handle both Firestore Timestamp and cached serialized timestamp
          let eventDate: Date;
          if (event.startDate?.toDate) {
            // Firestore Timestamp with toDate() method
            eventDate = event.startDate.toDate();
          } else if (event.startDate?.seconds) {
            // Serialized Timestamp from cache (has seconds property)
            eventDate = new Date(event.startDate.seconds * 1000);
          } else {
            // String or number
            eventDate = new Date(event.startDate);
          }
          return eventDate >= today && eventDate < sevenDaysFromNow;
        });

        // Expand events for each relevant invitee
        const expanded: ExpandedEventData[] = [];

        for (const event of weekEventsFromContext) {
          if (!event.responses) continue;

          // Find responses for current user and their dependents
          const relevantResponses = event.responses.filter((r) =>
            allUserIds.includes(r.userId),
          );

          // Create a card for each relevant invitee
          for (const response of relevantResponses) {
            const isCurrentUser = response.userId === user.uid;
            const inviteeName = isCurrentUser
              ? "You"
              : response.userName || response.userId;

            // Convert Timestamps to Date objects for EventCard
            const startDateObj = convertTimestampToDate(event.startDate);
            const endDateObj = convertTimestampToDate(event.endDate);
            const gatheringTimeObj = event.gatheringTime
              ? convertTimestampToDate(event.gatheringTime)
              : null;
            const responseDeadlineObj = event.responseDeadline
              ? convertTimestampToDate(event.responseDeadline)
              : null;

            // Extract time strings for EventCard (ISO format for formatTime function)
            const startTime =
              startDateObj instanceof Date
                ? startDateObj.toISOString()
                : startDateObj;
            const endTime =
              endDateObj instanceof Date
                ? endDateObj.toISOString()
                : endDateObj;
            const gatheringTime = gatheringTimeObj
              ? gatheringTimeObj instanceof Date
                ? gatheringTimeObj.toISOString()
                : gatheringTimeObj
              : null;

            expanded.push({
              ...event,
              startDate: startDateObj,
              endDate: endDateObj,
              startTime: startTime,
              endTime: endTime,
              gatheringTime: gatheringTime,
              responseDeadline: responseDeadlineObj,
              inviteeUserId: response.userId,
              inviteeName,
              isCurrentUser,
              isYouthMember: response.isYouthMember || false,
              responseStatus: response.response || response.status || "pending",
            });
          }
        }

        setWeekEvents(expanded);
        console.log(
          `Processed ${weekEventsFromContext.length} week events, expanded to ${expanded.length} cards`,
        );
      } catch (error) {
        console.error("Error processing events:", error);
        setWeekEvents([]);
      }
    };

    processEvents();
  }, [contextEvents, user?.uid, userProfile?.dependents]);

  // Load invitations on mount
  useEffect(() => {
    if (!hasLoadedInitialInvites) {
      loadInvitations();
      setHasLoadedInitialInvites(true);
    }
  }, [hasLoadedInitialInvites, loadInvitations]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Refresh events from EventContext
      await refreshEvents();
      // Reload invitations
      await loadInvitations();
      // Reload pending payments
      await loadPendingPayments();
    } catch (error) {
      console.error("Error refreshing:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleEventPress = (event: ExpandedEventData) => {
    console.log("Navigating to event:", {
      eventId: event.id,
      clubId: event.clubId,
      inviteeUserId: event.inviteeUserId,
      inviteeName: event.inviteeName,
    });

    if (!event.id || !event.clubId) {
      console.error("Missing event data:", event);
      showAlert(t("common:error"), "Cannot open event: missing information");
      return;
    }

    router.push({
      pathname: "/event-details",
      params: {
        eventId: String(event.id),
        clubId: String(event.clubId),
        inviteeUserId: String(event.inviteeUserId),
        inviteeName: String(event.inviteeName),
      },
    } as any);
  };

  const handleViewAllEvents = () => {
    // Navigate to Events tab
    router.push("/(tabs)/events" as any);
  };

  // Invitation handlers
  const handleAcceptInvite = async () => {
    if (!currentInvite) return;

    setInviteLoading(true);
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      // Mark this invitation as processed immediately
      setProcessedInvites((prev) => new Set(prev.add(currentInvite.inviteId)));

      // YOUTH INVITATION (NEW): Create youth document first, then process invitation
      if (
        currentInvite.invitationType === "youth_member" &&
        currentInvite.youthData
      ) {
        console.log(
          "👶 Creating youth member document before accepting invitation...",
        );

        const { httpsCallable } = await import("firebase/functions");
        const { functions } = await import("@/services/core/firebase");

        const createYouthFn = httpsCallable(
          functions,
          "createYouthMemberDocument",
        );
        const youthResult = await createYouthFn({
          guardianUid: currentUser.uid,
          guardianEmail: currentUser.email || "",
          guardianName:
            currentUser.displayName ||
            currentUser.email?.split("@")[0] ||
            "Guardian",
          childName: currentInvite.youthData.childName,
          dateOfBirth: currentInvite.youthData.dateOfBirth,
          relationship: currentInvite.youthData.relationship,
        });

        const youthResponse = youthResult.data as any;
        if (!youthResponse.success) {
          throw new Error(
            youthResponse.error || "Failed to create youth member",
          );
        }

        console.log(
          "✅ Youth member document created:",
          youthResponse.youthUid,
        );

        // Get guardian info for the invitation processing
        const guardianEmail = currentUser.email || "";
        const guardianName =
          userProfile?.displayName ||
          currentUser.displayName ||
          guardianEmail.split("@")[0] ||
          "Guardian";

        // Now process the invitation with the youth's userId (not guardian's) and guardian info
        const { addRegularMemberToGroupService } =
          await import("@/services/orchestration/addRegularMemberToGroup");
        const invitationResult =
          await addRegularMemberToGroupService.processInvitationAfterUserResponse(
            currentInvite.inviteId, // invitationToken
            youthResponse.youthUid, // Use youth's userId, not guardian's
            "accept", // action
            {
              // guardianInfo to avoid permission issues
              guardianUid: currentUser.uid,
              guardianEmail: guardianEmail,
              guardianName: guardianName,
              relationship: currentInvite.youthData.relationship,
            },
          );

        if (!invitationResult.success) {
          throw new Error(
            invitationResult.error || "Failed to process invitation",
          );
        }

        console.log("✅ Youth invitation processed successfully!");
      } else if (
        currentInvite.invitationType === "youth_member_existing" &&
        currentInvite.existingYouthData
      ) {
        // YOUTH INVITATION (EXISTING): Re-adding existing youth member
        console.log("🔄 Processing existing youth member invitation...");

        // Get guardian info for the invitation processing
        const guardianEmail = currentUser.email || "";
        const guardianName =
          userProfile?.displayName ||
          currentUser.displayName ||
          guardianEmail.split("@")[0] ||
          "Guardian";

        // For existing youth, fetch the relationship from guardian's dependents array
        const { getFirestore, doc, getDoc } =
          await import("firebase/firestore");
        const db = getFirestore();
        const guardianDocRef = doc(db, "users", currentUser.uid);
        const guardianDocSnap = await getDoc(guardianDocRef);

        let relationship = "Parent"; // Default fallback
        if (guardianDocSnap.exists() && currentInvite.existingYouthData) {
          const guardianData = guardianDocSnap.data();
          const dependent = guardianData.dependents?.find(
            (dep: any) => dep.uid === currentInvite.existingYouthData!.youthUid,
          );
          if (dependent) {
            relationship = dependent.relationship || "Parent";
          }
        }

        // Process invitation for existing youth with guardian info
        const { addRegularMemberToGroupService } =
          await import("@/services/orchestration/addRegularMemberToGroup");
        const invitationResult =
          await addRegularMemberToGroupService.processInvitationAfterUserResponse(
            currentInvite.inviteId, // invitationToken
            currentInvite.existingYouthData.youthUid, // Use existing youth's userId
            "accept", // action
            {
              // guardianInfo to ensure guardian sync happens
              guardianUid: currentUser.uid,
              guardianEmail: guardianEmail,
              guardianName: guardianName,
              relationship: relationship,
            },
          );

        if (!invitationResult.success) {
          throw new Error(
            invitationResult.error || "Failed to process invitation",
          );
        }

        console.log("✅ Existing youth invitation processed successfully!");
      } else {
        // REGULAR INVITATION: Standard flow
        await acceptGroupInvite(
          currentInvite.inviteId,
          currentInvite.clubId,
          currentInvite.groupId,
        );
      }

      // Remove from pending invites
      const updatedInvites = pendingInvites.filter(
        (invite) =>
          invite.clubId !== currentInvite.clubId ||
          invite.groupId !== currentInvite.groupId,
      );
      setPendingInvites(updatedInvites);

      // Show success message based on action type
      const isRoleUpdate = currentInvite.metadata?.action === "role_update";
      const newRole = currentInvite.metadata?.newRole || "member";

      const successMessage = currentInvite.youthData
        ? `${currentInvite.youthData.childName} has been successfully added to ${currentInvite.groupName}!`
        : isRoleUpdate
          ? `Your role has been updated to ${newRole} in ${currentInvite.groupName}!`
          : `You've successfully joined ${currentInvite.groupName}!`;

      setModal({
        visible: true,
        title: isRoleUpdate ? "Role Updated" : "Invitation Accepted",
        message: successMessage,
        type: "success",
      });

      // Close modal and show next invitation if any (pass updated list)
      closeInviteModalWithUpdatedList(updatedInvites);
    } catch (error) {
      console.error("Error accepting invitation:", error);
      // Remove from processed invites if there was an error
      if (currentInvite) {
        setProcessedInvites((prev) => {
          const newSet = new Set(prev);
          newSet.delete(currentInvite.inviteId);
          return newSet;
        });
      }
      setModal({
        visible: true,
        title: "Error",
        message: "Failed to accept invitation. Please try again.",
        type: "error",
      });
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRejectInvite = async () => {
    if (!currentInvite) return;

    setInviteLoading(true);
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      // Mark this invitation as processed immediately
      setProcessedInvites((prev) => new Set(prev.add(currentInvite.inviteId)));

      await rejectGroupInvite(
        currentInvite.inviteId,
        currentInvite.clubId,
        currentInvite.groupId,
      );

      // Remove from pending invites
      const updatedInvites = pendingInvites.filter(
        (invite) =>
          invite.clubId !== currentInvite.clubId ||
          invite.groupId !== currentInvite.groupId,
      );
      setPendingInvites(updatedInvites);

      // Close modal and show next invitation if any (pass updated list)
      closeInviteModalWithUpdatedList(updatedInvites);
    } catch (error) {
      console.error("Error rejecting invitation:", error);
      // Remove from processed invites if there was an error
      if (currentInvite) {
        setProcessedInvites((prev) => {
          const newSet = new Set(prev);
          newSet.delete(currentInvite.inviteId);
          return newSet;
        });
      }
      setModal({
        visible: true,
        title: "Error",
        message: "Failed to reject invitation. Please try again.",
        type: "error",
      });
    } finally {
      setInviteLoading(false);
    }
  };

  const closeInviteModalWithUpdatedList = (
    updatedInvites: GroupInviteInfo[],
  ) => {
    setIsInviteModalVisible(false);
    setCurrentInvite(null);

    // Filter out any processed invitations from the updated list
    const unprocessedInvites = updatedInvites.filter((invite) => {
      return !processedInvites.has(invite.inviteId);
    });

    // Show next invitation if any remaining unprocessed invites
    if (unprocessedInvites.length > 0) {
      setTimeout(() => {
        setCurrentInvite(unprocessedInvites[0]);
        setIsInviteModalVisible(true);
      }, 500); // Small delay for better UX
    }
  };

  const closeInviteModal = () => {
    setIsInviteModalVisible(false);
    setCurrentInvite(null);

    // Show next invitation if any remaining
    const remainingInvites = pendingInvites.filter(
      (invite) =>
        invite.clubId !== currentInvite?.clubId ||
        invite.groupId !== currentInvite?.groupId,
    );

    if (remainingInvites.length > 0) {
      setTimeout(() => {
        setCurrentInvite(remainingInvites[0]);
        setIsInviteModalVisible(true);
      }, 500); // Small delay for better UX
    }
  };

  const handleModalClose = () => {
    setModal({ ...modal, visible: false });
  };

  // Handle invitation click from notification bell
  const handleNotificationInvitationPress = async (
    invitationToken: string,
    metadata?: any,
  ) => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        console.error("No current user");
        return;
      }

      // Fetch the specific invitation by token (includes youth invitations)
      const { fetchInvitationByToken } =
        await import("@/services/fetchGroupInvites");
      const invitation = await fetchInvitationByToken(
        currentUser.uid,
        invitationToken,
      );

      if (invitation) {
        // Merge metadata from notification with invitation data
        setCurrentInvite({ ...invitation, metadata });
        setIsInviteModalVisible(true);
      } else {
        console.error(
          "Invitation not found or already processed:",
          invitationToken,
        );
      }
    } catch (error) {
      console.error("Error loading invitation from notification:", error);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Club Container - Unified for all 3 cases */}
      <View style={styles.clubSection}>
        {/* Case 1: No club - Show Create Club card */}
        {(!userProfile?.clubAccess || userProfile.clubAccess.length === 0) && (
          <TouchableOpacity
            style={styles.clubContainer}
            onPress={() => router.push("/create-club-form")}
            activeOpacity={0.7}
          >
            <View style={styles.clubHeader}>
              <View style={[styles.clubIcon, styles.createClubIcon]}>
                <Ionicons
                  name="add-circle"
                  size={28}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.clubInfo}>
                <Text style={styles.clubName}>
                  {t("screens:home.createClub")}
                </Text>
                <Text style={styles.clubSubtext}>
                  Start managing your sports organization
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.textSecondary}
              />
            </View>
          </TouchableOpacity>
        )}

        {/* Case 2 & 3: Has club - Show club card(s) */}
        {userProfile?.clubAccess && userProfile.clubAccess.length > 0 && (
          <>
            {userProfile.clubAccess.map((club) => {
              const isAdmin = club.role === "club-admin";
              return (
                <TouchableOpacity
                  key={club.clubId}
                  style={styles.clubContainer}
                  onPress={() => {
                    if (isAdmin) {
                      router.push(`/manage-club?clubId=${club.clubId}`);
                    }
                  }}
                  disabled={!isAdmin}
                  activeOpacity={isAdmin ? 0.7 : 1}
                >
                  <View style={styles.clubHeader}>
                    <View style={styles.clubIcon}>
                      {clubLogos[club.clubId] ? (
                        <Image
                          source={{ uri: clubLogos[club.clubId]! }}
                          style={styles.clubLogoImage}
                        />
                      ) : (
                        <Ionicons
                          name="trophy"
                          size={24}
                          color={theme.colors.secondary}
                        />
                      )}
                    </View>
                    <View style={styles.clubInfo}>
                      <Text style={styles.clubName}>{club.clubName}</Text>
                      {isAdmin ? (
                        <View style={styles.adminBadge}>
                          <Ionicons
                            name="shield-checkmark"
                            size={12}
                            color={theme.colors.secondary}
                          />
                          <Text style={styles.adminText}>
                            Admin • Tap to manage
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.clubSubtext}>Member</Text>
                      )}
                    </View>
                    {/* Info icon for all users */}
                    <TouchableOpacity
                      style={styles.infoIconButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        router.push(
                          `/club-info?clubId=${club.clubId}&mode=${isAdmin ? "edit" : "view"}`,
                        );
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons
                        name="information-circle-outline"
                        size={24}
                        color={theme.colors.textSecondary}
                      />
                    </TouchableOpacity>
                    {isAdmin && (
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={theme.colors.textSecondary}
                        style={{ marginLeft: 4 }}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.secondary} />
            <Text style={styles.loadingText}>{t("common:loading")}</Text>
          </View>
        ) : (
          <>
            {/* Urgent Payments Section - Due within 7 days */}
            {urgentPayments.length > 0 && (
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeader}>
                  <View style={styles.paymentTitleRow}>
                    <Ionicons
                      name="card-outline"
                      size={20}
                      color={theme.colors.secondary}
                    />
                    <Text style={styles.sectionTitle}>
                      {t("screens:home.pendingPayments")} (
                      {urgentPayments.length})
                    </Text>
                  </View>
                </View>
                {urgentPayments.map((payment) => (
                  <PaymentCard
                    key={`${payment.feeId}-${payment.beneficiaryId}`}
                    payment={payment}
                    onPaymentComplete={loadPendingPayments}
                  />
                ))}
              </View>
            )}

            {/* Next 7 Days Events Section */}
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {t("screens:home.upcomingEvents")}
                </Text>
                {weekEvents.length > 0 && (
                  <TouchableOpacity onPress={handleViewAllEvents}>
                    <Text style={styles.viewAllText}>
                      {t("screens:home.viewAll")}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {weekEvents.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons
                    name="calendar-outline"
                    size={48}
                    color={theme.colors.textSecondary}
                  />
                  <Text style={styles.emptyText}>
                    {t("screens:home.noUpcomingEvents")}
                  </Text>
                  <Text style={styles.emptySubtext}>
                    Check the Events tab for upcoming events
                  </Text>
                </View>
              ) : (
                <>
                  {weekEvents.slice(0, 3).map((event) => (
                    <EventCard
                      key={`${event.id}-${event.inviteeUserId}`}
                      event={event}
                      onPress={() => handleEventPress(event)}
                      currentUserId={user?.uid}
                      inviteeUserId={event.inviteeUserId}
                      inviteeName={event.inviteeName}
                      isCurrentUser={event.isCurrentUser}
                      isYouthMember={event.isYouthMember}
                    />
                  ))}

                  {weekEvents.length > 3 && (
                    <TouchableOpacity
                      style={styles.viewMoreButton}
                      onPress={handleViewAllEvents}
                    >
                      <Text style={styles.viewMoreText}>
                        View {weekEvents.length - 3} more event
                        {weekEvents.length - 3 > 1 ? "s" : ""}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={theme.colors.secondary}
                      />
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Modal */}
      <ConfirmationModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        confirmText={t("common:ok")}
        cancelText=""
        onConfirm={handleModalClose}
        onCancel={handleModalClose}
        confirmButtonTheme="primary"
      />

      {/* Alert Modal */}
      <ConfirmationModal
        visible={alertModal.visible}
        title={alertModal.title}
        message={alertModal.message}
        confirmText={t("common:ok")}
        onConfirm={hideAlert}
        onCancel={hideAlert}
      />

      {/* Group Invitation Modal */}
      {currentInvite && (
        <InvitationModal
          visible={isInviteModalVisible}
          groupName={currentInvite.groupName}
          clubName={currentInvite.clubName}
          inviterName={currentInvite.invitedByName || "Someone"}
          role={currentInvite.role}
          inviteeName={
            userProfile?.displayName || user?.displayName || undefined
          }
          invitationType={currentInvite.invitationType}
          onAccept={handleAcceptInvite}
          onReject={handleRejectInvite}
          loading={inviteLoading}
          youthData={currentInvite.youthData}
          existingYouthData={currentInvite.existingYouthData}
          metadata={currentInvite.metadata}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  tabSelector: {
    flexDirection: "row",
    backgroundColor: theme.colors.inputBackground,
    marginHorizontal: theme.layout.containerPadding,
    marginVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.xs,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.small,
  },
  activeTab: {
    backgroundColor: theme.colors.secondary,
  },
  tabText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
    marginLeft: theme.spacing.xs,
  },
  activeTabText: {
    color: theme.colors.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.layout.containerPadding,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: theme.spacing.xl,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  eventsContainer: {
    paddingBottom: theme.spacing.xl,
  },
  newsContainer: {
    paddingBottom: theme.spacing.xl,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.lg,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  loadMoreContainer: {
    paddingVertical: theme.spacing.lg,
  },

  // Event Card Styles
  eventCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },

  // Club Section Styles
  clubSection: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  clubContainer: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  clubHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  clubIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.spacing.md,
  },
  clubLogoImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  clubInfo: {
    flex: 1,
  },
  clubName: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  adminText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    marginLeft: theme.spacing.xs,
    fontWeight: theme.typography.fontWeight.medium,
  },
  createClubIcon: {
    backgroundColor: theme.colors.secondary + "20",
  },
  clubSubtext: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  infoIconButton: {
    padding: theme.spacing.xs,
    marginRight: theme.spacing.xs,
  },

  // Section Styles
  sectionContainer: {
    marginBottom: theme.spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  paymentTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  viewAllText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  viewMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
  },
  viewMoreText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
    marginRight: theme.spacing.xs,
  },

  // News Card Styles
  newsCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  newsTitle: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.sm,
  },
  newsMessage: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
});
