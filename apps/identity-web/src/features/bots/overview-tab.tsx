import { type ReactNode, useId, useMemo } from 'react';
import { Avatar, ClientOnly, DescriptionList } from '@shadow-library/ui';

import { QueryState, StatusChip } from '@/components/si';
import { type BotCatalogApplicationItem, type BotGrantItem, type BotItem, useBotActivityQuery } from '@/lib/apis';
import { summarizeGrants } from '@/lib/bot-permissions';
import { formatDate, relativeTime } from '@/lib/format';
import { describeEvent } from './bot-activity-events';
import { type KeySummary, RECENT_ACTIVITY_LIMIT } from './bot-detail.shared';
import styles from './bots.module.css';

interface OverviewTabProps {
  bot: BotItem;
  keySummary: KeySummary;
  orgId: string;
  botId: string;
  applications: BotCatalogApplicationItem[];
  grants: BotGrantItem[];
  onManageKeys: () => void;
  onEditPermissions: () => void;
  onViewActivity: () => void;
}

interface SummaryCardProps {
  title: string;
  note?: string;
  badge?: ReactNode;
  linkLabel: string;
  onLink: () => void;
  children: ReactNode;
}

function SummaryCard({ title, note, badge, linkLabel, onLink, children }: SummaryCardProps): React.JSX.Element {
  const titleId = useId();
  return (
    <section className={styles.detailCard} aria-labelledby={titleId}>
      <div className={`${styles.tabHead} ${styles.tabHeadTight}`}>
        <div>
          <h2 id={titleId} className={styles.cardTitleInline}>
            {title}
          </h2>
          {note && <div className={styles.listSub}>{note}</div>}
        </div>
        <div className={styles.overviewCardActions}>
          {badge}
          <button type="button" className={styles.linkButton} aria-describedby={titleId} onClick={onLink}>
            {linkLabel}
          </button>
        </div>
      </div>
      {children}
    </section>
  );
}

export function OverviewTab({ bot, keySummary, orgId, botId, applications, grants, onManageKeys, onEditPermissions, onViewActivity }: OverviewTabProps): React.JSX.Element {
  const recent = useBotActivityQuery(orgId, botId, { limit: RECENT_ACTIVITY_LIMIT }, true);
  const permissionGroups = useMemo(() => summarizeGrants(applications, grants), [applications, grants]);
  const flagged = permissionGroups.some(group => group.items.some(item => item.flagged));

  return (
    <div className={styles.overviewGrid}>
      <div className={styles.cardStack}>
        <section className={styles.detailCard}>
          <h2 className={styles.detailCardTitle}>About</h2>
          <DescriptionList layout="row" termWidth={130}>
            <DescriptionList.Item term="Description">{bot.description || '—'}</DescriptionList.Item>
            <DescriptionList.Item term="Allowed IPs">
              {bot.ipAllowlist.length > 0 ? (
                <div className={styles.ipList}>
                  {bot.ipAllowlist.map(range => (
                    <span key={range} className={styles.mono}>
                      {range}
                    </span>
                  ))}
                </div>
              ) : (
                'All addresses'
              )}
            </DescriptionList.Item>
            <DescriptionList.Item term="Rate limit">{bot.rateLimitPerMinute} requests / minute per app</DescriptionList.Item>
          </DescriptionList>
        </section>

        <section className={styles.detailCard}>
          <h2 className={styles.detailCardTitle}>Calling an API</h2>
          <p className={styles.cardDesc}>Send a key as a bearer token. Every app accepts it the same way.</p>
          <div className={styles.codeBlock}>{'curl https://<app-host>/api/v1/... \\\n  -H "Authorization: Bearer $SHADOW_BOT_KEY"'}</div>
        </section>
      </div>

      <div className={styles.cardStack}>
        <SummaryCard title="API keys" note={keySummary.usage} linkLabel="Manage" onLink={onManageKeys}>
          {keySummary.active.length === 0 ? (
            <p className={styles.muted}>No keys yet.</p>
          ) : (
            <div className={styles.rowList}>
              {keySummary.active.map(key => (
                <div key={key.id} className={styles.listRow}>
                  <div className={styles.listMain}>
                    <div className={styles.listName}>{key.name}</div>
                    <div className={styles.listSub}>
                      Expires {formatDate(key.expiresAt)} · used{' '}
                      <ClientOnly fallback={key.lastUsedAt ? formatDate(key.lastUsedAt) : 'never'}>{key.lastUsedAt ? relativeTime(key.lastUsedAt) : 'never'}</ClientOnly>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SummaryCard>

        <SummaryCard title="Permissions" badge={flagged && <StatusChip intent="warning">Review</StatusChip>} linkLabel="Edit" onLink={onEditPermissions}>
          {permissionGroups.length === 0 ? (
            <p className={styles.muted}>No permissions granted yet.</p>
          ) : (
            <div className={styles.rowList}>
              {permissionGroups.flatMap(group =>
                group.items.map(item => (
                  <div key={`${group.applicationId}-${item.resource}`} className={styles.permissionRow}>
                    <Avatar name={group.applicationName} shape="square" size="sm" />
                    <span className={styles.permissionResource}>{item.resourceLabel}</span>
                    <span className={styles.muted}>{item.levelLabel}</span>
                    {item.flagged && <StatusChip intent="warning">Review</StatusChip>}
                  </div>
                )),
              )}
            </div>
          )}
        </SummaryCard>

        <SummaryCard title="Recent activity" linkLabel="View all" onLink={onViewActivity}>
          <QueryState isLoading={recent.isLoading} error={recent.error} isEmpty={!recent.isLoading && (recent.data?.events.length ?? 0) === 0} emptyTitle="No activity yet">
            <div className={styles.rowList}>
              {(recent.data?.events ?? []).map(event => (
                <div key={event.id} className={styles.activityRow}>
                  <span className={styles.activityDot} data-outcome={event.outcome} />
                  <span className={styles.activityText}>{describeEvent(event)}</span>
                  <ClientOnly fallback={<span className={styles.listSub}>{formatDate(event.occurredAt)}</span>}>
                    <span className={styles.listSub}>{relativeTime(event.occurredAt)}</span>
                  </ClientOnly>
                </div>
              ))}
            </div>
          </QueryState>
        </SummaryCard>
      </div>
    </div>
  );
}
