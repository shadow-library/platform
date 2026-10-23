import { type InputHTMLAttributes, type ReactNode } from 'react';

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  /** Control height/typography scale — matches Button so mixed rows align. @default 'md' */
  size?: InputSize;
  /**
   * Leading adornment. A `string` renders as a fused addon segment (e.g. `https://`); any other
   * node renders as a decorative icon inside the field padding.
   */
  prefix?: ReactNode;
  /** Trailing adornment; a `string` is a fused addon, same rule as `prefix`. */
  suffix?: ReactNode;
  /** Presentation-only invalid state: danger border/ring + `aria-invalid`. Validation lives in Form Field. */
  invalid?: boolean;
  /** Show a clear (×) button while the field has a value. */
  clearable?: boolean;
  /** For `type='password'`: show the eye toggle that reveals the entered characters. @default true */
  revealable?: boolean;
  /** Receives the string value; fires alongside native `onChange`. */
  onValueChange?: (value: string) => void;
  /** Escape hatch for props on the raw `<input>` when `className`/`style` are claimed by the wrapper. */
  inputClassName?: string;
}
