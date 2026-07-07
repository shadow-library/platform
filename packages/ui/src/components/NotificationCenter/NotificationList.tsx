/**
 * Importing npm packages
 */
import { forwardRef, type KeyboardEvent, type MouseEvent } from 'react';

/**
 * Importing user defined packages
 */
import { addDays, cn, formatLongDate, isSameDay } from '@/lib';

import { Avatar } from '../Avatar';
import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import styles from './NotificationCenter.module.css';
import { type NotificationItem, type NotificationListProps } from './NotificationCenter.types';

/**
 * Declaring the constants
 */
interface DayGroup {
  key: string;
  label: string | null;
  items: NotificationItem[];
}

function groupByDay(items: NotificationItem[]): DayGroup[] {
  const dated = items.some(item => item.date instanceof Date);
  if (!dated) return [{ key: 'all', label: null, items }];

  const today = new Date();
  const yesterday = addDays(today, -1);
  const groups: DayGroup[] = [];
  const index = new Map<string, DayGroup>();

  for (const item of items) {
    const date = item.date ?? today;
    const key = date.toDateString();
    let group = index.get(key);
    if (!group) {
      const label = isSameDay(date, today) ? 'Today' : isSameDay(date, yesterday) ? 'Yesterday' : formatLongDate(date);
      group = { key, label, items: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

function DefaultItemBody({ item }: { item: NotificationItem }) {
  if (item.title != null) return <span className={styles.title}>{item.title}</span>;
  return (
    <span className={styles.title}>
      {item.actor ? <span className={styles.actor}>{item.actor}</span> : null}
      {item.actor && item.action ? ' ' : null}
      {item.action}
    </span>
  );
}

function itemName(item: NotificationItem): string {
  const parts = [item.actor, typeof item.action === 'string' ? item.action : undefined].filter(Boolean);
  const base = parts.length > 0 ? parts.join(' ') : typeof item.title === 'string' ? item.title : 'Notification';
  return item.unread ? `${base}, unread` : base;
}

/**
 * The feed body — a labelled `role="feed"` of `role="article"` notifications, day-grouped by timestamp.
 * Ships separately from the panel so the full-page inbox and the bell popover share one renderer. Row
 * click navigates (and marks read); inline action buttons stop propagation, because deciding and
 * visiting are separate acts.
 */
export const NotificationList = forwardRef<HTMLDivElement, NotificationListProps>(function NotificationList(
  { items, onRead, onAction, onNavigate, pendingIds = [], renderItem, emptyLabel = "You're all caught up.", 'aria-label': ariaLabel = 'Notifications', className, ...props },
  ref,
) {
  if (items.length === 0)
    return (
      <div ref={ref} className={cn(styles.feed, styles.feedEmpty, className)} {...props}>
        <EmptyState size='inline' title={emptyLabel} />
      </div>
    );

  const groups = groupByDay(items);

  function navigate(item: NotificationItem): void {
    if (item.unread) onRead?.(item.id);
    onNavigate?.(item);
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLElement>, item: NotificationItem): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    navigate(item);
  }

  function onActionClick(event: MouseEvent, item: NotificationItem, actionId: string): void {
    event.stopPropagation();
    onAction?.(item, actionId);
  }

  return (
    <div ref={ref} className={cn(styles.feed, className)} role='feed' aria-label={ariaLabel} {...props}>
      {groups.map(group => (
        <div key={group.key} className={styles.group}>
          {group.label ? <div className={styles.groupLabel}>{group.label}</div> : null}
          {group.items.map(item => {
            const resolved = item.receipt != null;
            const pending = pendingIds.includes(item.id);
            return (
              <article
                key={item.id}
                className={styles.item}
                data-unread={item.unread || undefined}
                // biome-ignore lint/a11y/noNoninteractiveTabindex: the row is a click/keyboard target in the ARIA feed pattern
                tabIndex={0}
                aria-label={itemName(item)}
                onClick={() => navigate(item)}
                onKeyDown={event => onRowKeyDown(event, item)}
              >
                {item.unread ? <span className={styles.dot} aria-hidden='true' /> : null}
                <span className={styles.leading}>
                  {item.icon ? <span className={styles.icon}>{item.icon}</span> : <Avatar size='sm' name={item.avatar?.name ?? item.actor} src={item.avatar?.src} />}
                </span>
                <span className={styles.body}>
                  {renderItem ? renderItem(item) : <DefaultItemBody item={item} />}
                  {item.time != null ? <span className={styles.time}>{item.time}</span> : null}
                  {resolved ? (
                    <span className={styles.receipt}>{item.receipt}</span>
                  ) : item.actions && item.actions.length > 0 ? (
                    <span className={styles.actions}>
                      {item.actions.slice(0, 2).map((action, i) => (
                        <Button
                          key={action.id}
                          size='sm'
                          variant={action.variant ?? (i === 0 ? 'primary' : 'secondary')}
                          loading={pending}
                          onClick={event => onActionClick(event, item, action.id)}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </span>
                  ) : null}
                </span>
              </article>
            );
          })}
        </div>
      ))}
    </div>
  );
});
