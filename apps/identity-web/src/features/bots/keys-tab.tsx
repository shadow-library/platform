import { Fragment, useId, useState } from 'react';
import { Alert, Button, ClientOnly, ConfirmDialog, Skeleton, toast } from '@shadow-library/ui';

import { KeyIcon } from '@/components/icons';
import { StatusChip } from '@/components/si';
import { type StepUpRequire } from '@/features/portal';
import { type ApiError, type BotItem, type BotKeyItem, useRevokeBotKeyMutation } from '@/lib/apis';
import { botErrorMessage } from '@/lib/bot-errors';
import { formatDate, relativeTime } from '@/lib/format';
import { type FilledKeySlot, formatKeyUsage, keyExpiryWarning, keySlots, MAX_ACTIVE_KEYS } from './bot-detail.shared';
import styles from './bots.module.css';

interface KeysTabProps {
  orgId: string;
  botId: string;
  status: BotItem['status'];
  keys: BotKeyItem[];
  activeKeyCount: number;
  isLoading: boolean;
  error: ApiError | null;
  require: StepUpRequire;
  onGenerate: () => void;
}

interface FilledSlotProps {
  slot: FilledKeySlot;
  disabled: boolean;
  onRevoke: () => void;
}

function FilledSlot({ slot, disabled, onRevoke }: FilledSlotProps): React.JSX.Element {
  const { key } = slot;
  const warning = keyExpiryWarning(key.expiresAt);
  const lastUsed = key.lastUsedAt ? `${relativeTime(key.lastUsedAt)}${key.lastUsedIp ? ` · ${key.lastUsedIp}` : ''}` : 'Never used';
  return (
    <>
      <div className={styles.slotHead}>
        <span className={styles.slotLabel}>{slot.label}</span>
        <StatusChip intent="success" dot>
          Active
        </StatusChip>
        <ClientOnly>{warning && <StatusChip intent="warning">{warning}</StatusChip>}</ClientOnly>
      </div>
      <div className={styles.slotName}>{key.name}</div>
      <dl className={styles.slotFacts}>
        <dt>Key</dt>
        <dd className={styles.mono}>{key.keyPrefix}…</dd>
        <dt>Expires</dt>
        <dd>{formatDate(key.expiresAt)}</dd>
        <dt>Last used</dt>
        <dd>
          <ClientOnly fallback={key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never used'}>{lastUsed}</ClientOnly>
        </dd>
      </dl>
      <div className={styles.slotFoot}>
        <span className={styles.slotCreated}>
          Created {formatDate(key.createdAt)} by {key.createdBy?.displayName ?? 'a former member'}
        </span>
        <Button variant="ghost" tone="danger" size="sm" disabled={disabled} onClick={onRevoke}>
          Revoke
        </Button>
      </div>
    </>
  );
}

function SlotSkeleton(): React.JSX.Element {
  return (
    <div className={styles.slot} aria-hidden="true">
      <div className={styles.slotHead}>
        <Skeleton width="6rem" height="1.75rem" />
      </div>
      <div className={styles.slotName}>
        <Skeleton width="55%" height="var(--sh-text-body--line-height)" />
      </div>
      <dl className={styles.slotFacts}>
        {['Key', 'Expires', 'Last used'].map(term => (
          <Fragment key={term}>
            <dt>
              <Skeleton width="3.5rem" height="var(--sh-text-body--line-height)" />
            </dt>
            <dd>
              <Skeleton width="70%" height="var(--sh-text-body--line-height)" />
            </dd>
          </Fragment>
        ))}
      </dl>
      <div className={styles.slotFoot}>
        <Skeleton width="50%" height="var(--sh-text-body--line-height)" />
        <Skeleton width="4rem" height="var(--sh-control-height-sm)" />
      </div>
    </div>
  );
}

export function KeysTab({ orgId, botId, status, keys, activeKeyCount, isLoading, error, require, onGenerate }: KeysTabProps): React.JSX.Element {
  const revoke = useRevokeBotKeyMutation(orgId);
  const [revokeTarget, setRevokeTarget] = useState<BotKeyItem | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const historyTitleId = useId();
  const inactiveKeys = keys.filter(key => key.status !== 'ACTIVE');

  const doRevoke = (): Promise<unknown> | undefined => {
    if (!revokeTarget) return undefined;
    const target = revokeTarget;
    return require(() =>
      revoke.mutateAsync(
        { botId, keyId: target.id },
        {
          onSuccess: () => toast.success('Key revoked'),
          onError: error => toast.danger(botErrorMessage(error)),
        },
      ),
    );
  };

  const slots = keySlots(keys, status);

  return (
    <div className={styles.page}>
      <div className={styles.tabHead}>
        <div className={styles.tabHeadMain}>
          <h2 className={styles.tabTitle}>API keys</h2>
          <p className={styles.tabDesc}>
            Two slots, so you can rotate without downtime: add the new key, move your service over, then revoke the old one. Every key expires within a year.
          </p>
        </div>
        <div className={styles.meter}>
          <span className={styles.pips} aria-hidden="true">
            {Array.from({ length: MAX_ACTIVE_KEYS }, (_, index) => (
              <span key={index} className={styles.pip} data-filled={index < activeKeyCount || undefined} />
            ))}
          </span>
          {formatKeyUsage(activeKeyCount)}
        </div>
      </div>

      {error && (
        <Alert intent="danger" title="Couldn’t load this bot’s keys">
          {botErrorMessage(error)}
        </Alert>
      )}

      {!error && isLoading && (
        <div className={styles.slots} role="status" aria-busy="true">
          <span className="sr-only">Loading API keys</span>
          {Array.from({ length: MAX_ACTIVE_KEYS }, (_, index) => (
            <SlotSkeleton key={index} />
          ))}
        </div>
      )}

      {!error && !isLoading && (
        <div className={styles.slots}>
          {slots.map(slot => (
            <section key={slot.label} className={styles.slot} data-empty={slot.kind === 'empty' || undefined} aria-label={slot.label}>
              {slot.kind === 'filled' ? (
                <FilledSlot
                  slot={slot}
                  disabled={revoke.isPending}
                  onRevoke={() => {
                    setRevokeTarget(slot.key);
                    setRevokeOpen(true);
                  }}
                />
              ) : (
                <>
                  <span className={styles.slotLabel}>{slot.label}</span>
                  <div className={styles.slotEmptyTitle}>{slot.title}</div>
                  <div className={styles.slotEmptyText}>{slot.text}</div>
                  {slot.canGenerate && (
                    <Button variant="primary" prefix={<KeyIcon size={14} />} onClick={onGenerate}>
                      Generate key
                    </Button>
                  )}
                </>
              )}
            </section>
          ))}
        </div>
      )}

      {inactiveKeys.length > 0 && (
        <section className={styles.history} aria-labelledby={historyTitleId}>
          <h3 id={historyTitleId} className={styles.historyTitle}>
            Revoked &amp; expired · {inactiveKeys.length}
          </h3>
          <ul className={styles.historyList}>
            {inactiveKeys.map(key => (
              <li key={key.id} className={styles.historyRow}>
                <span className={styles.historyName}>{key.name}</span>
                <span className={styles.mono}>{key.keyPrefix}…</span>
                <span className={styles.historyWhen}>
                  {key.status === 'REVOKED' ? `Revoked ${formatDate(key.revokedAt)} by ${key.revokedBy?.displayName ?? 'a former member'}` : `Expired ${formatDate(key.expiresAt)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        intent="danger"
        title={revokeTarget ? `Revoke ${revokeTarget.name}?` : 'Revoke key?'}
        description="Anything using this key stops working immediately. This cannot be undone."
        confirmLabel="Revoke key"
        onConfirm={doRevoke}
      />
    </div>
  );
}
