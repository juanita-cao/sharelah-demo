import i18next, { type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import { saveUiPrefs, type UiPrefs } from "../prefs/uiPrefs";
import { en } from "./en";
import { zh } from "./zh";

// One instance per call, so tests and users never share a language through global state.
export async function createI18n(language: UiPrefs["language"]): Promise<i18n> {
  const instance = i18next.createInstance();
  await instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: "en",
    resources: { en: { translation: en }, zh: { translation: zh } },
    interpolation: { escapeValue: false },
    keySeparator: false,
    returnNull: false,
  });
  return instance;
}

export async function changeLanguage(instance: i18n, language: UiPrefs["language"], storage?: Storage | null): Promise<void> {
  await instance.changeLanguage(language);
  saveUiPrefs({ language }, storage);
}
