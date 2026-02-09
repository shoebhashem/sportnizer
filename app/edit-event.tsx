// Edit Event Screen - Update existing event details
// Features: Pre-populated form, send notifications on critical changes

import Button from "@/components/Button";
import CustomDateTimePicker from "@/components/DateTimePicker";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebaseConfig";
import { getEventDetails } from "@/services/event/eventService";
import type { EventData } from "@/services/types/event";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    doc,
    getDoc,
    serverTimestamp,
    setDoc,
    updateDoc,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type EventType = "training" | "match" | "meeting" | "other";

export default function EditEventScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams();

  const eventId = params.eventId as string;
  const clubId = params.clubId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [originalEvent, setOriginalEvent] = useState<EventData | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState<EventType>("training");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [maxCapacity, setMaxCapacity] = useState("");
  const [capacityEnabled, setCapacityEnabled] = useState(false);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [deadlineEnabled, setDeadlineEnabled] = useState(false);

  // Date picker visibility
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);

  useEffect(() => {
    loadEventData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, clubId]);

  const loadEventData = async () => {
    if (!eventId || !clubId) {
      Alert.alert("Error", "Missing event or club ID");
      router.back();
      return;
    }

    try {
      setLoading(true);
      const eventData = await getEventDetails(eventId, clubId);

      if (!eventData) {
        Alert.alert("Error", "Event not found");
        router.back();
        return;
      }

      // Store original event for comparison
      setOriginalEvent(eventData);

      // Populate form
      setTitle(eventData.title);
      setDescription(eventData.description || "");
      setEventType(
        (eventData.eventType?.toLowerCase() as EventType) || "training",
      );
      setLocation(eventData.location || "");

      // Convert dates (they might be Date objects or strings)
      setStartDate(
        eventData.startDate instanceof Date
          ? eventData.startDate
          : new Date(eventData.startDate as any),
      );
      setEndDate(
        eventData.endDate
          ? eventData.endDate instanceof Date
            ? eventData.endDate
            : new Date(eventData.endDate as any)
          : eventData.startDate instanceof Date
            ? eventData.startDate
            : new Date(eventData.startDate as any),
      );

      if (eventData.maxCapacity) {
        setCapacityEnabled(true);
        setMaxCapacity(eventData.maxCapacity.toString());
      }

      if (eventData.deadline) {
        setDeadlineEnabled(true);
        setDeadline(
          eventData.deadline instanceof Date
            ? eventData.deadline
            : new Date(eventData.deadline as any),
        );
      }
    } catch (error) {
      console.error("Error loading event:", error);
      Alert.alert("Error", "Failed to load event data");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    if (!title.trim()) {
      Alert.alert("Validation Error", "Please enter an event title");
      return false;
    }

    if (startDate >= endDate) {
      Alert.alert("Validation Error", "End time must be after start time");
      return false;
    }

    if (deadlineEnabled && deadline && deadline >= startDate) {
      Alert.alert(
        "Validation Error",
        "Response deadline must be before event start time",
      );
      return false;
    }

    if (capacityEnabled) {
      const capacity = parseInt(maxCapacity, 10);
      if (isNaN(capacity) || capacity < 1) {
        Alert.alert(
          "Validation Error",
          "Please enter a valid capacity (minimum 1)",
        );
        return false;
      }
    }

    return true;
  };

  const hasChanges = () => {
    if (!originalEvent) return false;

    // Convert originalEvent dates to Date objects for comparison
    const originalStartDate =
      originalEvent.startDate instanceof Date
        ? originalEvent.startDate
        : new Date(originalEvent.startDate as any);
    const originalEndDate = originalEvent.endDate
      ? originalEvent.endDate instanceof Date
        ? originalEvent.endDate
        : new Date(originalEvent.endDate as any)
      : originalStartDate;

    return (
      title !== originalEvent.title ||
      description !== (originalEvent.description || "") ||
      eventType !== (originalEvent.eventType?.toLowerCase() || "training") ||
      location !== (originalEvent.location || "") ||
      startDate.getTime() !== originalStartDate.getTime() ||
      endDate.getTime() !== originalEndDate.getTime() ||
      (capacityEnabled &&
        parseInt(maxCapacity, 10) !== originalEvent.maxCapacity) ||
      (deadlineEnabled &&
        deadline &&
        originalEvent.deadline &&
        deadline.getTime() !==
          (originalEvent.deadline instanceof Date
            ? originalEvent.deadline.getTime()
            : new Date(originalEvent.deadline as any).getTime()))
    );
  };

  const hasCriticalChanges = () => {
    if (!originalEvent) return false;

    // Convert originalEvent dates to Date objects for comparison
    const originalStartDate =
      originalEvent.startDate instanceof Date
        ? originalEvent.startDate
        : new Date(originalEvent.startDate as any);
    const originalEndDate = originalEvent.endDate
      ? originalEvent.endDate instanceof Date
        ? originalEvent.endDate
        : new Date(originalEvent.endDate as any)
      : originalStartDate;

    // Critical changes that require notification
    return (
      startDate.getTime() !== originalStartDate.getTime() ||
      endDate.getTime() !== originalEndDate.getTime() ||
      location !== (originalEvent.location || "")
    );
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    if (!hasChanges()) {
      Alert.alert("No Changes", "You haven't made any changes to the event");
      return;
    }

    try {
      setSaving(true);

      const eventRef = doc(db, `clubs/${clubId}/events/${eventId}`);

      // Build update object
      const updates: any = {
        title: title.trim(),
        description: description.trim(),
        eventType: eventType,
        location: location.trim(),
        startDate: startDate,
        endDate: endDate,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid,
      };

      // Update capacity
      if (capacityEnabled) {
        updates.maxCapacity = parseInt(maxCapacity, 10);
      } else {
        updates.maxCapacity = null;
      }

      // Update deadline
      if (deadlineEnabled && deadline) {
        updates.deadline = deadline;
      } else {
        updates.deadline = null;
      }

      // Save to Firestore
      await updateDoc(eventRef, updates);

      // If critical changes, send notifications
      if (hasCriticalChanges() && originalEvent) {
        await sendUpdateNotifications();
      }

      Alert.alert("Success", "Event updated successfully", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error("Error updating event:", error);
      Alert.alert("Error", "Failed to update event. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const sendUpdateNotifications = async () => {
    try {
      // Get event data to find all invitees
      const eventRef = doc(db, `clubs/${clubId}/events/${eventId}`);
      const eventSnap = await getDoc(eventRef);

      if (!eventSnap.exists()) return;

      const eventData = eventSnap.data();
      const invitedUserIds = eventData.invitedUserIds || [];

      // Create notifications for all invitees
      const notificationPromises = invitedUserIds.map(
        async (userId: string) => {
          const notificationRef = doc(
            db,
            `users/${userId}/notifications/${eventId}_update_${Date.now()}`,
          );

          await setDoc(notificationRef, {
            type: "event_updated",
            eventId: eventId,
            eventTitle: title,
            clubId: clubId,
            message: `Event "${title}" has been updated`,
            read: false,
            createdAt: serverTimestamp(),
          });
        },
      );

      await Promise.all(notificationPromises);
      console.log(
        `Sent update notifications to ${invitedUserIds.length} users`,
      );
    } catch (error) {
      console.error("Error sending notifications:", error);
      // Don't block the save if notifications fail
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Loading event data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backIcon}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Event</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Event Type */}
        <View style={styles.section}>
          <Text style={styles.label}>Event Type *</Text>
          <View style={styles.typeContainer}>
            {(["training", "match", "meeting", "other"] as EventType[]).map(
              (type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeButton,
                    eventType === type && styles.typeButtonActive,
                  ]}
                  onPress={() => setEventType(type)}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      eventType === type && styles.typeButtonTextActive,
                    ]}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ),
            )}
          </View>
        </View>

        {/* Title */}
        <View style={styles.section}>
          <Text style={styles.label}>Event Title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Enter event title"
            placeholderTextColor={theme.colors.textSecondary}
          />
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Enter event description"
            placeholderTextColor={theme.colors.textSecondary}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Location */}
        <View style={styles.section}>
          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="Enter event location"
            placeholderTextColor={theme.colors.textSecondary}
          />
        </View>

        {/* Start Date & Time */}
        <View style={styles.section}>
          <Text style={styles.label}>Start Date & Time *</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowStartDatePicker(true)}
          >
            <Ionicons
              name="calendar-outline"
              size={20}
              color={theme.colors.secondary}
            />
            <Text style={styles.dateButtonText}>
              {format(startDate, "EEEE, MMMM d, yyyy - h:mm a")}
            </Text>
          </TouchableOpacity>
          {showStartDatePicker && (
            <CustomDateTimePicker
              value={startDate}
              mode="date"
              isVisible={showStartDatePicker}
              onConfirm={(date: Date) => {
                setStartDate(date);
                // Auto-adjust end date if needed
                if (date >= endDate) {
                  const newEndDate = new Date(date.getTime() + 60 * 60 * 1000); // +1 hour
                  setEndDate(newEndDate);
                }
                setShowStartDatePicker(false);
              }}
              onCancel={() => setShowStartDatePicker(false)}
            />
          )}
        </View>

        {/* End Date & Time */}
        <View style={styles.section}>
          <Text style={styles.label}>End Date & Time *</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowEndDatePicker(true)}
          >
            <Ionicons
              name="calendar-outline"
              size={20}
              color={theme.colors.secondary}
            />
            <Text style={styles.dateButtonText}>
              {format(endDate, "EEEE, MMMM d, yyyy - h:mm a")}
            </Text>
          </TouchableOpacity>
          {showEndDatePicker && (
            <CustomDateTimePicker
              value={endDate}
              mode="date"
              isVisible={showEndDatePicker}
              onConfirm={(date: Date) => {
                setEndDate(date);
                setShowEndDatePicker(false);
              }}
              onCancel={() => setShowEndDatePicker(false)}
            />
          )}
        </View>

        {/* Capacity */}
        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <Text style={styles.label}>Limit Capacity</Text>
            <TouchableOpacity
              style={[styles.toggle, capacityEnabled && styles.toggleActive]}
              onPress={() => setCapacityEnabled(!capacityEnabled)}
            >
              <View
                style={[
                  styles.toggleThumb,
                  capacityEnabled && styles.toggleThumbActive,
                ]}
              />
            </TouchableOpacity>
          </View>
          {capacityEnabled && (
            <TextInput
              style={[styles.input, styles.inputSmall]}
              value={maxCapacity}
              onChangeText={setMaxCapacity}
              placeholder="Max attendees"
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="number-pad"
            />
          )}
        </View>

        {/* Response Deadline */}
        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <Text style={styles.label}>Response Deadline</Text>
            <TouchableOpacity
              style={[styles.toggle, deadlineEnabled && styles.toggleActive]}
              onPress={() => setDeadlineEnabled(!deadlineEnabled)}
            >
              <View
                style={[
                  styles.toggleThumb,
                  deadlineEnabled && styles.toggleThumbActive,
                ]}
              />
            </TouchableOpacity>
          </View>
          {deadlineEnabled && (
            <>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDeadlinePicker(true)}
              >
                <Ionicons
                  name="alarm-outline"
                  size={20}
                  color={theme.colors.warning}
                />
                <Text style={styles.dateButtonText}>
                  {deadline
                    ? format(deadline, "MMMM d, yyyy - h:mm a")
                    : "Set deadline"}
                </Text>
              </TouchableOpacity>
              {showDeadlinePicker && (
                <CustomDateTimePicker
                  value={deadline || new Date()}
                  mode="date"
                  isVisible={showDeadlinePicker}
                  onConfirm={(date: Date) => {
                    setDeadline(date);
                    setShowDeadlinePicker(false);
                  }}
                  onCancel={() => setShowDeadlinePicker(false)}
                />
              )}
            </>
          )}
        </View>

        {/* Warning about critical changes */}
        {hasCriticalChanges() && (
          <View style={styles.warningContainer}>
            <Ionicons
              name="warning-outline"
              size={24}
              color={theme.colors.warning}
            />
            <Text style={styles.warningText}>
              Changes to date, time, or location will notify all invitees
            </Text>
          </View>
        )}

        {/* Save Button */}
        <View style={styles.buttonContainer}>
          <Button
            label={saving ? "Saving..." : "Save Changes"}
            onPress={handleSave}
            disabled={saving || !hasChanges()}
            loading={saving}
          />
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
  },
  content: {
    flex: 1,
  },
  section: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.white,
    marginBottom: theme.spacing.sm,
  },
  label: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  input: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  inputSmall: {
    marginTop: theme.spacing.sm,
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  typeContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  typeButton: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
    backgroundColor: theme.colors.white,
  },
  typeButtonActive: {
    backgroundColor: theme.colors.secondary,
  },
  typeButtonText: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.secondary,
  },
  typeButtonTextActive: {
    color: theme.colors.white,
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  dateButtonText: {
    flex: 1,
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.inputBorder,
    justifyContent: "center",
    padding: 2,
  },
  toggleActive: {
    backgroundColor: theme.colors.success,
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.colors.white,
  },
  toggleThumbActive: {
    alignSelf: "flex-end",
  },
  warningContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.warningBackground || "#FFF3CD",
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.borderRadius.medium,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.warning,
  },
  warningText: {
    flex: 1,
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.warning,
    marginLeft: theme.spacing.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
  buttonContainer: {
    padding: theme.spacing.lg,
  },
  bottomPadding: {
    height: theme.spacing.xl,
  },
});
