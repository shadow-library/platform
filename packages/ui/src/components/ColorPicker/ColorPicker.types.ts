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
  /** Field height — matches Input. @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}
