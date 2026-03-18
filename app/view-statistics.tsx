/**
 * View Statistics Screen
 *
 * Displays attendance statistics for a group with filtering by event type
 * Accessible to club-admin, admin, and coach roles
 */

import { Ionicons } from "@expo/vector-icons";
import {
    useFocusEffect,
    useLocalSearchParams,
    useNavigation,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    FlatList,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const { t } = useTranslation(["screens", "common"]);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const navigation = useNavigation();

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
  const [showFilters, setShowFilters] = useState(false);

  // Set dynamic native header title
  useLayoutEffect(() => {
    navigation.setOptions({
      title: groupName
        ? t("screens:viewStatistics.groupStatistics", { groupName })
        : t("screens:viewStatistics.statistics"),
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setShowFilters((prev) => !prev)}
          style={{ marginRight: 8, padding: 8 }}
        >
          <Ionicons
            name={selectedFilter !== "all" ? "filter" : "filter-outline"}
            size={24}
            color={theme.colors.secondary}
          />
          {selectedFilter !== "all" && (
            <View
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.colors.error,
              }}
            />
          )}
        </TouchableOpacity>
      ),
    });
  }, [groupName, navigation, t, selectedFilter]);

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
            {t("screens:viewStatistics.attendedOfInvited", {
              attended: item.eventsAttended,
              invited: item.eventsInvited,
            })}
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
        <Text style={styles.emptyTitle}>
          {t("screens:viewStatistics.noStatisticsYet")}
        </Text>
        <Text style={styles.emptyMessage}>
          {t("screens:viewStatistics.noStatisticsInstructions")}
        </Text>
        <View style={styles.emptySteps}>
          <Text style={styles.emptyStep}>
            {t("screens:viewStatistics.step1")}
          </Text>
          <Text style={styles.emptyStep}>
            {t("screens:viewStatistics.step2")}
          </Text>
          <Text style={styles.emptyStep}>
            {t("screens:viewStatistics.step3")}
          </Text>
        </View>
        <Text style={styles.emptyFooter}>
          {t("screens:viewStatistics.startRecording")}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>
            {t("screens:viewStatistics.loadingStatistics")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />

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
          {showFilters && (
            <View style={styles.filterContainer}>
              {(["all", "training", "match", "other"] as EventTypeFilter[]).map(
                (filter) => (
                  <TouchableOpacity
                    key={filter}
                    style={[
                      styles.filterTab,
                      selectedFilter === filter && styles.filterTabActive,
                    ]}
                    onPress={() => handleFilterChange(filter)}
                  >
                    <Text
                      style={[
                        styles.filterTabText,
                        selectedFilter === filter && styles.filterTabTextActive,
                      ]}
                    >
                      {t(
                        `screens:viewStatistics.filter${filter.charAt(0).toUpperCase() + filter.slice(1)}`,
                      )}
                    </Text>
                  </TouchableOpacity>
                ),
              )}
            </View>
          )}

          {/* Stats Summary Card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>
                  {t("screens:viewStatistics.groupAverage")}
                </Text>
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
                <Text style={styles.summaryLabel}>
                  {t("screens:viewStatistics.totalEvents")}
                </Text>
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
                <Text style={styles.summaryLabel}>
                  {t("screens:viewStatistics.members")}
                </Text>
                <Text style={styles.summaryValue}>{memberList.length}</Text>
              </View>
            </View>
          </View>

          {/* Member List */}
          <View style={styles.memberListContainer}>
            <Text style={styles.memberListTitle}>
              {t("screens:viewStatistics.memberStatistics", {
                count: memberList.length,
              })}
            </Text>
            <FlatList
              data={memberList}
              renderItem={renderMemberItem}
              keyExtractor={(item) => item.userId}
              contentContainerStyle={styles.memberListContent}
              ListEmptyComponent={
                <Text style={styles.noMembersText}>
                  {t("screens:viewStatistics.noMemberData")}
                </Text>
              }
            />
          </View>
        </>
      ) : (
        renderEmptyState()
      )}
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
    gap: theme.spacing.md,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
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
    flexDirection: "row",
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: 4,
  },
  filterTab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: "center",
    borderRadius: theme.borderRadius.small,
  },
  filterTabActive: {
    backgroundColor: theme.colors.secondary,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  filterTabTextActive: {
    color: theme.colors.primary,
  },
  summaryCard: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
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
    height: 30,
    backgroundColor: theme.colors.border,
  },
  summaryLabel: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: theme.typography.fontSize.large,
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
