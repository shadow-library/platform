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
  /** Controlled rail mode (56px, icons only) — pair with `onCollapsedChange`, or it is a fixed rail. */
  collapsed?: boolean;
  /** Starting rail state when uncontrolled. Passing it opts the sidebar into showing a collapse toggle. */
  defaultCollapsed?: boolean;
  /**
   * Persist the uncontrolled rail choice under this localStorage key, so collapse survives reloads
   * without every product owning the state. Read after mount, never during render, so server-rendered
   * apps hydrate cleanly — the first paint shows `defaultCollapsed`.
   */
  storageKey?: string;
  /** Fires with the next rail state, in both controlled and uncontrolled modes. */
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
  /**
   * The current destination — sets aria-current and the active edge bar. Omit it under `asChild` when the
   * slotted router link already marks itself active: the same treatment keys off `data-status="active"`.
   */
  active?: boolean;
  /** Render as the single child (router link) via Slot; the link keeps its own children as the label. */
  asChild?: boolean;
  /** Explicit label for rail tooltip / aria-label when children aren't a plain string. */
  label?: string;
}

export interface SidebarGroupProps extends ComponentPropsWithoutRef<'div'> {
  /** Group trigger label. */
  label: ReactNode;
  /** Leading 16px icon. */
  icon?: ReactNode;
  /** Start expanded, uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Controlled disclosure state — pair with `onOpenChange`. */
  open?: boolean;
  /** Fires with the next disclosure state, in both controlled and uncontrolled modes. */
  onOpenChange?: (open: boolean) => void;
  /** The group contains the active item (shows the edge bar while collapsed). */
  active?: boolean;
}
