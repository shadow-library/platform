import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button, EmptyState } from '@shadow-library/ui';

import { BookIcon, DownloadIcon } from '@/components/icons';
import { sessionQueryOptions, useNotifications } from '@/lib/apis';
import { type Notification, type NotificationType } from '@/lib/apis/notifications.api';

import styles from './notifications-screen.module.css';

type NotifIcon = (props: { size?: number }) => React.JSX.Element;

interface TypeMeta {
  Icon: NotifIcon;
  tone: string | undefined;
}

const BellIcon: NotifIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

const TYPE_META: Record<NotificationType, TypeMeta> = {
  chapter: { Icon: BookIcon, tone: styles.toneChapter },
  download: { Icon: DownloadIcon, tone: styles.toneDownload },
};

function formatRelativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export function NotificationsScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const session = useQuery(sessionQueryOptions());
  const userId = session.data?.userId;
  const { items, unreadCount, markRead, markAllRead } = useNotifications(userId);

  const onOpen = (notification: Notification): void => {
    if (!notification.read) markRead(notification.id);
    void navigate({ to: '/novels/$slug', params: { slug: notification.novelSlug } });
  };

  return (
    <div className={`${styles.page} wn-fade`}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Updates</h1>
          <p className={styles.subtitle}>New chapters on your shelf and finished downloads</p>
        </div>
        <Button variant="secondary" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
          Mark all read
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          illustration={<BellIcon size={26} />}
          title="No updates yet"
          description="When a novel on your shelf publishes chapters past where you left off, or a download finishes, it shows up here."
          action={{ label: 'Browse novels', onClick: () => void navigate({ to: '/browse' }) }}
        />
      ) : (
        <div className={styles.list}>
          {items.map(notification => (
            <NotificationRow key={notification.id} notification={notification} onOpen={onOpen} />
          ))}
        </div>
      )}

      <Button className={styles.prefs} variant="secondary" asChild>
        <Link to="/settings" search={{ section: 'notifications' }}>
          Notification preferences
        </Link>
      </Button>
    </div>
  );
}

function NotificationRow(props: { notification: Notification; onOpen: (notification: Notification) => void }): React.JSX.Element {
  const { notification } = props;
  const { Icon, tone } = TYPE_META[notification.type];

  return (
    <button type="button" onClick={() => props.onOpen(notification)} className={notification.read ? styles.row : `${styles.row} ${styles.rowUnread}`}>
      <span className={`${styles.icon} ${tone}`}>
        <Icon size={18} />
      </span>
      <span className={styles.rowBody}>
        <span className={styles.rowTitle}>{notification.title}</span>
        <span className={styles.rowText}>{notification.body}</span>
        <span className={styles.rowTime}>{formatRelativeTime(notification.createdAt)}</span>
      </span>
      {!notification.read && <span className={styles.dot} aria-hidden="true" />}
    </button>
  );
}
