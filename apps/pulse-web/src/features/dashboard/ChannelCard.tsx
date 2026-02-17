/**
 * Importing npm packages
 */
import { MailOutlined, MessageOutlined, NotificationOutlined } from '@ant-design/icons';
import { Card, Progress } from 'antd';

/**
 *  Importing user defined modules
 */
import type { NotificationDeliveryStats, NotificationChannel } from '@/lib';
import { getSuccessProgress } from './dashboard.utils';

/**
 * Importing styles or styled components
 */
import styles from './Dashboard.module.css';

/**
 * Declaring types
 */

type Channel = Lowercase<NotificationChannel>;

export interface ChannelCardProps {
  loading?: boolean;
  channel: Channel;
  stats?: NotificationDeliveryStats;
}

interface ChannelConfig {
  icon: React.ReactNode;
  label: string;
}

/**
 * Declaring constants
 */
const DEFAULT_STATS: NotificationDeliveryStats = { total: 0, succeeded: 0, failed: 0, pending: 0 };
const channelConfigs: Record<Channel, ChannelConfig> = {
  email: { icon: <MailOutlined className="text-2xl" />, label: 'Email' },
  sms: { icon: <MessageOutlined className="text-2xl" />, label: 'SMS' },
  push: { icon: <NotificationOutlined className="text-2xl" />, label: 'Push Notification' },
};

export default function ChannelCard(props: ChannelCardProps) {
  const channelConfig = channelConfigs[props.channel];
  const stats = props.stats || DEFAULT_STATS;
  const progress = getSuccessProgress(stats.total, stats.succeeded);

  const cardTitle = (
    <div className="flex items-center gap-2">
      {channelConfig.icon}
      <span>{channelConfig.label}</span>
    </div>
  );

  return (
    <Card title={cardTitle} className="h-full" loading={props.loading}>
      <div className="space-y-4">
        <div className={styles.channelStat}>
          <span>Total</span>
          <span>{stats.total}</span>
        </div>
        <div className={styles.channelStat}>
          <span>Succeeded</span>
          <span className="text-[var(--color-success)]">{stats.succeeded}</span>
        </div>
        <div className={styles.channelStat}>
          <span>Failed</span>
          <span className="text-[var(--color-error)]">{stats.failed}</span>
        </div>
        <div className={styles.channelStat}>
          <span>Pending</span>
          <span className="text-[var(--color-warning)]">{stats.pending}</span>
        </div>
        <Progress percent={progress.rate} status={progress.status} strokeColor={progress.strokeColor} aria-label={`${channelConfig.label} Success Rate`} />
      </div>
    </Card>
  );
}
