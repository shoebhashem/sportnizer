import { FontAwesome } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Platform,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Button from "../components/Button";
import ConfirmationModal from "../components/ConfirmationModal";
import { theme } from "../constants/theme";
import { auth, db } from "../services/core/firebase";

export default function ScheduleEventScreen() {
  const { t } = useTranslation(["screens", "common"]);
  const router = useRouter();
  const { eventData, selectedGroups, selectedMembers } = useLocalSearchParams();
  const [creating, setCreating] = useState(false);

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

  const parsedEventData = eventData ? JSON.parse(eventData as string) : null;
  const parsedSelectedGroups = selectedGroups
    ? JSON.parse(selectedGroups as string)
    : [];
  const parsedSelectedMembers = selectedMembers
    ? JSON.parse(selectedMembers as string)
    : [];

  const formatDateTime = (date: Date, time: Date) => {
    const eventDateTime = new Date(date);
    const timeDate = new Date(time);
    eventDateTime.setHours(timeDate.getHours(), timeDate.getMinutes());
    return eventDateTime;
  };

  const handleCreateEvent = async () => {
    if (!auth.currentUser || !parsedEventData) {
      showAlert(t("common:error"), "Unable to create event");
      return;
    }

    try {
      setCreating(true);

      const eventDateTime = formatDateTime(
        new Date(parsedEventData.date),
        new Date(parsedEventData.time),
      );

      const eventDoc = {
        title: parsedEventData.title,
        description: parsedEventData.description,
        type: parsedEventData.type,
        location: parsedEventData.location,
        dateTime: eventDateTime,
        groupIds: parsedSelectedGroups,
        memberIds: parsedSelectedMembers,
        createdBy: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        responses: [], // Will store member responses
        status: "scheduled", // scheduled, cancelled, completed
      };

      await addDoc(collection(db, "events"), eventDoc);

      showAlert(t("common:success"), "Event created successfully!", () => {
        // Navigate back to events tab
        router.replace("/(tabs)/events" as any);
      });
    } catch (error) {
      console.error("Error creating event:", error);
      showAlert(t("common:error"), "Failed to create event. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const getEventTypeIcon = (type: string) => {
    switch (type) {
      case "practice":
        return "dribbble";
      case "game":
        return "trophy";
      case "meeting":
        return "users";
      case "other":
        return "calendar";
      default:
        return "calendar";
    }
  };

  const formatDisplayDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatDisplayTime = (time: Date) => {
    return new Date(time).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  if (!parsedEventData) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <Text style={{ color: theme.colors.text, fontSize: 16 }}>
            Error loading event data
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
      {/* Header */}
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
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "bold",
              color: theme.colors.text,
            }}
          >
            {t("screens:scheduleEvent.reviewAndSchedule")}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textSecondary,
              marginTop: 2,
            }}
          >
            Confirm event details before scheduling
          </Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* Event Summary Card */}
        <View
          style={{
            backgroundColor: theme.colors.inputBackground,
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: theme.colors.inputBorder,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: theme.colors.secondary + "20",
                justifyContent: "center",
                alignItems: "center",
                marginRight: 16,
              }}
            >
              <FontAwesome
                name={getEventTypeIcon(parsedEventData.type) as any}
                size={20}
                color={theme.colors.secondary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: 20,
                  fontWeight: "bold",
                }}
              >
                {parsedEventData.title}
              </Text>
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: 14,
                  textTransform: "capitalize",
                  marginTop: 2,
                }}
              >
                {parsedEventData.type}
              </Text>
            </View>
          </View>

          {/* Date & Time */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <FontAwesome
              name="calendar"
              size={16}
              color={theme.colors.textSecondary}
            />
            <Text
              style={{ color: theme.colors.text, marginLeft: 12, fontSize: 16 }}
            >
              {formatDisplayDate(new Date(parsedEventData.date))}
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <FontAwesome
              name="clock-o"
              size={16}
              color={theme.colors.textSecondary}
            />
            <Text
              style={{ color: theme.colors.text, marginLeft: 12, fontSize: 16 }}
            >
              {formatDisplayTime(new Date(parsedEventData.time))}
            </Text>
          </View>

          {/* Location */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <FontAwesome
              name="map-marker"
              size={16}
              color={theme.colors.textSecondary}
            />
            <Text
              style={{ color: theme.colors.text, marginLeft: 12, fontSize: 16 }}
            >
              {parsedEventData.location}
            </Text>
          </View>

          {/* Description */}
          {parsedEventData.description && (
            <View style={{ marginTop: 8 }}>
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: 14,
                  marginBottom: 4,
                }}
              >
                Description:
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: 14,
                  lineHeight: 20,
                }}
              >
                {parsedEventData.description}
              </Text>
            </View>
          )}
        </View>

        {/* Recipients Summary */}
        <View
          style={{
            backgroundColor: theme.colors.inputBackground,
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: theme.colors.inputBorder,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <FontAwesome
              name="users"
              size={16}
              color={theme.colors.textSecondary}
            />
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 16,
                fontWeight: "600",
                marginLeft: 12,
              }}
            >
              Event Recipients
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <Text style={{ color: theme.colors.textSecondary, fontSize: 14 }}>
              Groups:
            </Text>
            <Text style={{ color: theme.colors.text, fontSize: 14 }}>
              {parsedSelectedGroups.length} selected
            </Text>
          </View>

          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text style={{ color: theme.colors.textSecondary, fontSize: 14 }}>
              Members:
            </Text>
            <Text style={{ color: theme.colors.text, fontSize: 14 }}>
              {parsedSelectedMembers.length} invited
            </Text>
          </View>
        </View>

        {/* Important Notes */}
        <View
          style={{
            backgroundColor: theme.colors.secondary + "10",
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: theme.colors.secondary + "30",
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
              name="info-circle"
              size={16}
              color={theme.colors.secondary}
            />
            <Text
              style={{
                color: theme.colors.secondary,
                fontSize: 14,
                fontWeight: "600",
                marginLeft: 8,
              }}
            >
              Important
            </Text>
          </View>
          <Text
            style={{ color: theme.colors.text, fontSize: 14, lineHeight: 20 }}
          >
            Once created, event invitations will be sent to all selected
            members. They will be able to respond with their availability.
          </Text>
        </View>
      </ScrollView>

      {/* Bottom Actions */}
      <View
        style={{
          padding: 16,
          borderTopWidth: 1,
          borderTopColor: theme.colors.inputBorder,
          paddingBottom: Platform.OS === "ios" ? 34 : 16,
        }}
      >
        <Button
          label={
            creating
              ? t("common:creating")
              : t("screens:createEvent.createEvent")
          }
          onPress={handleCreateEvent}
          disabled={creating}
          loading={creating}
        />

        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            alignItems: "center",
            paddingVertical: 12,
            marginTop: 8,
          }}
          disabled={creating}
        >
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: 14,
              opacity: creating ? 0.5 : 1,
            }}
          >
            Back to Recipients
          </Text>
        </TouchableOpacity>
      </View>
      {/* Alert Modal */}
      <ConfirmationModal
        visible={alertModal.visible}
        title={alertModal.title}
        message={alertModal.message}
        confirmText={t("common:ok")}
        onConfirm={hideAlert}
        onCancel={hideAlert}
      />
    </SafeAreaView>
  );
}
