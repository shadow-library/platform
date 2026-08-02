/**
 * Importing npm packages
 */
import { type ReactNode } from 'react';

/**
 * Importing user defined packages
 */
import { type AccountMenuProps } from '../AccountMenu';
import { type BadgeIntent } from '../Badge';
import { type ShellContentPadding } from '../Shell';
import { type SidebarSwitcherOption } from '../Sidebar';

/**
 * Defining types
 */

/** A single destination. `to` is a TanStack route path; `params` fills its `$segments`. */
export interface NavLeaf {
  to: string;
  params?: Record<string, string>;
  label: string;
  /** Leading 16px icon. Pass the element, not the component. */
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
  /**
   * Drop the item entirely. Hiding is expressed per item rather than by filtering at the call site so a
   * capability gate reads next to the destination it guards.
   */
  hidden?: boolean;
}

/** A destination that owns sub-destinations — rendered as a disclosure group. */
export interface NavBranch {
  label: string;
  icon?: ReactNode;
  items: NavLeaf[];
  hidden?: boolean;
}

export type NavNode = NavBranch | NavLeaf;

export interface NavSection {
  /** Uppercase group heading. Omit for an unlabelled run of items. */
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

/**
 * What a product declares instead of writing chrome. A flat list is one unlabelled section; sub-children
 * are a property of a node, not of the config — so adding nesting to one item never restructures the rest.
 */
export type NavConfig = { variant: 'project'; project: ProjectSwitcherConfig; sections: NavSection[] } | { variant: 'sections'; sections: NavSection[] };

export interface AppShellBrand {
  /** The product mark. */
  icon?: ReactNode;
  name: ReactNode;
  /** Second line under the name — "Operator console", "Author workspace". */
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
  /** Leading content in the top bar, left of the utility cluster. */
  breadcrumb?: ReactNode;
  /** Centred top-bar slot — a search field or command-palette trigger. */
  search?: ReactNode;
  /** Status chips in the utility cluster (assurance level, environment). Hidden below 640px. */
  status?: ReactNode;
  /** Utility controls left of the account menu — notifications, background jobs, a primary action. */
  actions?: ReactNode;
  /** Theme switch and the like, pinned to the utility cluster's end before the account menu. */
  utility?: ReactNode;
  /**
   * Pinned below the sidebar's nav. For progress and context only — identity belongs in the account
   * menu, and putting it here is what this shell exists to stop.
   */
  sidebarFooter?: ReactNode;
  /** Offer the 56px icon rail. Off by default so the shell matches its reference design. */
  collapsible?: boolean;
  /** Persist the rail choice across reloads. Implies `collapsible`. */
  storageKey?: string;
  /** Phone-only bottom navigation. */
  bottomNav?: ReactNode;
  contentWidth?: number | 'fluid';
  contentPadding?: ShellContentPadding;
  className?: string;
  children?: ReactNode;
}
