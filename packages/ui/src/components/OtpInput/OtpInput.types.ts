/**
 * Importing npm packages
 */
import { type HTMLAttributes } from 'react';

/**
 * Importing user defined packages
 */
import { type InputSize } from '../Input';

/**
 * Defining types
 */

/** Preset character allow-lists. A custom `allowedPattern` overrides the preset. */
export type OtpAllowed = 'numeric' | 'alphanumeric' | 'alphabetic';

export interface OtpInputProps extends Omit<HTMLAttributes<HTMLFieldSetElement>, 'onChange' | 'defaultValue'> {
  /** Number of character boxes. @default 6 */
  length?: number;
  /** Which characters may be typed or pasted. A custom `allowedPattern` overrides this. @default 'numeric' */
  type?: OtpAllowed;
  /** Custom single-character allow-list (non-global `RegExp`); characters failing `.test()` are rejected on type and stripped on paste. */
  allowedPattern?: RegExp;
  /** Controlled value — the entered characters, left-aligned. */
  value?: string;
  /** Uncontrolled initial value. @default '' */
  defaultValue?: string;
  /** Fires with the full string on every change. */
  onValueChange?: (value: string) => void;
  /** Fires once when the final box is filled. */
  onComplete?: (value: string) => void;
  /** Control height/type scale — shared with Input. @default 'md' */
  size?: InputSize;
  /** Render each box as a masked dot, like a password. @default false */
  mask?: boolean;
  /** Danger border/ring + `aria-invalid`; the message lives in Form Field. */
  invalid?: boolean;
  /** Disable every box. */
  disabled?: boolean;
  /** Make every box read-only. */
  readOnly?: boolean;
  /** Focus the first box on mount. */
  autoFocus?: boolean;
  /** Name for the hidden input that carries the joined value in a form submit. */
  name?: string;
  /** Placeholder glyph shown in empty boxes. */
  placeholder?: string;
}
