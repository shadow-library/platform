import { type HTMLAttributes, type ReactNode } from 'react';

export interface FormFieldProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label?: ReactNode;
  helper?: ReactNode;
  /** Error message; any value other than `null`, `undefined` or `false` makes the field invalid and replaces the helper. */
  error?: ReactNode;
  required?: boolean;
  optional?: boolean;
  /** Force the invalid state; defaults to `true` when `error` is shown. */
  invalid?: boolean;
  disabled?: boolean;
  children: ReactNode;
}
