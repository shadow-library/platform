/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */

/** An inline decision that fits in one click; resolves the item optimistically. */
export interface NotificationAction {
  id: string;
  label: string;
  /** Button prominence. @default the first action is primary, the rest secondary. */
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface NotificationItem {
  /** Stable identity — read/resolve state and keys hang off this. */
  id: string;
  /** Who/what triggered it; rendered 600 by the default item. */
  actor?: string;
  /** The verb-object phrase ("requested access to billing"). */
  action?: ReactNode;
  /** Full custom title, overriding the actor-verb-object composition. */
  title?: ReactNode;
  /** Leading avatar seed (initials/photo). Mutually exclusive with `icon`. */
  avatar?: { name?: string; src?: string };
  /** Leading intent icon, used when there is no actor avatar. */
  icon?: ReactNode;
  /** Display time ("12 minutes ago"). */
  time?: ReactNode;
  /** Timestamp used for day grouping. */
  date?: Date;
  /** Unread items get the accent-soft wash, gutter dot, and 600 title. */
  unread?: boolean;
  /** Filter category id this item belongs to (matched against non-builtin filters). */
  category?: string;
  /** Up to two inline actions. */
  actions?: NotificationAction[];
  /** Replaces the action row once resolved ("Approved · 2m ago"). */
  receipt?: ReactNode;
  /** Navigation target for the whole row. */
  href?: string;
}

export interface NotificationFilter {
  id: string;
  label: string;
  /** Optional count Badge on the tab. */
  count?: number;
}

interface NotificationListOwnProps {
  items: NotificationItem[];
  /** Accessible name for the feed. @default 'Notifications' */
  'aria-label'?: string;
  /** Marks a single item read (fired on navigate/click of an unread item). */
  onRead?: (id: string) => void;
  /** Resolves an inline action optimistically. */
  onAction?: (item: NotificationItem, actionId: string) => void;
  /** Row navigation. */
  onNavigate?: (item: NotificationItem) => void;
  /** Ids currently resolving an action — the action row shows a loading button. */
  pendingIds?: string[];
  /** Override the default actor-verb-object row. */
  renderItem?: (item: NotificationItem) => ReactNode;
  /** Empty-state copy when there are no items. @default "You're all caught up." */
  emptyLabel?: ReactNode;
}

export interface NotificationListProps extends Omit<ComponentPropsWithoutRef<'div'>, 'onAnimationStart' | 'onDrag' | 'onDragEnd' | 'onDragStart'>, NotificationListOwnProps {
  /** Reference "now" for the relative day headers. Pass a fixed value for deterministic SSR; omitted, it resolves on the client after mount, so the server never renders "Today"/"Yesterday". */
  now?: Date;
  /** Locale for absolute day-group headers. Pinned by default so SSR and client agree. @default 'en-US' */
  locale?: string;
}

export interface NotificationCenterProps extends NotificationListOwnProps {
  /** Total unread for the bell badge. @default derived from `items` */
  unreadCount?: number;
  /** Bell badge treatment — a number (with 9+ policy) or a bare dot. @default 'count' */
  badge?: 'count' | 'dot';
  /** Filter tabs. `all` and `unread` ids get built-in semantics; others match `item.category`. */
  filters?: NotificationFilter[];
  /** Initial active filter (uncontrolled). @default the first filter, or 'all' */
  defaultFilter?: string;
  /** Fires when the active filter changes. */
  onFilterChange?: (filterId: string) => void;
  /** "Mark all read" ghost action — scoped to the active filter. */
  onReadAll?: () => void;
  /** Footer link to the full-page inbox. */
  viewAllHref?: string;
  /** Accessible name for the bell trigger. @default 'Notifications' */
  'aria-label'?: string;
  /** Controlled panel open state. */
  open?: boolean;
  /** Initial open state (uncontrolled). */
  defaultOpen?: boolean;
  /** Panel open/close callback. */
  onOpenChange?: (open: boolean) => void;
}
