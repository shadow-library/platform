/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export interface SidebarProps extends Omit<ComponentPropsWithoutRef<'nav'>, 'title'> {
  /** Product identity shown in the fixed header. */
  workspace?: ReactNode;
  /** Pinned footer slot (account, settings). */
  footer?: ReactNode;
  /** Rail mode (56px, icons only). @default false */
  collapsed?: boolean;
  /** Fires when the collapse toggle is pressed. Omit to hide the toggle. */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Landmark name. @default 'Main' */
  'aria-label'?: string;
}

export interface SidebarSectionProps extends ComponentPropsWithoutRef<'div'> {
  /** Section label (hidden in rail mode). */
  label?: ReactNode;
}

export interface SidebarItemProps extends ComponentPropsWithoutRef<'a'> {
  /** Leading 16px icon. */
  icon?: ReactNode;
  /** Trailing badge/count (joined to the accessible name). */
  badge?: ReactNode;
  /** The current destination — sets aria-current and the active edge bar. */
  active?: boolean;
  /** Render as the single child (router link) via Slot. */
  asChild?: boolean;
  /** Explicit label for rail tooltip / aria-label when children aren't a plain string. */
  label?: string;
}

export interface SidebarGroupProps extends ComponentPropsWithoutRef<'div'> {
  /** Group trigger label. */
  label: ReactNode;
  /** Leading 16px icon. */
  icon?: ReactNode;
  /** Start expanded. @default false */
  defaultOpen?: boolean;
  /** The group contains the active item (shows the edge bar while collapsed). */
  active?: boolean;
}
