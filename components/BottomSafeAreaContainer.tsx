// components/BottomSafeAreaContainer.tsx

import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface BottomSafeAreaContainerProps {
  enabled?: boolean; // Easy enable/disable control
  showPlaceholder?: boolean; // Show development placeholder
  children?: React.ReactNode;
}

export default function BottomSafeAreaContainer({ 
  enabled = true,
  showPlaceholder = false,
  children 
}: BottomSafeAreaContainerProps) {
  const insets = useSafeAreaInsets();
  
  // If disabled, return nothing
  if (!enabled) {
    return null;
  }

  // Calculate height - this should be ABOVE the system navigation
  const containerHeight = Platform.select({
    ios: 50, // Fixed height for ad space on iOS
    android: 50, // Fixed height for ad space on Android
    web: 50, // Fixed height for web
    default: 50
  });

  return (
    <View style={[styles.container, { 
      height: containerHeight,
      marginBottom: insets.bottom, // Push it UP above system navigation
      backgroundColor: 'transparent' // Invisible - no color interference
    }]}>
      {children}
      {/* Optional placeholder for development */}
      {showPlaceholder && __DEV__ && (
        <View style={[styles.placeholder, { height: containerHeight - 8 }]}>
          {/* Development placeholder - shows the reserved space */}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    // backgroundColor will be set inline as transparent
    justifyContent: 'center',
    alignItems: 'center',
    // No border - seamless integration with your app
  },
  placeholder: {
    width: '90%',
    backgroundColor: 'rgba(255, 211, 61, 0.15)', // More subtle yellow hint
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 211, 61, 0.3)',
    borderStyle: 'dashed',
  },
});
