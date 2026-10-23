import { type HTMLAttributes } from 'react';

import { type ButtonSize, type ButtonVariant } from '../Button/Button.types';

export type ButtonGroupOrientation = 'horizontal' | 'vertical';

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Variant applied to every member; overrides each child's own `variant`. @default 'secondary' */
  variant?: ButtonVariant;
  /** Size applied to every member; overrides each child's own `size`. @default 'md' */
  size?: ButtonSize;
  /** Fuse members into one control with shared borders; `false` gives a spaced cluster of separate buttons. @default true */
  attached?: boolean;
  /** Lay members out in a row or a column. @default 'horizontal' */
  orientation?: ButtonGroupOrientation;
  disabled?: boolean;
}
