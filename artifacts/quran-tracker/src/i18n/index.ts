import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import ar from "./ar.json";

export const SUPPORTED_LANGUAGES = ["en", "ar"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = "qurantracker.language";

function getInitialLanguage(): SupportedLanguage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "ar") return stored;
  } catch {
    /* ignore */
  }
  // Arabic is the default for new users; once a language is chosen it is
  // stored above and always wins.
  return "ar";
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: getInitialLanguage(),
  // Fall back to English so that any missing Arabic plural form (Arabic
  // needs 6 forms: zero/one/two/few/many/other vs English's one/other)
  // renders a readable English string rather than the raw key path.
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function applyDocumentLanguage(lang: SupportedLanguage) {
  const html = document.documentElement;
  html.lang = lang;
  html.dir = lang === "ar" ? "rtl" : "ltr";
}

export function setLanguage(lang: SupportedLanguage) {
  if (i18n.language !== lang) {
    void i18n.changeLanguage(lang);
  }
  applyDocumentLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

applyDocumentLanguage(getInitialLanguage());

export default i18n;
