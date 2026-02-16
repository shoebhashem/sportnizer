// Events Tab - Show all upcoming and past events
// Includes filtering by event type and chronological display

import EventCard from "@/components/EventCard";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useEvents } from "@/contexts/EventContext";
import { useUser } from "@/contexts/UserContext";
import { fetchDependentProfiles } from "@/services/fetchDependentProfiles";
import type { EventData } from "@/services/types/event";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type EventFilter = "all" | "training" | "match" | "meeting" | "other";
type TimeFilter = "upcoming" | "past";

interface ExpandedEventData extends EventData {
  inviteeUserId: string;
  inviteeName: string;
  isCurrentUser: boolean;
  isYouthMember: boolean;
  responseStatus: string;
}

export default function EventsTab() {
  const router = useRouter();
  const { user } = useAuth();
  const { userProfile } = useUser();
  const {
    events: contextEvents,
    refreshEvents,
    isLoading: eventsLoading,
  } = useEvents();
  const [events, setEvents] = useState<EventData[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<ExpandedEventData[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<ExpandedEventData[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState<EventFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");

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

  // Process events from EventContext - filter by time and expand for invitees
  useEffect(() => {
    const processEvents = async () => {
      if (!user?.uid) {
        setEvents([]);
        setExpandedEvents([]);
        setFilteredEvents([]);
        return;
      }

      try {
        console.log(`Processing ${timeFilter} events from context...`);

        // Filter events by time
        const now = new Date();
        const timeFilteredEvents = contextEvents.filter((event) => {
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
          if (timeFilter === "upcoming") {
            return eventDate >= now;
          } else {
            return eventDate < now;
          }
        });

        // Sort events based on time filter
        // Upcoming: soonest first (ascending), Past: most recent first (descending)
        const sortedEvents = [...timeFilteredEvents].sort((a, b) => {
          const dateA = convertTimestampToDate(a.startDate);
          const dateB = convertTimestampToDate(b.startDate);
          const timeA =
            dateA instanceof Date ? dateA.getTime() : new Date(dateA).getTime();
          const timeB =
            dateB instanceof Date ? dateB.getTime() : new Date(dateB).getTime();

          if (timeFilter === "upcoming") {
            return timeA - timeB; // Ascending: soonest first
          } else {
            return timeB - timeA; // Descending: most recent first
          }
        });

        // Fetch dependents to know which children to show
        const dependentProfiles = userProfile?.dependents
          ? await fetchDependentProfiles(userProfile.dependents)
          : [];
        const dependentIds = dependentProfiles.map((d) => d.uid);

        // Expand events: create separate card for each invitee
        const expanded: ExpandedEventData[] = [];

        for (const event of sortedEvents) {
          if (!event.responses) continue;

          // Filter responses to current user + dependents
          const relevantResponses = event.responses.filter(
            (r) => r.userId === user?.uid || dependentIds.includes(r.userId),
          );

          // Create a card for each relevant invitee
          for (const response of relevantResponses) {
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
              inviteeName: response.userName,
              isCurrentUser: response.userId === user?.uid,
              isYouthMember: response.isYouthMember || false,
              responseStatus: response.response || response.status || "pending",
            });
          }
        }

        setEvents(sortedEvents);
        setExpandedEvents(expanded);

        // Apply event type filter to expanded events
        const filtered = expanded.filter(
          (e) => eventTypeFilter === "all" || e.eventType === eventTypeFilter,
        );
        setFilteredEvents(filtered);

        console.log(
          `Processed ${sortedEvents.length} events, expanded to ${expanded.length} cards, showing ${filtered.length} after filter`,
        );
      } catch (error) {
        console.error("Error processing events:", error);
        setEvents([]);
        setExpandedEvents([]);
        setFilteredEvents([]);
      }
    };

    processEvents();
  }, [
    contextEvents,
    timeFilter,
    eventTypeFilter,
    user?.uid,
    userProfile?.dependents,
  ]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshEvents();
    } catch (error) {
      console.error("Error refreshing events:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleEventTypeFilter = (filter: EventFilter) => {
    setEventTypeFilter(filter);
    const filtered = expandedEvents.filter(
      (e) => filter === "all" || e.eventType === filter,
    );
    setFilteredEvents(filtered);
  };

  const handleTimeFilter = (filter: TimeFilter) => {
    setTimeFilter(filter);
    // Events will be filtered automatically via useEffect dependency
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
      Alert.alert("Error", "Cannot open event: missing information");
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

  const getFilterIcon = (filter: EventFilter) => {
    switch (filter) {
      case "all":
        return "apps-outline" as const;
      case "training":
        return "fitness-outline" as const;
      case "match":
        return "trophy-outline" as const;
      case "meeting":
        return "people-outline" as const;
      case "other":
        return "ellipsis-horizontal-outline" as const;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Events</Text>
      </View>

      {/* Time Filter (Upcoming / Past) */}
      <View style={styles.timeFilterContainer}>
        <TouchableOpacity
          style={[
            styles.timeFilterButton,
            timeFilter === "upcoming" && styles.activeTimeFilter,
          ]}
          onPress={() => handleTimeFilter("upcoming")}
        >
          <Text
            style={[
              styles.timeFilterText,
              timeFilter === "upcoming" && styles.activeTimeFilterText,
            ]}
          >
            Upcoming
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.timeFilterButton,
            timeFilter === "past" && styles.activeTimeFilter,
          ]}
          onPress={() => handleTimeFilter("past")}
        >
          <Text
            style={[
              styles.timeFilterText,
              timeFilter === "past" && styles.activeTimeFilterText,
            ]}
          >
            Past
          </Text>
        </TouchableOpacity>
      </View>

      {/* Event Type Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        {(
          ["all", "training", "match", "meeting", "other"] as EventFilter[]
        ).map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.filterButton,
              eventTypeFilter === filter && styles.activeFilter,
            ]}
            onPress={() => handleEventTypeFilter(filter)}
          >
            <Ionicons
              name={getFilterIcon(filter)}
              size={16}
              color={
                eventTypeFilter === filter
                  ? theme.colors.white
                  : theme.colors.secondary
              }
            />
            <Text
              style={[
                styles.filterText,
                eventTypeFilter === filter && styles.activeFilterText,
              ]}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Events List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading events...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          {filteredEvents.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="calendar-outline"
                size={64}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.emptyText}>
                No {timeFilter} events
                {eventTypeFilter !== "all" && ` for ${eventTypeFilter}`}
              </Text>
              <Text style={styles.emptySubtext}>
                {timeFilter === "upcoming"
                  ? "Check back later or try a different filter"
                  : "No past events found in the last 6 months"}
              </Text>
            </View>
          ) : (
            <>
              {filteredEvents.map((event) => (
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

              <View style={styles.bottomPadding} />
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: theme.layout.containerPadding,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.xxlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.white,
  },
  timeFilterContainer: {
    flexDirection: "row",
    backgroundColor: theme.colors.inputBackground,
    marginHorizontal: theme.layout.containerPadding,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.xs,
  },
  timeFilterButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: "center",
    borderRadius: theme.borderRadius.small,
  },
  activeTimeFilter: {
    backgroundColor: theme.colors.secondary,
  },
  timeFilterText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
  },
  activeTimeFilterText: {
    color: theme.colors.white,
  },
  filterContainer: {
    maxHeight: 50,
    marginBottom: theme.spacing.sm,
  },
  filterContent: {
    paddingHorizontal: theme.layout.containerPadding,
    gap: theme.spacing.sm,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.inputBackground,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
  },
  activeFilter: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  filterText: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.secondary,
    marginLeft: theme.spacing.xs,
  },
  activeFilterText: {
    color: theme.colors.white,
  },
  content: {
    flex: 1,
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
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xxl * 2,
    paddingHorizontal: theme.layout.containerPadding,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    textAlign: "center",
  },
  bottomPadding: {
    height: theme.spacing.xl,
  },
});
