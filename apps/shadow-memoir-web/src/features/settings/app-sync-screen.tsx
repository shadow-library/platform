import { Link } from '@tanstack/react-router';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, ConfirmDialog, copyText, EmptyState, Skeleton, Statistic, toast } from '@shadow-library/ui';

import { Screen, ScreenColumns, screenStyles } from '@/components/ScreenLayout';
import { useSystemOverlays } from '@/features/shell';
import { useAppUpdate } from '@/lib/app-update';
import { type AccountCommandHook, type AccountDevice, type FailedChange, type InstallRow, installRows, notifyOutcome, useAccountCommand, useAppSync } from '@/lib/data';
import { useSyncEngine, useSyncReadiness } from '@/lib/sync';

import styles from './settings.module.css';

const STATUS_GLYPHS = { online: '✓', offline: '◷', syncing: '↻', failed: '⚠', 'signed-out': '⚿' } as const;

const QUEUE_LABELS = { queued: 'Queued', sent: 'Sent', retrying: 'Retrying', conflict: 'Needs a decision' } as const;

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export function AppSyncScreen(): ReactElement {
  const sync = useAppSync();
  const command = useAccountCommand();
  const engine = useSyncEngine();
  const overlays = useSystemOverlays();
  const readiness = useSyncReadiness();
  const update = useAppUpdate();
  const [syncing, setSyncing] = useState(false);
  const [removal, setRemoval] = useState<{ device: AccountDevice; open: boolean } | null>(null);

  const syncNow = (): void => {
    if (!engine || syncing) return;
    setSyncing(true);
    void engine.sync().finally(() => setSyncing(false));
  };

  const removeDevice = async (device: AccountDevice): Promise<void> => {
    const outcome = await command.run({ type: 'device.remove', deviceId: device.id });
    notifyOutcome(outcome, { success: outcome.status === 'applied' ? outcome.local.message : '', action: 'remove', subject: device.name });
  };

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
                <Card.Body>
                  <h2 className={screenStyles.cardTitle}>What works offline</h2>
                  <ul className={screenStyles.list}>
                    {sync.data.offlineCapabilities.map(line => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p className={screenStyles.cardBody}>{sync.data.onlineOnly}</p>
                </Card.Body>
              </Card>

              <Card padding="md">
                <Card.Body>
                  <h2 className={screenStyles.cardTitle}>Session</h2>
                  <p className={screenStyles.cardBody}>{sync.data.sessionNote}</p>
                  <div className={styles.actions}>
                    <Button size="sm" variant="secondary" onClick={() => overlays.open('session-expired')}>
                      See that state
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            </>
          }
        >
          <Card padding="lg">
            <Card.Body>
              <div className={styles.statusHead}>
                <span className={styles.statusGlyph} aria-hidden>
                  {STATUS_GLYPHS[sync.data.status]}
                </span>
                <div>
                  <h2 className={styles.sectionTitle}>{sync.data.title}</h2>
                  <p className={styles.sectionNote}>{sync.data.body}</p>
                </div>
                <div className={styles.actions}>
                  <Button size="sm" variant="secondary" loading={syncing} loadingText="Syncing…" disabled={!engine || syncing} onClick={syncNow}>
                    Sync now
                  </Button>
                </div>
              </div>
              <div className={styles.stats}>
                <Statistic label="Queued changes" value={sync.data.queuedCount} size="sm" />
                <Statistic label="Registered devices" value={sync.data.devices.length} size="sm" loading={readiness.kind === 'loading'} error={readiness.kind === 'failed'} />
              </div>
              <p className={screenStyles.cardBody}>
                {sync.data.lastSyncedAt ? `Last synced ${new Date(sync.data.lastSyncedAt).toLocaleString()}.` : 'This device has not completed a sync yet.'}
              </p>
            </Card.Body>
          </Card>

          <Card padding="md">
            <Card.Body>
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
                      </li>
                    ))}
                  </ul>
                  <p className={screenStyles.cardBody}>
                    Queued actions apply in the order you made them. Nothing in this list can be lost by closing the app, restarting the device or losing the session.
                  </p>
                </>
              )}
            </Card.Body>
          </Card>

          <FailedChangesCard failed={sync.data.failed} command={command} />

          <Card padding="md">
            <Card.Body>
              <h2 className={screenStyles.cardTitle}>Devices</h2>
              {readiness.kind === 'loading' ? (
                <Skeleton.List rows={2} />
              ) : readiness.kind === 'failed' ? (
                <EmptyState size="inline" title="Devices haven't loaded yet" description="They appear once this device completes a sync." />
              ) : sync.data.devices.length === 0 ? (
                <EmptyState size="inline" title="No devices yet" description="A device registers itself the first time it syncs." />
              ) : (
                <ul className={styles.deviceRows}>
                  {sync.data.devices.map(device => (
                    <DeviceRow key={device.id} device={device} command={command} onRemove={confirmed => setRemoval({ device: confirmed, open: true })} />
                  ))}
                </ul>
              )}
            </Card.Body>
          </Card>

          <Card padding="md">
            <Card.Body>
              <h2 className={screenStyles.cardTitle}>Installation and updates</h2>
              <div className={styles.settingRows}>
                {installRows(update).map(row => (
                  <InstallRowView key={row.id} row={row} onOpen={overlays.open} />
                ))}
              </div>
            </Card.Body>
          </Card>
        </ScreenColumns>
      ) : null}

      {removal ? (
        <ConfirmDialog
          open={removal.open}
          onOpenChange={open => setRemoval({ ...removal, open })}
          intent="danger"
          title={`Remove “${removal.device.name}”?`}
          description={`${removal.device.meta}. It only leaves this list: removing it doesn’t sign that device out, and it adds itself back if it opens Shadow Memoir again.`}
          confirmLabel="Remove"
          cancelLabel="Keep it"
          onConfirm={() => void removeDevice(removal.device)}
        />
      ) : null}
    </Screen>
  );
}

