// Sportnizer App Theme
export const theme = {
  colors: {
    primary: '#25292e',      // Dark background
    secondary: '#ffd33d',    // Yellow accent
    white: '#fff',
    text: '#fff',
    textSecondary: '#888',
    error: '#ff4444',
    success: '#44ff44',
    inputBackground: '#3a3f44',
    inputBorder: '#555',
    inputBorderFocused: '#ffd33d',
    accent: "#007bff", 
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
      normal: '400' as const,
      medium: '500' as const,
      bold: '700' as const,
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
  },
  
  layout: {
    containerPadding: 20,
    buttonHeight: 68,
    inputHeight: 56,
  }
};
