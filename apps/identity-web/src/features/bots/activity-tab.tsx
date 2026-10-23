import { useState } from 'react';
import { Button, ClientOnly, Select, Table } from '@shadow-library/ui';

import { QueryState, StatusChip } from '@/components/si';
import { type BotActivityAction, type BotActivityOutcome, useBotActivityInfiniteQuery } from '@/lib/apis';
import { formatDate, relativeTime } from '@/lib/format';
import { ACTION_LABEL, describeEvent, OUTCOME_META } from './bot-activity-events';
import styles from './bots.module.css';

interface ActivityTabProps {
  orgId: string;
  botId: string;
}

export function ActivityTab({ orgId, botId }: ActivityTabProps): React.JSX.Element {
  const [action, setAction] = useState<'all' | BotActivityAction>('all');
  const [outcome, setOutcome] = useState<'all' | BotActivityOutcome>('all');
  const filter = { action: action === 'all' ? undefined : action, outcome: outcome === 'all' ? undefined : outcome };
  const activity = useBotActivityInfiniteQuery(orgId, botId, filter, true);
  const events = activity.data?.pages.flatMap(page => page.events) ?? [];

  return (
    <div className={styles.page}>
      <div className={styles.tabHead}>
        <div className={styles.tabHeadMain}>
          <h2 className={styles.tabTitle}>Activity</h2>
          <p className={styles.tabDesc}>Key exchanges, refusals and changes to this bot. What the bot does inside each app is kept in that app.</p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <Select size="sm" aria-label="Filter activity by event" value={action} onValueChange={value => setAction(value as 'all' | BotActivityAction)}>
          <Select.Item value="all">All events</Select.Item>
          {(Object.keys(ACTION_LABEL) as BotActivityAction[]).map(key => (
            <Select.Item key={key} value={key}>
              {ACTION_LABEL[key]}
            </Select.Item>
          ))}
        </Select>
        <Select size="sm" aria-label="Filter activity by outcome" value={outcome} onValueChange={value => setOutcome(value as 'all' | BotActivityOutcome)}>
          <Select.Item value="all">All outcomes</Select.Item>
          {(Object.keys(OUTCOME_META) as BotActivityOutcome[]).map(key => (
            <Select.Item key={key} value={key}>
              {OUTCOME_META[key].label}
            </Select.Item>
          ))}
        </Select>
      </div>

      <div className={styles.tableCard}>
        <QueryState
          isLoading={activity.isLoading}
          error={activity.error}
          isEmpty={!activity.isLoading && events.length === 0}
          emptyTitle="No activity yet"
          emptyDescription="Key exchanges and changes to this bot will show up here."
        >
          <Table
            data={events}
            rowKey="id"
            aria-label="Bot activity"
            columns={[
              {
                id: 'time',
                header: 'Time',
                cell: event => (
                  <ClientOnly fallback={<span className={styles.cellName}>{formatDate(event.occurredAt)}</span>}>
                    <span className={styles.cellName}>{relativeTime(event.occurredAt)}</span>
                  </ClientOnly>
                ),
              },
              { id: 'event', header: 'Event', cell: event => <span>{describeEvent(event)}</span> },
              {
                id: 'key',
                header: 'Key · IP',
                cell: event =>
                  event.keyName || event.ip ? (
                    <div className={styles.stackCell}>
                      {event.keyName && <span className={styles.cellName}>{event.keyName}</span>}
                      {event.ip && <span className={styles.cellSub}>{event.ip}</span>}
                    </div>
                  ) : (
                    <span className={styles.muted}>—</span>
                  ),
              },
              { id: 'outcome', header: 'Outcome', cell: event => <StatusChip intent={OUTCOME_META[event.outcome].intent}>{OUTCOME_META[event.outcome].label}</StatusChip> },
            ]}
          />
        </QueryState>
      </div>

      {activity.hasNextPage && (
        <div className={styles.manageKeysRow}>
          <Button variant="secondary" size="sm" loading={activity.isFetchingNextPage} onClick={() => void activity.fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}

      <p className={styles.tabDesc}>Successful key use is summarised at most once an hour per key.</p>
    </div>
  );
}
