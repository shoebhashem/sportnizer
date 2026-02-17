/**
 * View Statistics Screen
 *
 * Displays attendance statistics for a group with filtering by event type
 * Accessible to club-admin, admin, and coach roles
 */

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
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
import { theme } from "../constants/theme";
import {
    getGroupAverage,
    getGroupStatistics,
    getSortedMemberList,
} from "../services/statistics/statisticsService";
import type {
    EventTypeFilter,
    MemberStatDisplay,
    YearlyAttendanceStatistics,
} from "../services/types/statistics";

const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

export default function ViewStatisticsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const groupId = params.groupId as string;
  const clubId = params.clubId as string;
  const groupName = decodeURIComponent((params.groupName as string) || "");

  const [statistics, setStatistics] =
    useState<YearlyAttendanceStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [selectedFilter, setSelectedFilter] = useState<EventTypeFilter>("all");
  const [memberList, setMemberList] = useState<MemberStatDisplay[]>([]);
  const [groupAverage, setGroupAverage] = useState(0);
  const [showYearPicker, setShowYearPicker] = useState(false);

  const loadStatistics = async () => {
    if (!clubId || !groupId) return;

    try {
      setLoading(true);
      console.log("📊 Loading statistics for:", {
        clubId,
        groupId,
        year: selectedYear,
      });

      const data = await getGroupStatistics(clubId, groupId, selectedYear);

      setStatistics(data);

      if (data) {
        // Calculate member list and group average for current filter
        const members = getSortedMemberList(data, selectedFilter);
        const average = getGroupAverage(data, selectedFilter);

        setMemberList(members);
        setGroupAverage(average);
      } else {
        setMemberList([]);
        setGroupAverage(0);
      }
    } catch (error: any) {
      console.error("Error loading statistics:", error);
      setStatistics(null);
      setMemberList([]);
      setGroupAverage(0);
    } finally {
      setLoading(false);
    }
  };

  // Reload when screen comes into focus or year changes
  useFocusEffect(
    useCallback(() => {
      loadStatistics();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedYear, clubId, groupId]),
  );

  // Update member list when filter changes
  const handleFilterChange = (filter: EventTypeFilter) => {
    setSelectedFilter(filter);

    if (statistics) {
      const members = getSortedMemberList(statistics, filter);
      const average = getGroupAverage(statistics, filter);

      setMemberList(members);
      setGroupAverage(average);
    }
  };

  const handleYearSelect = (year: number) => {
    setSelectedYear(year);
    setShowYearPicker(false);
  };

  const getAttendanceColor = (rate: number) => {
    if (rate >= 80) return "#4CAF50"; // Green
    if (rate >= 60) return "#FFA726"; // Orange
    return "#F44336"; // Red
  };

  const renderMemberItem = ({ item }: { item: MemberStatDisplay }) => (
    <View style={styles.memberCard}>
      <View style={styles.memberLeft}>
        {item.photoUrl ? (
          <Image source={{ uri: item.photoUrl }} style={styles.memberAvatar} />
        ) : (
          <View style={styles.memberAvatarPlaceholder}>
            <Ionicons
              name="person"
              size={24}
              color={theme.colors.textSecondary}
            />
          </View>
        )}
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.userName}</Text>
          <Text style={styles.memberEvents}>
            {item.eventsAttended}/{item.eventsInvited} events
          </Text>
        </View>
      </View>
      <View style={styles.memberRight}>
        <Text
          style={[
            styles.attendanceRate,
            { color: getAttendanceColor(item.attendanceRate) },
          ]}
        >
          {item.attendanceRate.toFixed(1)}%
        </Text>
      </View>
    </View>
  );

  const renderEmptyState = () => {
    if (loading) return null;

    return (
      <View style={styles.emptyState}>
        <Ionicons
          name="bar-chart-outline"
          size={80}
          color={theme.colors.textSecondary}
        />
        <Text style={styles.emptyTitle}>No Statistics Yet</Text>
        <Text style={styles.emptyMessage}>
          To view attendance statistics, you need to:
        </Text>
        <View style={styles.emptySteps}>
          <Text style={styles.emptyStep}>
            1. Create events and invite members
          </Text>
          <Text style={styles.emptyStep}>
            2. Record attendance after events are completed
          </Text>
          <Text style={styles.emptyStep}>
            3. Statistics will automatically appear here
          </Text>
        </View>
        <Text style={styles.emptyFooter}>
          Start by recording attendance for your first completed event!
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading statistics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{groupName}</Text>
          <Text style={styles.headerSubtitle}>
            Statistics for {selectedYear} (so far)
          </Text>
        </View>
      </View>

      {/* Year Selector */}
      <View style={styles.yearSelectorContainer}>
        <TouchableOpacity
          style={styles.yearSelector}
          onPress={() => setShowYearPicker(!showYearPicker)}
        >
          <Ionicons
            name="calendar-outline"
            size={20}
            color={theme.colors.text}
          />
          <Text style={styles.yearSelectorText}>{selectedYear}</Text>
          <Ionicons
            name={showYearPicker ? "chevron-up" : "chevron-down"}
            size={20}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>

        {showYearPicker && (
          <View style={styles.yearPickerDropdown}>
            {AVAILABLE_YEARS.map((year) => (
              <TouchableOpacity
                key={year}
                style={[
                  styles.yearOption,
                  year === selectedYear && styles.yearOptionSelected,
                ]}
                onPress={() => handleYearSelect(year)}
              >
                <Text
                  style={[
                    styles.yearOptionText,
                    year === selectedYear && styles.yearOptionTextSelected,
                  ]}
                >
                  {year}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {statistics ? (
        <>
          {/* Filter Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterContainer}
            contentContainerStyle={styles.filterContentContainer}
          >
            <TouchableOpacity
              style={[
                styles.filterTab,
                selectedFilter === "all" && styles.filterTabActive,
              ]}
              onPress={() => handleFilterChange("all")}
            >
              <Text
                style={[
                  styles.filterTabText,
                  selectedFilter === "all" && styles.filterTabTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterTab,
                selectedFilter === "training" && styles.filterTabActive,
              ]}
              onPress={() => handleFilterChange("training")}
            >
              <Text
                style={[
                  styles.filterTabText,
                  selectedFilter === "training" && styles.filterTabTextActive,
                ]}
              >
                Training
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterTab,
                selectedFilter === "match" && styles.filterTabActive,
              ]}
              onPress={() => handleFilterChange("match")}
            >
              <Text
                style={[
                  styles.filterTabText,
                  selectedFilter === "match" && styles.filterTabTextActive,
                ]}
              >
                Match
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterTab,
                selectedFilter === "other" && styles.filterTabActive,
              ]}
              onPress={() => handleFilterChange("other")}
            >
              <Text
                style={[
                  styles.filterTabText,
                  selectedFilter === "other" && styles.filterTabTextActive,
                ]}
              >
                Other
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Stats Summary Card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Group Average</Text>
                <Text
                  style={[
                    styles.summaryValue,
                    { color: getAttendanceColor(groupAverage) },
                  ]}
                >
                  {groupAverage.toFixed(1)}%
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Events</Text>
                <Text style={styles.summaryValue}>
                  {selectedFilter === "all"
                    ? statistics.groupAggregates.totalEvents
                    : statistics.groupAggregates.totalEventsByType[
                        selectedFilter
                      ]}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Members</Text>
                <Text style={styles.summaryValue}>{memberList.length}</Text>
              </View>
            </View>
          </View>

          {/* Member List */}
          <View style={styles.memberListContainer}>
            <Text style={styles.memberListTitle}>
              Member Statistics ({memberList.length})
            </Text>
            <FlatList
              data={memberList}
              renderItem={renderMemberItem}
              keyExtractor={(item) => item.userId}
              contentContainerStyle={styles.memberListContent}
              ListEmptyComponent={
                <Text style={styles.noMembersText}>
                  No member data available for this filter
                </Text>
              }
            />
          </View>
        </>
      ) : (
        renderEmptyState()
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    marginRight: theme.spacing.md,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  headerSubtitle: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  yearSelectorContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  yearSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.medium,
    gap: theme.spacing.sm,
  },
  yearSelectorText: {
    flex: 1,
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
  },
  yearPickerDropdown: {
    marginTop: theme.spacing.xs,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    overflow: "hidden",
  },
  yearOption: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  yearOptionSelected: {
    backgroundColor: theme.colors.primary + "20",
  },
  yearOptionText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
  },
  yearOptionTextSelected: {
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.primary,
  },
  filterContainer: {
    maxHeight: 50,
  },
  filterContentContainer: {
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  filterTab: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.medium,
    backgroundColor: theme.colors.inputBackground,
  },
  filterTabActive: {
    backgroundColor: theme.colors.primary,
  },
  filterTabText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  filterTabTextActive: {
    color: theme.colors.white,
  },
  summaryCard: {
    margin: theme.spacing.lg,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  summaryItem: {
    alignItems: "center",
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: theme.colors.border,
  },
  summaryLabel: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  summaryValue: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  memberListContainer: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
  },
  memberListTitle: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  memberListContent: {
    paddingBottom: theme.spacing.xl,
  },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    marginBottom: theme.spacing.sm,
  },
  memberLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: theme.spacing.md,
  },
  memberAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.inputBackground,
  },
  memberAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: "center",
    alignItems: "center",
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  memberEvents: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  memberRight: {
    alignItems: "flex-end",
  },
  attendanceRate: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
  },
  noMembersText: {
    textAlign: "center",
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xl,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: theme.typography.fontSize.xlarge,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  emptyMessage: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: theme.spacing.md,
  },
  emptySteps: {
    alignSelf: "stretch",
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.medium,
    marginVertical: theme.spacing.md,
  },
  emptyStep: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    lineHeight: 24,
  },
  emptyFooter: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.semibold,
    textAlign: "center",
    marginTop: theme.spacing.md,
  },
});
