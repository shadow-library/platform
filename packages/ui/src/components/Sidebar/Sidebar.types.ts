import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

export interface SidebarProps extends Omit<ComponentPropsWithoutRef<'nav'>, 'title'> {
  workspace?: ReactNode;
  footer?: ReactNode;
  /** Controlled rail mode (56px, icons only) — pair with `onCollapsedChange`, or it is a fixed rail. */
  collapsed?: boolean;
  /** Starting rail state when uncontrolled. Passing it opts the sidebar into showing a collapse toggle. */
  defaultCollapsed?: boolean;
  /** Persist the uncontrolled rail choice under this localStorage key. Read after mount, so the first paint shows `defaultCollapsed`. */
  storageKey?: string;
  /** Fires with the next rail state, in both controlled and uncontrolled modes. */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Landmark name. @default 'Main' */
  'aria-label'?: string;
}

export interface SidebarSectionProps extends ComponentPropsWithoutRef<'div'> {
  label?: ReactNode;
}

export interface SidebarItemProps extends ComponentPropsWithoutRef<'a'> {
  icon?: ReactNode;
  badge?: ReactNode;
  /**
   * The current destination — sets aria-current and the active edge bar. Omit it under `asChild` when the
   * slotted router link already marks itself active: the same treatment keys off `data-status="active"`.
   */
  active?: boolean;
  asChild?: boolean;
  label?: string;
  /** Step the row in one level for a nested run inside a flat section. Ignored in rail mode. */
  indent?: boolean;
  /** Wrap the label to two lines instead of ellipsising, for reader-named rows; pair with a `title`. Ignored in rail mode. */
  clamp?: boolean;
}

export interface SidebarSwitcherOption {
  id: string;
  label: string;
  caption?: string;
  imageUrl?: string;
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
  /** Fires with the chosen option's id; the menu (and the shell's mobile nav drawer) closes first so navigation isn't racing the overlay. */
  onSelect: (id: string) => void;
  footerAction?: { label: string; icon?: ReactNode; onSelect: () => void };
  loading?: boolean;
}

export interface SidebarGroupProps extends ComponentPropsWithoutRef<'div'> {
  label: ReactNode;
  icon?: ReactNode;
  /** Start expanded, uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Controlled disclosure state — pair with `onOpenChange`. */
  open?: boolean;
  /** Fires with the next disclosure state, in both controlled and uncontrolled modes. */
  onOpenChange?: (open: boolean) => void;
  active?: boolean;
  /**
   * Makes the header a destination (pass the router link) with the disclosure on its own chevron; give `label` a string to name that toggle. In rail mode it becomes the
   * flyout's first row.
   */
  link?: ReactNode;
  /** A control pinned right of the label (e.g. "new chat"); in rail mode it moves below the flyout's list. */
  action?: ReactNode;
}
