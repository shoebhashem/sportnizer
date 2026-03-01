// contexts/LanguageContext.tsx — Language selection and persistence
// Wraps the app to provide language switching and auto-detection.

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import { useTranslation } from "react-i18next";

import {
    getStoredLanguage,
    setStoredLanguage,
    SUPPORTED_LANGUAGES,
    type SupportedLanguage,
} from "../i18n";

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: async () => {},
  isLoading: true,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const [language, setLanguageState] = useState<SupportedLanguage>("en");
  const [isLoading, setIsLoading] = useState(true);

  // Load stored/detected language on mount
  useEffect(() => {
    (async () => {
      const lang = await getStoredLanguage();
      setLanguageState(lang);
      await i18n.changeLanguage(lang);
      setIsLoading(false);
    })();
  }, [i18n]);

  const setLanguage = useCallback(
    async (lang: SupportedLanguage) => {
      setLanguageState(lang);
      await i18n.changeLanguage(lang);
      await setStoredLanguage(lang);
    },
    [i18n],
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, isLoading }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export { SUPPORTED_LANGUAGES, type SupportedLanguage };
