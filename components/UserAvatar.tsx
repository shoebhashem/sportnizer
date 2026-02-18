import { useRouter } from "expo-router";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { getDefaultProfilePicture } from "../constants/profilePictures";
import { theme } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";
import { useUserProfile } from "../contexts/UserContext";

export default function UserAvatar() {
  const { user } = useAuth();
  const router = useRouter();
  const { userProfile } = useUserProfile();

  if (!user || !userProfile) return null;

  const getInitials = (email: string) => {
    const name = email.split("@")[0];
    return name.charAt(0).toUpperCase();
  };

  return (
    <TouchableOpacity
      style={styles.avatarButton}
      onPress={() => router.push("/profile")}
      activeOpacity={0.7}
    >
      <View style={styles.avatar}>
        {user.photoURL || userProfile?.photoURL ? (
          <Image
            source={{
              uri:
                userProfile?.photoURL ||
                user.photoURL ||
                getDefaultProfilePicture(false),
            }}
            style={styles.avatarImage}
          />
        ) : (
          <Text style={styles.avatarText}>
            {getInitials(user.email || "U")}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  avatarButton: {
    padding: 4,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.secondary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: theme.colors.inputBorder,
  },
  avatarText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: "bold",
  },
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
});
