/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { readLocal, removeLocal, writeLocal } from '@/lib/local-store';

/**
 * Defining types
 */
export type ThemeMode = 'light' | 'dark' | 'system';

export interface WebnovelSettings {
  themeMode: ThemeMode;
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

/** The boolean-valued preference keys — every toggle row is keyed by exactly one of these. */
export type ToggleKey = { [K in keyof WebnovelSettings]: WebnovelSettings[K] extends boolean ? K : never }[keyof WebnovelSettings];

/**
 * Declaring the constants
 *
 * Device-local app preferences, persisted per browser like the library and reader settings — never synced
 * to an account, never sent to the server. SSR-safe: reads flow through the guarded `local-store` accessors,
 * so importing or calling these on the server yields the defaults instead of ever touching `window`.
 */
const SETTINGS_STORAGE_KEY = 'webnovel:settings';

/** Every localStorage key this app writes shares the `webnovel` prefix; "Clear all local data" wipes exactly those. */
const APP_STORAGE_PREFIX = 'webnovel';

export const APP_LANGUAGES = ['English', '한국어', '日本語', '中文'] as const;

export const DEFAULT_SETTINGS: WebnovelSettings = {
  themeMode: 'system',
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

/** Wipe every device-local key this app owns — settings, library, reading progress, reader prefs and theme. */
export function clearAllLocalData(): void {
  if (typeof window === 'undefined') return;
  const owned = Object.keys(window.localStorage).filter(key => key.startsWith(APP_STORAGE_PREFIX));
  owned.forEach(key => removeLocal(key));
}
