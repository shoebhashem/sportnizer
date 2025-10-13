import { theme } from '@/constants/theme';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';

interface AdContainerProps {
  position?: 'top' | 'bottom';
  children?: React.ReactNode;
  style?: ViewStyle;
}

export default function AdContainer({ 
  position = 'bottom', 
  children, 
  style 
}: AdContainerProps) {
  
  // In development mode, return null to avoid grey placeholder covering system navigation
  if (__DEV__) {
    return null;
  }
  
  const getAdContainerStyle = () => {
    if (Platform.OS === 'web') {
      // Web: Reserve 100px height for AdSense responsive banners
      return [
        styles.baseContainer,
        styles.webContainer,
        position === 'top' ? styles.topPosition : styles.bottomPosition,
        style
      ];
    } else {
      // Mobile: Reserve 50-90dp for AdMob adaptive banners
      // Using 70dp as a good middle ground that works for most banner sizes
      return [
        styles.baseContainer,
        styles.mobileContainer,
        position === 'top' ? styles.topPosition : styles.bottomPosition,
        style
      ];
    }
  };

  return (
    <View style={getAdContainerStyle()}>
      {children}
      {/* Placeholder for actual ad implementation */}
      {/* Removed development placeholder to avoid grey area covering system navigation */}
    </View>
  );
}

const styles = StyleSheet.create({
  baseContainer: {
    width: '100%',
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  webContainer: {
    height: 100, // 100px for web AdSense banners
    minHeight: 100,
  },
  mobileContainer: {
    height: 70, // 70dp for mobile AdMob banners (good middle ground)
    minHeight: 70,
  },
  topPosition: {
    borderBottomWidth: 1,
    borderTopWidth: 0,
  },
  bottomPosition: {
    borderTopWidth: 1,
    borderBottomWidth: 0,
  },
  placeholder: {
    flex: 1,
    width: '100%',
    backgroundColor: Platform.OS === 'web' ? '#f0f0f0' : '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.3,
  },
});
