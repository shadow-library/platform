import { readLocal, removeLocal, writeLocal } from '@/lib/local-store';

export interface WebnovelSettings {
  appLanguage: string;
  wifiOnlyDownloads: boolean;
  autoDownloadNewChapters: boolean;
  notifyNewChapters: boolean;
  notifyCommentReplies: boolean;
  notifyDownloadComplete: boolean;
  notifyProductNews: boolean;
  saveReadingHistory: boolean;
  cacheCoversOffline: boolean;
  showMatureContent: boolean;
  blurSpoilerTags: boolean;
  markReadOnScroll: boolean;
}

export type ToggleKey = { [K in keyof WebnovelSettings]: WebnovelSettings[K] extends boolean ? K : never }[keyof WebnovelSettings];

const SETTINGS_STORAGE_KEY = 'webnovel:settings';

/**
 * Adult consent taken at the gate, distinct from the `showMatureContent` browse preference; either lets mature content through. Shares the `webnovel`
 * prefix, so clearing local data resets it.
 */
const MATURE_CONSENT_STORAGE_KEY = 'webnovel:mature-consent';

/** Every localStorage key this app writes shares the `webnovel` prefix; "Clear all local data" wipes exactly those. */
const APP_STORAGE_PREFIX = 'webnovel';

export const APP_LANGUAGES = ['English', '한국어', '日本語', '中文'] as const;

export const DEFAULT_SETTINGS: WebnovelSettings = {
  appLanguage: 'English',
  wifiOnlyDownloads: true,
  autoDownloadNewChapters: false,
  notifyNewChapters: true,
  notifyCommentReplies: true,
  notifyDownloadComplete: true,
  notifyProductNews: false,
  saveReadingHistory: true,
  cacheCoversOffline: true,
  showMatureContent: false,
  blurSpoilerTags: true,
  markReadOnScroll: true,
};

export function loadSettings(): WebnovelSettings {
  return { ...DEFAULT_SETTINGS, ...readLocal<Partial<WebnovelSettings>>(SETTINGS_STORAGE_KEY, {}) };
}

export function saveSettings(settings: WebnovelSettings): void {
  writeLocal(SETTINGS_STORAGE_KEY, settings);
}

export function hasMatureConsent(): boolean {
  return readLocal<boolean>(MATURE_CONSENT_STORAGE_KEY, false);
}

export function grantMatureConsent(): void {
  writeLocal<boolean>(MATURE_CONSENT_STORAGE_KEY, true);
}

/** Excludes theme: it is a platform-wide cookie shared with the other Shadow apps and is reset separately (see `SettingsScreen.onClearData`). */
export function clearAllLocalData(): void {
  if (typeof window === 'undefined') return;
  const owned = Object.keys(window.localStorage).filter(key => key.startsWith(APP_STORAGE_PREFIX));
  owned.forEach(key => removeLocal(key));
}
