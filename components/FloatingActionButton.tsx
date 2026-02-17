import { theme } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, ViewStyle } from "react-native";

interface FloatingActionButtonProps {
  onPress: () => void;
  text?: string;
  style?: ViewStyle;
}

export default function FloatingActionButton({
  onPress,
  text = "New Event",
  style,
}: FloatingActionButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.fab, style]}>
      <Text style={styles.fabText}>{text}</Text>
      <Ionicons name="add" size={20} color={theme.colors.secondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: 80,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: theme.colors.secondary,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 10,
  },
  fabText: {
    position: "absolute",
    top: -28,
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.secondary,
    textAlign: "center",
    width: 80,
  },
});
