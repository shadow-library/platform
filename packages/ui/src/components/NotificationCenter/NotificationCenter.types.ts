import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

export interface NotificationAction {
  id: string;
  label: string;
  /** Button prominence. @default the first action is primary, the rest secondary. */
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface NotificationItem {
  id: string;
  actor?: string;
  action?: ReactNode;
  title?: ReactNode;
  /** Leading avatar seed (initials/photo). Mutually exclusive with `icon`. */
  avatar?: { name?: string; src?: string };
  icon?: ReactNode;
  time?: ReactNode;
  date?: Date;
  unread?: boolean;
  category?: string;
  actions?: NotificationAction[];
  receipt?: ReactNode;
  href?: string;
}

export interface NotificationFilter {
  id: string;
  label: string;
  count?: number;
}

interface NotificationListOwnProps {
  items: NotificationItem[];
  /** Accessible name for the feed. @default 'Notifications' */
  'aria-label'?: string;
  onRead?: (id: string) => void;
  onAction?: (item: NotificationItem, actionId: string) => void;
  onNavigate?: (item: NotificationItem) => void;
  /** Ids currently resolving an action — the action row shows a loading button. */
  pendingIds?: string[];
  renderItem?: (item: NotificationItem) => ReactNode;
  /** Empty-state copy when there are no items. @default "You're all caught up." */
  emptyLabel?: ReactNode;
}

export interface NotificationListProps extends Omit<ComponentPropsWithoutRef<'div'>, 'onAnimationStart' | 'onDrag' | 'onDragEnd' | 'onDragStart'>, NotificationListOwnProps {
  /**
   * Reference "now" for the relative day headers. Pass a fixed value for deterministic SSR; omitted, it resolves on the client after mount, so the server never renders
   * "Today"/"Yesterday".
   */
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
  onReadAll?: () => void;
  viewAllHref?: string;
  /** Accessible name for the bell trigger. @default 'Notifications' */
  'aria-label'?: string;
  /** Controlled panel open state. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}
