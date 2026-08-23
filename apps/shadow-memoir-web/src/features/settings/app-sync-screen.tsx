import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Badge, Button, Card, EmptyState, Skeleton, Statistic } from '@shadow-library/ui';

import { Screen, ScreenColumns, screenStyles } from '@/components/ScreenLayout';
import { useAppSync } from '@/lib/data';
import { useSystemOverlays } from '@/features/shell';

import styles from './settings.module.css';

const STATUS_GLYPHS = { online: '✓', offline: '◷', syncing: '↻', failed: '⚠' } as const;

const QUEUE_LABELS = { queued: 'Queued', sent: 'Sent', retrying: 'Retrying', conflict: 'Needs a decision' } as const;

export function AppSyncScreen(): ReactElement {
  const sync = useAppSync();
  const overlays = useSystemOverlays();

  return (
    <Screen
      title="App and sync"
      subtitle="What is on this device, what is waiting to reach the server, and what still works with no connection at all."
      actions={
        <Button size="sm" variant="ghost" asChild>
          <Link to="/settings">Settings</Link>
        </Button>
      }
    >
      {sync.isPending || !sync.data ? <Skeleton.Card /> : null}

      {sync.data ? (
        <ScreenColumns
          aside={
            <>
              <Card padding="md">
                <h2 className={screenStyles.cardTitle}>What works offline</h2>
                <ul className={screenStyles.list}>
                  {sync.data.offlineCapabilities.map(line => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className={screenStyles.cardBody}>{sync.data.onlineOnly}</p>
              </Card>

              <Card padding="md">
                <h2 className={screenStyles.cardTitle}>Session</h2>
                <p className={screenStyles.cardBody}>{sync.data.sessionNote}</p>
                <div className={styles.actions}>
                  <Button size="sm" variant="ghost" onClick={() => overlays.open('session-expired')}>
                    See that state
                  </Button>
                </div>
              </Card>
            </>
          }
        >
          <Card padding="lg">
            <div className={styles.statusHead}>
              <span className={styles.statusGlyph} aria-hidden>
                {STATUS_GLYPHS[sync.data.status]}
              </span>
              <div>
                <h2 className={styles.sectionTitle}>{sync.data.title}</h2>
                <p className={styles.sectionNote}>{sync.data.body}</p>
              </div>
              <div className={styles.actions}>
                <Button size="sm" variant="secondary">
                  Sync now
                </Button>
                {sync.data.conflictCount > 0 ? (
                  <Button size="sm" variant="ghost" onClick={() => overlays.open('sync-conflict')}>
                    Resolve the conflict
                  </Button>
                ) : null}
              </div>
            </div>
            <div className={styles.stats}>
              <Statistic label="Queued changes" value={sync.data.queuedCount} size="sm" />
              <Statistic label="Last synced" value={sync.data.lastSyncedMinutes} unit="min ago" size="sm" />
              <Statistic label="Offline cache" value={sync.data.cacheMegabytes} unit="MB" size="sm" />
              <Statistic label="Conflicts" value={sync.data.conflictCount} size="sm" comparison={sync.data.conflictCount > 0 ? 'weight, today' : 'none'} />
            </div>
          </Card>

          <Card padding="md">
            <h2 className={screenStyles.cardTitle}>Queue</h2>
            {sync.data.queue.length === 0 ? (
              <EmptyState size="inline" title="Nothing is waiting" description="Everything you have logged has reached the server." />
            ) : (
              <>
                <ul className={styles.queueRows}>
                  {sync.data.queue.map(entry => (
                    <li key={entry.id} className={styles.queueRow}>
                      <Badge variant="outline" size="sm">
                        {QUEUE_LABELS[entry.state]}
                      </Badge>
                      <span className={styles.queueText}>
                        <span className={styles.rowTitle}>{entry.text}</span>
                        <span className={styles.rowMeta}>{entry.meta}</span>
                      </span>
                      {entry.retryable ? (
                        <Button size="sm" variant="ghost">
                          Retry
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className={screenStyles.cardBody}>
                  Queued actions apply in the order you made them. Nothing in this list can be lost by closing the app, restarting the device or losing the session.
                </p>
              </>
            )}
          </Card>

          <Card padding="md">
            <h2 className={screenStyles.cardTitle}>Installation and updates</h2>
            <div className={styles.settingRows}>
              {sync.data.installRows.map(row => (
                <div key={row.id} className={styles.settingRow}>
                  <div>
                    <div className={styles.settingLabel}>{row.label}</div>
                    <p className={styles.settingHelp}>{row.help}</p>
                  </div>
                  <Button size="sm" variant={row.overlay === 'update' ? 'primary' : 'ghost'} disabled={row.done} onClick={() => row.overlay && overlays.open(row.overlay)}>
                    {row.action}
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </ScreenColumns>
      ) : null}
    </Screen>
  );
}
