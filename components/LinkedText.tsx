import { theme } from "@/constants/theme";
import React, { useCallback } from "react";
import {
    Linking,
    Platform,
    StyleProp,
    StyleSheet,
    Text,
    TextStyle,
} from "react-native";

const URL_REGEX =
  /(?:https?:\/\/|www\.)[^\s<>\"')\]]+(?:\([^\s<>\"')\]]*\))?[^\s<>\"')\].,;:!?]*/gi;

const ALLOWED_SCHEMES = ["http:", "https:", "mailto:"];

interface LinkedTextProps {
  children: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  ellipsizeMode?: "head" | "middle" | "tail" | "clip";
}

export default function LinkedText({
  children,
  style,
  numberOfLines,
  ellipsizeMode,
}: LinkedTextProps) {
  const handlePress = useCallback(async (url: string) => {
    let fullUrl = url;
    if (url.startsWith("www.")) {
      fullUrl = `https://${url}`;
    }

    try {
      const parsed = new URL(fullUrl);
      if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
        return;
      }
    } catch {
      return;
    }

    try {
      const supported = await Linking.canOpenURL(fullUrl);
      if (supported) {
        await Linking.openURL(fullUrl);
      }
    } catch {
      // silently fail
    }
  }, []);

  const parts = parseText(children);

  if (parts.length === 1 && !parts[0].isUrl) {
    return (
      <Text
        style={style}
        numberOfLines={numberOfLines}
        ellipsizeMode={ellipsizeMode}
      >
        {children}
      </Text>
    );
  }

  return (
    <Text
      style={style}
      numberOfLines={numberOfLines}
      ellipsizeMode={ellipsizeMode}
    >
      {parts.map((part, index) =>
        part.isUrl ? (
          <Text
            key={index}
            style={styles.link}
            onPress={() => handlePress(part.text)}
            {...(Platform.OS === "web"
              ? { accessibilityRole: "link" as any }
              : {})}
          >
            {part.text}
          </Text>
        ) : (
          <React.Fragment key={index}>{part.text}</React.Fragment>
        ),
      )}
    </Text>
  );
}

function parseText(text: string): { text: string; isUrl: boolean }[] {
  const parts: { text: string; isUrl: boolean }[] = [];
  let lastIndex = 0;

  const regex = new RegExp(URL_REGEX.source, URL_REGEX.flags);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), isUrl: false });
    }
    parts.push({ text: match[0], isUrl: true });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isUrl: false });
  }

  return parts;
}

const styles = StyleSheet.create({
  link: {
    color: theme.colors.accent,
    textDecorationLine: "underline",
  },
});
