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
  /**
   * Step the row in one level, for a nested run inside a flat section — a conversation list under the
   * screen that owns it. Group children are already indented by the list's own guide; this is for the
   * ones that have no group. Ignored in rail mode, where there is no room to express depth.
   */
  indent?: boolean;
}

export interface SidebarSwitcherOption {
  /** Stable identity — passed back to `onSelect` and used as the React key. */
  id: string;
  label: string;
  /** Secondary line (kind, id, plan tier) — the disambiguator when two projects share a name. */
  caption?: string;
  /** Thumbnail; falls back to a `color` dot, then to a neutral dot. */
  imageUrl?: string;
  /** CSS color for the fallback dot, so a project stays recognisable before its image loads. */
  color?: string;
}

export interface SidebarSwitcherProps extends Omit<ComponentPropsWithoutRef<'div'>, 'onSelect'> {
  /** The option in scope. Omit for the "no project selected" state, which shows `emptyLabel`. */
  current?: SidebarSwitcherOption;
  options: SidebarSwitcherOption[];
  /** Trigger label when nothing is selected. @default 'All projects' */
  emptyLabel?: string;
  /** Heading above the option list. @default 'Switch project' */
  menuLabel?: string;
  /** Fires with the chosen option's id; the menu closes first so navigation isn't racing the overlay. */
  onSelect: (id: string) => void;
  /** A pinned row below the options — "View all projects", "New project". */
  footerAction?: { label: string; icon?: ReactNode; onSelect: () => void };
  /** Shows a placeholder row while the options are still arriving. */
  loading?: boolean;
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
  /**
   * Makes the header itself a destination: pass the router link element, and the disclosure moves to its
   * own chevron button beside it. The link is named by its own children, so `label` is what names the
   * disclosure — give a string one, or the toggle has no useful accessible name. In rail mode the
   * destination becomes the first row of the flyout, so collapsing never strands it.
   */
  link?: ReactNode;
  /**
   * A control pinned to the header row, right of the label — "new chat". In rail mode it moves below the
   * flyout's list, since the rail's header is an icon with no room beside it.
   */
  action?: ReactNode;
}