interface DeviceRowProps {
  device: AccountDevice;
  command: AccountCommandHook;
  onRemove: (device: AccountDevice) => void;
}

function DeviceRow({ device, command, onRemove }: DeviceRowProps): ReactElement {
  const removing = command.isPendingFor(item => item.type === 'device.remove' && item.deviceId === device.id);

  return (
    <li className={styles.deviceRow}>
      <span className={styles.deviceText}>
        <span className={styles.deviceName} title={device.name}>
          {device.name}
        </span>
        <span className={styles.rowMeta}>{device.current ? `This device · ${lowerFirst(device.meta)}` : device.meta}</span>
      </span>
      {device.current ? (
        <Button size="sm" variant="ghost" disabled>
          In use
        </Button>
      ) : (
        <Button size="sm" variant="ghost" aria-label={`Remove ${device.name}`} loading={removing} loadingText="Removing…" disabled={removing} onClick={() => onRemove(device)}>
          Remove
        </Button>
      )}
    </li>
  );
}

interface FailedChangesCardProps {
  failed: FailedChange[];
  command: AccountCommandHook;
}

interface FocusAfterDismiss {
  dismissed: string;
  next: string | null;
}

function FailedChangesCard({ failed, command }: FailedChangesCardProps): ReactElement | null {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const focusAfter = useRef<FocusAfterDismiss | null>(null);
  const [dismissals, setDismissals] = useState(0);
  const [confirming, setConfirming] = useState<{ change: FailedChange; open: boolean } | null>(null);

  useEffect(() => {
    const pending = focusAfter.current;
    if (!pending || failed.some(change => change.id === pending.dismissed)) return;
    focusAfter.current = null;
    ((pending.next ? rows.current.get(pending.next) : undefined) ?? headingRef.current)?.focus();
  }, [failed, dismissals]);

  const dismiss = async (change: FailedChange): Promise<void> => {
    const index = failed.findIndex(item => item.id === change.id);
    const outcome = await command.run({ type: 'failedChange.dismiss', commandId: change.id });
    notifyOutcome(outcome, { success: '', action: 'dismiss', subject: change.text });
    if (outcome.status !== 'applied') return;
    focusAfter.current = { dismissed: change.id, next: (failed[index + 1] ?? failed[index - 1])?.id ?? null };
    setDismissals(count => count + 1);
  };

  const requestDismiss = (change: FailedChange): void => {
    if (change.journalText === null) return void dismiss(change);
    setConfirming({ change, open: true });
  };

  const trackRow = (id: string, element: HTMLLIElement | null): void => {
    if (element) rows.current.set(id, element);
    else rows.current.delete(id);
  };

  if (failed.length === 0 && dismissals === 0) return null;

  return (
    <Card padding="md">
      <Card.Body>
        <h2 ref={headingRef} tabIndex={-1} className={screenStyles.cardTitle}>
          Couldn’t sync
        </h2>
        {failed.length === 0 ? (
          <EmptyState size="inline" title="Nothing else failed" description="Every change this device couldn’t sync has been dismissed." />
        ) : (
          <>
            <p className={screenStyles.cardBody}>
              The server couldn’t save these, and sending them again would fail the same way, so they left the queue and were undone on this device. Copy anything you want to keep
              before you dismiss it.
            </p>
            <ul className={styles.queueRows}>
              {failed.map(change => (
                <FailedChangeRow key={change.id} change={change} command={command} rowRef={element => trackRow(change.id, element)} onDismiss={requestDismiss} />
              ))}
            </ul>
          </>
        )}
      </Card.Body>

      {confirming ? (
        <ConfirmDialog
          open={confirming.open}
          onOpenChange={open => setConfirming({ ...confirming, open })}
          intent="danger"
          title="Dismiss this journal entry?"
          description="Its text is only kept here. Once it’s dismissed it can’t be brought back, so copy it first if you want to keep it."
          confirmLabel="Dismiss"
          cancelLabel="Keep it"
          onConfirm={() => void dismiss(confirming.change)}
        />
      ) : null}
    </Card>
  );
}

