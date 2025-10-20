// constants/config.ts

/**
 * Environment-specific configuration for the Sportnizer app
 * Handles URLs, deep linking, and Firebase functions across development and production
 */

export type Environment = 'development' | 'production';

export interface AppConfig {
  webUrl: string;
  deepLinkScheme: string;
  universalLinkDomain: string;
  functionsUrl: string;
}

export const appConfig: Record<Environment, AppConfig> = {
  development: {
    webUrl: 'http://localhost:8081',
    deepLinkScheme: 'sportnizer-dev',
    universalLinkDomain: 'localhost:8081',
    functionsUrl: 'https://europe-north1-sportnizer-dev.cloudfunctions.net'
  },
  production: {
    webUrl: 'https://sportnizer.app',
    deepLinkScheme: 'sportnizer',
    universalLinkDomain: 'sportnizer.app',
    functionsUrl: 'https://europe-north1-sportnizer.cloudfunctions.net'
  }
};

/**
 * Get current environment configuration
 */
export const getCurrentConfig = (): AppConfig => {
  const environment: Environment = __DEV__ ? 'development' : 'production';
  return appConfig[environment];
};

/**
 * Generate universal invitation link that works across all platforms
 * @param token - The invitation token
 * @param forWeb - Force web URL generation (useful for sharing via browsers)
 * @param environment - Target environment (defaults to current)
 * @returns Universal link that opens app on mobile, web on browser
 */
export const generateInviteLink = (token: string, forWeb = false, environment?: Environment): string => {
  const config = environment ? appConfig[environment] : getCurrentConfig();
  
  // For development, provide both options
  if (__DEV__) {
    // If explicitly requesting web URL or if we want to share via browser
    if (forWeb) {
      return `${config.webUrl}/join/${token}`;
    }
    // Default to custom scheme for native app testing
    return `${config.deepLinkScheme}://join/${token}`;
  }
  
  // Production always uses web URLs for universal compatibility
  return `${config.webUrl}/join/${token}`;
};

/**
 * Generate web-specific invitation link (always HTTP/HTTPS)
 * @param token - The invitation token
 * @param environment - Target environment (defaults to current)
 * @returns Web URL for sharing via browsers
 */
export const generateWebInviteLink = (token: string, environment?: Environment): string => {
  const config = environment ? appConfig[environment] : getCurrentConfig();
  return `${config.webUrl}/join/${token}`;
};

/**
 * Generate multiple link formats for different use cases
 * @param token - The invitation token
 * @param environment - Target environment (defaults to current)
 * @returns Object with different link formats
 */
export const generateInviteLinks = (token: string, environment?: Environment) => {
  const config = environment ? appConfig[environment] : getCurrentConfig();
  
  return {
    // Primary: Universal link (works on all platforms)
    universal: `${config.webUrl}/join/${token}`,
    
    // Fallback: Custom scheme (guaranteed to work if app is installed)
    deepLink: `${config.deepLinkScheme}://join/${token}`,
    
    // For sharing: Smart link that detects platform
    share: `${config.webUrl}/join/${token}`,
    
    // Web-specific (for web-only contexts)
    web: `${config.webUrl}/join/${token}`
  };
};

/**
 * Invitation expiration configuration
 */
export const invitationConfig = {
  // Default expiration time in days
  defaultExpirationDays: 7,
  
  // Maximum expiration time in days
  maxExpirationDays: 30,
  
  // Minimum expiration time in days
  minExpirationDays: 1,
  
  // Default invitation type
  defaultInvitationType: 'group-member' as const
};

/**
 * Supported invitation types
 */
export type InvitationType = 'group-member' | 'guardian' | 'coach' | 'admin';

/**
 * Get Firebase Functions URL for current environment
 */
export const getFunctionsUrl = (environment?: Environment): string => {
  const config = environment ? appConfig[environment] : getCurrentConfig();
  return config.functionsUrl;
};
