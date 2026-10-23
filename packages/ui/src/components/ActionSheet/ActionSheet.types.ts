import { type ButtonHTMLAttributes, type ComponentPropsWithoutRef, type ReactNode } from 'react';

export type ActionSheetItemIntent = 'neutral' | 'danger';

export interface ActionSheetProps {
  /** Controlled open state. */
  open: boolean;
  /** Open/close callback (also fires on Esc, scrim tap, cancel, and item selection). */
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  /** Label of the separated dismiss row — an action sheet always offers an explicit way out. @default 'Cancel' */
  cancelLabel?: ReactNode;
  /** Accessible name when there is no visible `title`. */
  'aria-label'?: string;
  children: ReactNode;
  className?: string;
}

export interface ActionSheetItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Row emphasis. @default 'neutral' */
  intent?: ActionSheetItemIntent;
  icon?: ReactNode;
  /** Close the sheet after the action runs. @default true */
  closeOnSelect?: boolean;
  asChild?: boolean;
}

export interface ActionSheetGroupProps extends ComponentPropsWithoutRef<'div'> {
  label?: ReactNode;
}
