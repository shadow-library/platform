import { type ButtonHTMLAttributes, type ComponentPropsWithoutRef, type ReactNode } from 'react';

export interface BottomNavigationProps extends ComponentPropsWithoutRef<'nav'> {
  /** Controlled selected item value. */
  value?: string;
  /** Uncontrolled initial selection. */
  defaultValue?: string;
  /** Fires with the tapped item's value (selection itself is the consumer's routing concern when controlled). */
  onValueChange?: (value: string) => void;
  /** Pins the bar to the viewport bottom (safe-area aware). Disable to place it in your own layout. @default true */
  fixed?: boolean;
  children: ReactNode;
}

export interface BottomNavigationItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  value: string;
  icon: ReactNode;
  label: ReactNode;
  badge?: ReactNode;
  asChild?: boolean;
}
