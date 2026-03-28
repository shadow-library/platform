/**
 * Importing npm packages
 */
import { type LucideIcon } from 'lucide-react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface NavItem {
  /** Unique key for this item; defaults to `path` if not provided */
  key?: string;
  /** Display label */
  label: string;
  /** Lucide icon component (not element), e.g. `Home` not `<Home />` */
  icon: LucideIcon;
  /** Route path — used for navigation and active-state matching */
  path?: string;
  /** Click handler — called in addition to navigation when `path` is set */
  onClick?: () => void;
  /** Nested children — renders accordion (expanded) or flyout (collapsed) */
  children?: NavItem[];
  /** If true, active match uses exact equality; otherwise prefix match. @default false */
  exactMatch?: boolean;
  /** If true, this item is visually disabled */
  disabled?: boolean;
}

export interface UserMenuAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  color?: string;
  /** If true, a divider is rendered before this action */
  divider?: boolean;
}

export interface UserInfo {
  /** Display name shown in avatar/dropdown */
  name: string;
  /** Optional email shown below name in dropdown */
  email?: string;
  /** Avatar image URL; if absent, initials derived from name */
  avatarUrl?: string;
  /** Menu actions (e.g. "Profile", "Settings", "Logout") */
  actions?: UserMenuAction[];
}

export interface NotificationsConfig {
  /** Unread count displayed as badge; 0 hides badge */
  count: number;
  /** Called when the bell icon is clicked */
  onClick: () => void;
}

export interface NavGroup {
  /** Section header label displayed above the grouped items */
  group: string;
  /** Nav items belonging to this group */
  items: NavItem[];
}
