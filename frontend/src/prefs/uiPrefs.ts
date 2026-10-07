export interface UiPrefs {
  sidebarCollapsed: boolean;
  language: "en" | "zh";
}

export const SIDEBAR_KEY = "sfn.ui.sidebarCollapsed";
export const LANGUAGE_KEY = "sfn.ui.language";
export const DEFAULT_PREFS: UiPrefs = { sidebarCollapsed: false, language: "en" };

function defaultStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Convenience only: every access is guarded, and any failure silently means "use the default".
export function loadUiPrefs(storage: Storage | null = defaultStorage()): UiPrefs {
  const prefs = { ...DEFAULT_PREFS };
  if (!storage) return prefs;
  try {
    const sidebar = storage.getItem(SIDEBAR_KEY);
    if (sidebar === "true" || sidebar === "false") prefs.sidebarCollapsed = sidebar === "true";
    const language = storage.getItem(LANGUAGE_KEY);
    if (language === "en" || language === "zh") prefs.language = language;
  } catch {
    return { ...DEFAULT_PREFS };
  }
  return prefs;
}

export function saveUiPrefs(patch: Partial<UiPrefs>, storage: Storage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    if (patch.sidebarCollapsed !== undefined) storage.setItem(SIDEBAR_KEY, String(patch.sidebarCollapsed));
    if (patch.language !== undefined) storage.setItem(LANGUAGE_KEY, patch.language);
  } catch {
    // unwritable storage (private mode, blocked): the preference just isn't remembered
  }
}
