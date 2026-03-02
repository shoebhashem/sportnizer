// i18n/index.ts — i18next initialization for Clubnizer
// Supports 8 languages: English (default), Swedish, German, Spanish, Italian, French, Norwegian, Danish.

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

// German translations
import deCommon from "./locales/de/common.json";
import deComponents from "./locales/de/components.json";
import deNavigation from "./locales/de/navigation.json";
import deScreens from "./locales/de/screens.json";

// Spanish translations
import esCommon from "./locales/es/common.json";
import esComponents from "./locales/es/components.json";
import esNavigation from "./locales/es/navigation.json";
import esScreens from "./locales/es/screens.json";

// Italian translations
import itCommon from "./locales/it/common.json";
import itComponents from "./locales/it/components.json";
import itNavigation from "./locales/it/navigation.json";
import itScreens from "./locales/it/screens.json";

// French translations
import frCommon from "./locales/fr/common.json";
import frComponents from "./locales/fr/components.json";
import frNavigation from "./locales/fr/navigation.json";
import frScreens from "./locales/fr/screens.json";

// Norwegian translations
import noCommon from "./locales/no/common.json";
import noComponents from "./locales/no/components.json";
import noNavigation from "./locales/no/navigation.json";
import noScreens from "./locales/no/screens.json";

// Danish translations
import daCommon from "./locales/da/common.json";
import daComponents from "./locales/da/components.json";
import daNavigation from "./locales/da/navigation.json";
import daScreens from "./locales/da/screens.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English", flag: "🇬🇧" },
  { code: "sv", label: "Swedish", nativeLabel: "Svenska", flag: "🇸🇪" },
  { code: "de", label: "German", nativeLabel: "Deutsch", flag: "🇩🇪" },
  { code: "es", label: "Spanish", nativeLabel: "Español", flag: "🇪🇸" },
  { code: "it", label: "Italian", nativeLabel: "Italiano", flag: "🇮🇹" },
  { code: "fr", label: "French", nativeLabel: "Français", flag: "🇫🇷" },
  { code: "no", label: "Norwegian", nativeLabel: "Norsk", flag: "🇳🇴" },
  { code: "da", label: "Danish", nativeLabel: "Dansk", flag: "🇩🇰" },
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
    de: {
      common: deCommon,
      screens: deScreens,
      navigation: deNavigation,
      components: deComponents,
    },
    es: {
      common: esCommon,
      screens: esScreens,
      navigation: esNavigation,
      components: esComponents,
    },
    it: {
      common: itCommon,
      screens: itScreens,
      navigation: itNavigation,
      components: itComponents,
    },
    fr: {
      common: frCommon,
      screens: frScreens,
      navigation: frNavigation,
      components: frComponents,
    },
    no: {
      common: noCommon,
      screens: noScreens,
      navigation: noNavigation,
      components: noComponents,
    },
    da: {
      common: daCommon,
      screens: daScreens,
      navigation: daNavigation,
      components: daComponents,
    },
  },
  lng: "en", // Will be updated async by LanguageProvider
  fallbackLng: "en",
  defaultNS: "common",
  ns: ["common", "screens", "navigation", "components"],

  interpolation: {
    escapeValue: false, // React already escapes
  },

  // Silently fall back to English if a translation key is missing
  returnNull: false,
  returnEmptyString: false,
});

export default i18n;
