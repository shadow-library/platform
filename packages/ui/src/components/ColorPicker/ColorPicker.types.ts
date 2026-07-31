/**
 * Defining types
 */
export interface ColorSwatch {
  /** Meaningful label (accessible name) — never a bare hex. */
  label: string;
  /** Hex value (#RRGGBB). */
  value: string;
}

export interface ColorPickerProps {
  /** Controlled hex value (#RRGGBB). */
  value?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string;
  /** Fires live as the value changes. */
  onValueChange?: (value: string) => void;
  /** Fires on commit (palette click, valid hex entry, or close). */
  onCommit?: (value: string) => void;
  /** Labelled palette swatches (a radiogroup). Swatches without labels fail review. */
  palette?: ColorSwatch[];
  /**
   * Allow free selection via the spectrum. With a palette, the spectrum hides behind "Custom…"; with no
   * palette it is the whole panel. Set false for palette-only (statuses, calendars). @default true
   */
  allowCustom?: boolean;
  /** When set, a live WCAG contrast-ratio chip renders under the hex field (danger below 3:1, success at AA). */
  contrastAgainst?: string;
  /** Field height — matches Input. @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}
