/**
 * Importing npm packages
 */
import { type TextareaHTMLAttributes } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export type TextareaSize = 'sm' | 'md' | 'lg';

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> {
  /** Font/radius scale — matches the Input field. @default 'md' */
  size?: TextareaSize;
  /** Minimum visible rows; also the starting height. @default 3 */
  minRows?: number;
  /** Auto-grow cap; content past this scrolls internally. @default 12 */
  maxRows?: number;
  /** Grow the height with content between `minRows` and `maxRows`; off enables a vertical drag handle. @default true */
  autoGrow?: boolean;
  /** Render a character counter (requires `maxLength`); revealed at 80% of the limit. */
  showCount?: boolean;
  /** Presentation-only invalid state: danger border/ring + `aria-invalid`. */
  invalid?: boolean;
  /** Convenience change handler receiving the string value directly (fires alongside native `onChange`). */
  onValueChange?: (value: string) => void;
}
