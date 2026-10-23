import { useMemo } from 'react';
import { Avatar, Button, ClientOnly, DescriptionList } from '@shadow-library/ui';

import { QueryState, StatusChip } from '@/components/si';
import { type BotCatalogApplicationItem, type BotGrantItem, type BotItem, type BotKeyItem, useBotActivityQuery } from '@/lib/apis';
import { summarizeGrants } from '@/lib/bot-permissions';
import { formatDate, relativeTime } from '@/lib/format';
import { describeEvent } from './bot-activity-events';
import { MAX_ACTIVE_KEYS, RECENT_ACTIVITY_LIMIT } from './bot-detail.shared';
import styles from './bots.module.css';

interface OverviewTabProps {
  bot: BotItem;
  activeKeys: BotKeyItem[];
  orgId: string;
  botId: string;
  applications: BotCatalogApplicationItem[];
  grants: BotGrantItem[];
  onManageKeys: () => void;
  onEditPermissions: () => void;
  onViewActivity: () => void;
}

export function OverviewTab({ bot, activeKeys, orgId, botId, applications, grants, onManageKeys, onEditPermissions, onViewActivity }: OverviewTabProps): React.JSX.Element {
  const recent = useBotActivityQuery(orgId, botId, { limit: RECENT_ACTIVITY_LIMIT }, true);
  const permissionGroups = useMemo(() => summarizeGrants(applications, grants), [applications, grants]);
  const flaggedCount = useMemo(() => permissionGroups.reduce((count, group) => count + group.items.filter(item => item.flagged).length, 0), [permissionGroups]);

  return (
    <div className={styles.overviewGrid}>
      <div className={styles.cardStack}>
        <div className={styles.detailCard}>
          <div className={styles.detailCardTitle}>Details</div>
          <DescriptionList layout="row" termWidth={130}>
            <DescriptionList.Item term="Handle" mono>
              {bot.handle}[bot]
            </DescriptionList.Item>
            <DescriptionList.Item term="Bot ID" mono copyable>
              {bot.id}
            </DescriptionList.Item>
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
        </div>

        <div className={styles.detailCard}>
          <div className={styles.detailCardTitle}>Calling an API</div>
          <p className={styles.cardDesc}>Send a key as a bearer token. Every app accepts it the same way.</p>
          <div className={styles.codeBlock}>{'curl https://<app-host>/api/v1/... \\\n  -H "Authorization: Bearer $SHADOW_BOT_KEY"'}</div>
        </div>
      </div>

      <div className={styles.cardStack}>
        <div className={styles.detailCard}>
          <div className={`${styles.tabHead} ${styles.tabHeadTight}`}>
            <div className={styles.cardTitleInline}>Permissions</div>
            <div className={styles.overviewCardActions}>
              {flaggedCount > 0 && <StatusChip intent="warning">Review</StatusChip>}
              <button type="button" className={styles.linkButton} onClick={onEditPermissions}>
                Edit
              </button>
            </div>
          </div>
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
        </div>

        <div className={styles.detailCard}>
          <div className={`${styles.tabHead} ${styles.tabHeadTight}`}>
            <div className={styles.cardTitleInline}>API keys</div>
            <span className={styles.tabHeadNote}>
              {activeKeys.length} of {MAX_ACTIVE_KEYS} active
            </span>
          </div>
          {activeKeys.length === 0 ? (
            <p className={styles.muted}>No active keys yet.</p>
          ) : (
            <div className={styles.rowList}>
              {activeKeys.map(key => (
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
          <div className={styles.manageKeysRow}>
            <Button variant="secondary" size="sm" onClick={onManageKeys}>
              Manage keys
            </Button>
          </div>
        </div>

        <div className={styles.detailCard}>
          <div className={`${styles.tabHead} ${styles.tabHeadTight}`}>
            <div className={styles.cardTitleInline}>Recent activity</div>
            <button type="button" className={styles.linkButton} onClick={onViewActivity}>
              View all
            </button>
          </div>
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
        </div>
      </div>
    </div>
  );
}
