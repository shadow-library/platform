/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { readLocal, writeLocal } from '@/lib/local-store';

/**
 * Defining types
 */
export type ReaderTheme = 'light' | 'sepia' | 'dark';
export type ReaderFont = 'serif' | 'sans';
export type ReaderWidth = 'narrow' | 'normal' | 'wide';
export type ReaderAlign = 'left' | 'justify';

export interface ReaderSettings {
  theme: ReaderTheme;
  font: ReaderFont;
  fontSize: number;
  lineHeight: number;
  width: ReaderWidth;
  align: ReaderAlign;
}

export interface ReaderPalette {
  bg: string;
  fg: string;
  hairline: string;
  muted: string;
}

/**
 * Declaring the constants
 *
 * Reader typography and theme, persisted per device. The reading surface deliberately has its own palette
 * (paper/sepia/ink, per the mockups) independent of the app theme; system fonts keep chapters readable
 * offline with zero external font fetches.
 */
const STORAGE_KEY = 'webnovel:reader-settings';

export const READER_DEFAULTS: ReaderSettings = { theme: 'sepia', font: 'serif', fontSize: 19, lineHeight: 1.75, width: 'normal', align: 'left' };

export const READER_PALETTES: Record<ReaderTheme, ReaderPalette> = {
  light: { bg: '#fdfdfc', fg: '#1c1c20', hairline: 'rgba(28,28,32,.12)', muted: 'rgba(28,28,32,.55)' },
  sepia: { bg: '#f4ecdd', fg: '#3b3226', hairline: 'rgba(59,50,38,.15)', muted: 'rgba(59,50,38,.55)' },
  dark: { bg: '#121215', fg: '#d5d5da', hairline: 'rgba(213,213,218,.14)', muted: 'rgba(213,213,218,.55)' },
};

export const READER_WIDTHS: Record<ReaderWidth, string> = { narrow: '560px', normal: '680px', wide: '820px' };

export const READER_FONTS: Record<ReaderFont, string> = {
  serif: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
  sans: 'var(--sh-font-sans)',
};

export const FONT_SIZE_MIN = 14;
export const FONT_SIZE_MAX = 26;

export function loadReaderSettings(): ReaderSettings {
  return { ...READER_DEFAULTS, ...readLocal<Partial<ReaderSettings>>(STORAGE_KEY, {}) };
}

export function saveReaderSettings(settings: ReaderSettings): void {
  writeLocal(STORAGE_KEY, settings);
}
