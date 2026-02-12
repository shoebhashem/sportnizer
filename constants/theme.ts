// Sportnizer App Theme
export const theme = {
  colors: {
    primary: "#25292e", // Dark background
    secondary: "#ffd33d", // Yellow accent
    white: "#fff",
    background: "#1a1d21", // Slightly lighter than primary for contrast
    text: "#fff",
    textSecondary: "#888",
    border: "#e0e0e0", // Light gray border for cards
    error: "#ff4444",
    success: "#44ff44",
    warning: "#ff9933", // Orange warning color
    warningBackground: "#FFF3CD", // Light yellow background for warnings
    inputBackground: "#3a3f44",
    inputBorder: "#555",
    inputBorderFocused: "#ffd33d",
    accent: "#007bff",
    badge: {
      you: "#ffd33d", // Yellow for "You"
      child: "#4CAF50", // Green for children
    },
  },

  typography: {
    fontSize: {
      small: 12,
      medium: 16,
      large: 20,
      xlarge: 24,
      xxlarge: 32,
    },
    fontWeight: {
      normal: "400" as const,
      medium: "500" as const,
      semibold: "600" as const,
      bold: "700" as const,
    },
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  borderRadius: {
    small: 8,
    medium: 12,
    large: 18,
    full: 9999, // For pill-shaped buttons
  },

  layout: {
    containerPadding: 20,
    buttonHeight: 68,
    inputHeight: 56,
  },
};
