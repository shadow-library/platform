/**
 * Importing npm packages
 */
import { type ReactNode } from 'react';

/**
 * Defining types
 */
export interface TokenValue {
  value: string;
  valid: boolean;
}

export type TokenInputSize = 'sm' | 'md' | 'lg';

export interface TokenInputProps {
  /** Controlled tokens — `{ value, valid }[]`. */
  value?: TokenValue[];
  /** Uncontrolled initial tokens. */
  defaultValue?: TokenValue[];
  /** Fires with the next tokens; the component never drops what the user entered. */
  onValueChange?: (tokens: TokenValue[]) => void;
  /** Per-token validator → `true`/`false` or an error string (string ⇒ invalid). */
  validate?: (value: string) => boolean | string;
  /** Commit keys/chars. Supports `'Enter'`, `'Space'`, and single characters like `','`. @default [',', ';', 'Enter'] */
  separators?: string[];
  placeholder?: string;
  /** Field min-height scale — matches Input. @default 'md' */
  size?: TokenInputSize;
  disabled?: boolean;
  readOnly?: boolean;
  /** Force the danger field grammar. */
  invalid?: boolean;
  /** Cap the number of tokens. */
  maxTokens?: number;
  /** Leading icon adornment. */
  prefix?: ReactNode;
  id?: string;
  className?: string;
  'aria-label'?: string;
}
