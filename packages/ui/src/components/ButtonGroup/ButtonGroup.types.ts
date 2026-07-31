/**
 * Importing npm packages
 */
import { type HTMLAttributes } from 'react';

/**
 * Importing user defined packages
 */
import { type ButtonSize, type ButtonVariant } from '../Button/Button.types';

/**
 * Defining types
 */
export type ButtonGroupOrientation = 'horizontal' | 'vertical';

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Variant applied to every member; overrides each child's own `variant`. @default 'secondary' */
  variant?: ButtonVariant;
  /** Size applied to every member; overrides each child's own `size`. @default 'md' */
  size?: ButtonSize;
  /**
   * Fuse members into one control — shared 1px borders, outer corners rounded, inner corners
   * square. Set `false` for a spaced cluster (4px gap) of related-but-separate buttons.
   * @default true
   */
  attached?: boolean;
  /** Lay members out in a row or a column. @default 'horizontal' */
  orientation?: ButtonGroupOrientation;
  /** Disable the whole group at once — dims the container once and makes the subtree inert. */
  disabled?: boolean;
}
