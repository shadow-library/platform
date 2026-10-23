import { type ReactNode } from 'react';

import { type AccountMenuProps } from '../AccountMenu';
import { type BadgeIntent } from '../Badge';
import { type ShellContentPadding } from '../Shell';
import { type SidebarSwitcherOption } from '../Sidebar';

/** A single destination. `to` is a TanStack route path; `params` fills its `$segments`. */
export interface NavLeaf {
  to: string;
  params?: Record<string, string>;
  /**
   * React key and identity. Needed whenever several destinations share one `to` and differ only by
   * `search` — a conversation list, a saved-view list. Defaults to `to`.
   */
  id?: string;
  /**
   * Query params for the destination. They also narrow the active match: the item lights only while the
   * current location carries every one of them, so sibling rows on the same route stay distinct.
   */
  search?: Record<string, unknown>;
  indent?: boolean;
  /** Wrap the label to two lines instead of ellipsising and set the full string as `title`, for reader-named rows (conversations). */
  clamp?: boolean;
  label: string;
  icon?: ReactNode;
  /** Trailing count. Zero is rendered as no badge — a "0" badge is noise, not information. */
  badge?: { count: number; intent?: BadgeIntent };
  /**
   * Match this path exactly. Needed by any index route whose children share its prefix, or `/account`
   * stays lit while you are on `/account/security`.
   */
  exact?: boolean;
  /** Leaves the SPA: renders a real anchor with `target="_blank"` and an external-link glyph. */
  external?: boolean;
  /** Drop the item; per-item so a capability gate sits beside its destination. */
  hidden?: boolean;
}

export interface NavBranch {
  label: string;
  icon?: ReactNode;
  items: NavLeaf[];
  hidden?: boolean;
  /** Makes the group header a destination of its own; the disclosure moves to a chevron button beside it. */
  to?: string;
  params?: Record<string, string>;
  /** Control pinned to the item's header row, e.g. "new chat". */
  action?: ReactNode;
  /** Starting disclosure state; defaults to open when the branch owns the current route. */
  defaultOpen?: boolean;
  /** Controlled disclosure state — pair with `onOpenChange`. */
  open?: boolean;
  /**
   * Fires with the next disclosure state, in both controlled and uncontrolled modes. Uncontrolled it
   * reports the reader's own toggles only, never the route-driven opening — read `defaultOpen` for that.
   */
  onOpenChange?: (open: boolean) => void;
}

export type NavNode = NavBranch | NavLeaf;

export interface NavSection {
  label?: string;
  items: NavNode[];
  hidden?: boolean;
}

export interface ProjectSwitcherConfig {
  /** Omit while no project is in scope — the trigger then shows `emptyLabel`. */
  current?: SidebarSwitcherOption;
  options: SidebarSwitcherOption[];
  emptyLabel?: string;
  menuLabel?: string;
  loading?: boolean;
  onSelect: (id: string) => void;
  footerAction?: { label: string; icon?: ReactNode; onSelect: () => void };
}

export type NavConfig = { variant: 'project'; project: ProjectSwitcherConfig; sections: NavSection[] } | { variant: 'sections'; sections: NavSection[] };

export interface AppShellBrand {
  icon?: ReactNode;
  name: ReactNode;
  tagline?: ReactNode;
  /** Route the mark links to. Omit to render it as static text. */
  to?: string;
}

export interface AppShellProps {
  brand: AppShellBrand;
  nav: NavConfig;
  account: AccountMenuProps;
  /**
   * Tints the brand tagline and the sidebar edge. `warning` marks a privileged surface — an operator
   * console should not look like the account portal it can act on.
   * @default 'default'
   */
  tone?: 'default' | 'warning';
  breadcrumb?: ReactNode;
  search?: ReactNode;
  /** Status chips in the utility cluster (assurance level, environment). Hidden below 640px. */
  status?: ReactNode;
  actions?: ReactNode;
  utility?: ReactNode;
  /** Pinned below the sidebar nav, for progress and context only; identity belongs in the account menu. */
  sidebarFooter?: ReactNode;
  /** Offer the 56px icon rail. @default false */
  collapsible?: boolean;
  /** Persist the rail choice across reloads. Implies `collapsible`. */
  storageKey?: string;
  /**
   * Controls the rail from outside — for a product that folds it by viewport. Without
   * `onSidebarCollapsedChange` it is a fixed state the author cannot toggle.
   */
  sidebarCollapsed?: boolean;
  /** Reports the author's toggle; passing it offers the toggle, as `collapsible` does. */
  onSidebarCollapsedChange?: (collapsed: boolean) => void;
  bottomNav?: ReactNode;
  /** Pin the top bar to the viewport below md too. @default false */
  stickyTopbar?: boolean;
  contentWidth?: number | 'fluid';
  contentPadding?: ShellContentPadding;
  className?: string;
  children?: ReactNode;
}