interface FailedChangeRowProps {
  change: FailedChange;
  command: AccountCommandHook;
  rowRef: (element: HTMLLIElement | null) => void;
  onDismiss: (change: FailedChange) => void;
}

function FailedChangeRow({ change, command, rowRef, onDismiss }: FailedChangeRowProps): ReactElement {
  const dismissing = command.isPendingFor(item => item.type === 'failedChange.dismiss' && item.commandId === change.id);
  const journalText = change.journalText;

  const copy = async (text: string): Promise<void> => {
    if (await copyText(text)) return void toast.success('Copied. Paste it into a new journal entry to keep it.');
    toast.warning('Couldn’t copy it. Select the text and copy it yourself.');
  };

  return (
    <li ref={rowRef} tabIndex={-1} className={styles.failedRow}>
      <div className={styles.failedHead}>
        <span className={styles.queueText}>
          <span className={styles.rowTitle}>{change.text}</span>
          <span className={styles.rowMeta}>
            {change.reason} {change.meta}
          </span>
        </span>
        <div className={styles.rowActions}>
          {journalText !== null ? (
            <Button size="sm" variant="secondary" onClick={() => void copy(journalText)}>
              Copy text
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" aria-label={`Dismiss ${change.text}`} loading={dismissing} disabled={dismissing} onClick={() => onDismiss(change)}>
            Dismiss
          </Button>
        </div>
      </div>
      {journalText !== null ? <p className={styles.failedText}>{journalText}</p> : null}
    </li>
  );
}

interface InstallRowViewProps {
  row: InstallRow;
  onOpen: (overlay: NonNullable<InstallRow['action']>['overlay']) => void;
}

function InstallRowView({ row, onOpen }: InstallRowViewProps): ReactElement {
  const action = row.action;

  return (
    <div className={styles.settingRow}>
      <div className={styles.settingRowText}>
        <div className={styles.settingLabel}>{row.label}</div>
        <p className={styles.settingHelp}>{row.help}</p>
      </div>
      {action ? (
        <div className={styles.settingControl}>
          <Button size="sm" variant={action.overlay === 'update' ? 'primary' : 'secondary'} onClick={() => onOpen(action.overlay)}>
            {action.label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
