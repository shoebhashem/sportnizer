// Events Tab - Show all upcoming and past events
// Includes filtering by event type and chronological display

import EventCard from "@/components/EventCard";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import {
    filterEventsByType,
    getAllUpcomingEvents,
    getPastEvents,
} from "@/services/event/eventService";
import type { EventData } from "@/services/types/event";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
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

export default function EventsTab() {
  const router = useRouter();
  const { user } = useAuth();
  const [events, setEvents] = useState<EventData[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState<EventFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      console.log(`Loading ${timeFilter} events...`);

      let loadedEvents: EventData[];
      if (timeFilter === "upcoming") {
        loadedEvents = await getAllUpcomingEvents();
      } else {
        loadedEvents = await getPastEvents();
      }

      setEvents(loadedEvents);

      // Apply event type filter
      const filtered = filterEventsByType(loadedEvents, eventTypeFilter);
      setFilteredEvents(filtered);

      console.log(
        `Loaded ${loadedEvents.length} events, showing ${filtered.length} after filter`,
      );
    } catch (error) {
      console.error("Error loading events:", error);
      setEvents([]);
      setFilteredEvents([]);
    } finally {
      setLoading(false);
    }
  }, [timeFilter, eventTypeFilter]);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  };

  const handleEventTypeFilter = (filter: EventFilter) => {
    setEventTypeFilter(filter);
    const filtered = filterEventsByType(events, filter);
    setFilteredEvents(filtered);
  };

  const handleTimeFilter = (filter: TimeFilter) => {
    setTimeFilter(filter);
    // loadEvents will be called automatically via useFocusEffect dependency
  };

  const handleEventPress = (event: EventData) => {
    console.log("Navigating to event:", {
      eventId: event.id,
      clubId: event.clubId,
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
                  key={event.id}
                  event={event}
                  onPress={() => handleEventPress(event)}
                  currentUserId={user?.uid}
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
