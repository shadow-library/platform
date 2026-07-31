/**
 * Importing npm packages
 */
import { type ButtonHTMLAttributes, type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/** Row emphasis — `danger` marks destructive actions. */
export type ActionSheetItemIntent = 'neutral' | 'danger';

export interface ActionSheetProps {
  /** Controlled open state. */
  open: boolean;
  /** Open/close callback (also fires on Esc, scrim tap, cancel, and item selection). */
  onOpenChange: (open: boolean) => void;
  /** Optional context header above the actions. */
  title?: ReactNode;
  /** Secondary line under the title. */
  description?: ReactNode;
  /** Label of the separated dismiss row — an action sheet always offers an explicit way out. @default 'Cancel' */
  cancelLabel?: ReactNode;
  /** Accessible name when there is no visible `title`. */
  'aria-label'?: string;
  /** `ActionSheet.Item` / `ActionSheet.Group` elements. */
  children: ReactNode;
  className?: string;
}

export interface ActionSheetItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Row emphasis. @default 'neutral' */
  intent?: ActionSheetItemIntent;
  /** Optional leading glyph — decorative; the row text names the action. */
  icon?: ReactNode;
  /** Close the sheet after the action runs. @default true */
  closeOnSelect?: boolean;
  /** Render the single child element as the row (Radix Slot) — e.g. wrap a router link. */
  asChild?: boolean;
}

export interface ActionSheetGroupProps extends ComponentPropsWithoutRef<'div'> {
  /** Optional caption above the group's rows. */
  label?: ReactNode;
}
