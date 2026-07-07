/**
 * Importing npm packages
 */
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { Popover } from '../Popover';
import { Tabs } from '../Tabs';
import styles from './NotificationCenter.module.css';
import { type NotificationCenterProps, type NotificationItem } from './NotificationCenter.types';
import { NotificationList } from './NotificationList';

/**
 * Declaring the constants
 */
function BellIcon() {
  return (
    <svg viewBox='0 0 20 20' width='20' height='20' fill='none' stroke='currentColor' strokeWidth={1.6} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M10 2.5a5 5 0 0 0-5 5c0 4-1.5 5.5-1.5 5.5h13S15 11.5 15 7.5a5 5 0 0 0-5-5Z' />
      <path d='M8.5 16a1.5 1.5 0 0 0 3 0' />
    </svg>
  );
}

function matchesFilter(item: NotificationItem, filterId: string): boolean {
  if (filterId === 'all') return true;
  if (filterId === 'unread') return item.unread === true;
  return item.category === filterId;
}

/**
 * The persistent inbox behind the bell — a Popover panel of notifications with read/unread state,
 * filter tabs, day grouping, and inline actions. Toast is the moment; this is the record. Opening the
 * panel does not mark items read (reading does); the bell announces its unread count politely only
 * while closed, so it never double-announces. The list body ships as `NotificationList` for the
 * full-page inbox — one renderer, two hosts.
 */
export function NotificationCenter({
  items,
  unreadCount,
  badge = 'count',
  filters,
  defaultFilter,
  onFilterChange,
  onRead,
  onReadAll,
  onAction,
  onNavigate,
  pendingIds,
  renderItem,
  emptyLabel,
  viewAllHref,
  'aria-label': ariaLabel = 'Notifications',
  open,
  defaultOpen,
  onOpenChange,
}: NotificationCenterProps) {
  const firstFilter = defaultFilter ?? filters?.[0]?.id ?? 'all';
  const [activeFilter, setActiveFilter] = useState(firstFilter);

  const unread = unreadCount ?? items.filter(item => item.unread).length;
  const badgeText = badge === 'dot' ? '' : unread > 9 ? '9+' : String(unread);
  const bellLabel = unread > 0 ? `${ariaLabel}, ${unread} unread` : ariaLabel;

  const visibleItems = filters ? items.filter(item => matchesFilter(item, activeFilter)) : items;

  function selectFilter(id: string): void {
    setActiveFilter(id);
    onFilterChange?.(id);
  }

  return (
    <Popover open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <div className={styles.bell}>
        <Popover.Trigger asChild>
          <IconButton icon={<BellIcon />} variant='ghost' aria-label={bellLabel} aria-haspopup='dialog' />
        </Popover.Trigger>
        {unread > 0 ? (
          <span className={styles.badge} data-dot={badge === 'dot' || undefined} aria-hidden='true'>
            {badgeText}
          </span>
        ) : null}
        <span className={styles.srOnly} aria-live='polite'>
          {unread > 0 ? `${unread} unread notifications` : ''}
        </span>
      </div>

      <Popover.Content className={styles.panel} align='end' aria-label={ariaLabel}>
        <div className={styles.header}>
          <span className={styles.panelTitle}>{ariaLabel}</span>
          {onReadAll ? (
            <Button variant='text' size='sm' onClick={onReadAll}>
              Mark all read
            </Button>
          ) : null}
        </div>

        {filters && filters.length > 0 ? (
          <Tabs value={activeFilter} onValueChange={selectFilter} className={styles.tabs}>
            <Tabs.List>
              {filters.map(filter => (
                <Tabs.Tab key={filter.id} value={filter.id} count={filter.count}>
                  {filter.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>
        ) : null}

        <div className={styles.scroll}>
          <NotificationList
            items={visibleItems}
            onRead={onRead}
            onAction={onAction}
            onNavigate={onNavigate}
            pendingIds={pendingIds}
            renderItem={renderItem}
            emptyLabel={emptyLabel}
            aria-label={ariaLabel}
          />
        </div>

        {viewAllHref ? (
          <a className={styles.footer} href={viewAllHref}>
            View all notifications
          </a>
        ) : null}
      </Popover.Content>
    </Popover>
  );
}
