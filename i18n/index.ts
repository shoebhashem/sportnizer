// i18n/index.ts — i18next initialization for Clubnizer
// Supports English (default) and Swedish, easily extensible to more languages.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// English translations
import enCommon from "./locales/en/common.json";
import enComponents from "./locales/en/components.json";
import enNavigation from "./locales/en/navigation.json";
import enScreens from "./locales/en/screens.json";

// Swedish translations
import svCommon from "./locales/sv/common.json";
import svComponents from "./locales/sv/components.json";
import svNavigation from "./locales/sv/navigation.json";
import svScreens from "./locales/sv/screens.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English", flag: "🇬🇧" },
  { code: "sv", label: "Swedish", nativeLabel: "Svenska", flag: "🇸🇪" },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]["code"];

const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map(
  (l) => l.code,
) as readonly string[];

const LANGUAGE_STORAGE_KEY = "@clubnizer_language";

/**
 * Get the stored language preference, or detect from device locale.
 */
export async function getStoredLanguage(): Promise<SupportedLanguage> {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && SUPPORTED_CODES.includes(stored)) {
      return stored as SupportedLanguage;
    }
  } catch {
    // Fall through to device detection
  }

  // Detect device language — use first 2 chars (e.g., "sv-SE" → "sv")
  const deviceLocales = Localization.getLocales();
  const deviceLang = deviceLocales?.[0]?.languageCode;
  if (deviceLang && SUPPORTED_CODES.includes(deviceLang)) {
    return deviceLang as SupportedLanguage;
  }

  return "en";
}

/**
 * Persist the user's language choice.
 */
export async function setStoredLanguage(
  lang: SupportedLanguage,
): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch (error) {
    console.warn("Failed to store language preference:", error);
  }
}

// Initialize i18next
i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      screens: enScreens,
      navigation: enNavigation,
      components: enComponents,
    },
    sv: {
      common: svCommon,
      screens: svScreens,
      navigation: svNavigation,
      components: svComponents,
    },
  },
  lng: "en", // Will be updated async by LanguageProvider
  fallbackLng: "en",
  defaultNS: "common",
  ns: ["common", "screens", "navigation", "components"],

  interpolation: {
    escapeValue: false, // React already escapes
  },

  // Silently fall back to English if a Swedish key is missing
  returnNull: false,
  returnEmptyString: false,
});

export default i18n;
