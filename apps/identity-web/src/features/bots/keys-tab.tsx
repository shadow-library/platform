import { useState } from 'react';
import { Button, ClientOnly, ConfirmDialog, Table, toast } from '@shadow-library/ui';

import { KeyIcon } from '@/components/icons';
import { StatusChip } from '@/components/si';
import { type BotKeyItem, useRevokeBotKeyMutation } from '@/lib/apis';
import { botErrorMessage } from '@/lib/bot-errors';
import { daysUntil, formatDate, relativeTime } from '@/lib/format';
import styles from './bots.module.css';

const EXPIRY_WARNING_DAYS = 7;

interface KeysTabProps {
  orgId: string;
  botId: string;
  keys: BotKeyItem[];
  isLoading: boolean;
  canGenerateKey: boolean;
  require: (action: () => void) => void;
  onGenerate: () => void;
}

export function KeysTab({ orgId, botId, keys, isLoading, canGenerateKey, require, onGenerate }: KeysTabProps): React.JSX.Element {
  const revoke = useRevokeBotKeyMutation(orgId);
  const [revokeTarget, setRevokeTarget] = useState<BotKeyItem | null>(null);

  const activeKeys = keys.filter(key => key.status === 'ACTIVE');
  const inactiveKeys = keys.filter(key => key.status !== 'ACTIVE');

  const doRevoke = (): void => {
    if (!revokeTarget) return;
    const target = revokeTarget;
    require(() =>
      revoke.mutate(
        { botId, keyId: target.id },
        {
          onSuccess: () => {
            toast.success('Key revoked');
            setRevokeTarget(null);
          },
          onError: error => toast.danger(botErrorMessage(error)),
        },
      ),
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.tabHead}>
        <div className={styles.tabHeadMain}>
          <h2 className={styles.tabTitle}>API keys</h2>
          <p className={styles.tabDesc}>A bot can have two active keys, so you can rotate without downtime. Every key expires within a year.</p>
        </div>
        <div className={styles.tabHeadActions}>
          <Button variant="primary" size="sm" prefix={<KeyIcon size={14} />} disabled={!canGenerateKey} onClick={onGenerate}>
            Generate key
          </Button>
          {!canGenerateKey && <div className={styles.tabHeadNote}>Revoke a key to add another</div>}
        </div>
      </div>

      <div className={styles.tableCard}>
        <Table
          data={activeKeys}
          rowKey="id"
          loading={isLoading}
          aria-label="Active API keys"
          emptyState={<div className={styles.tableEmpty}>No active keys yet.</div>}
          columns={[
            {
              id: 'name',
              header: 'Name',
              cell: key => (
                <div className={styles.cellMain}>
                  <div className={styles.cellName}>{key.name}</div>
                  <div className={styles.cellSub}>
                    Created {formatDate(key.createdAt)} by {key.createdBy?.displayName ?? 'a former member'}
                  </div>
                </div>
              ),
            },
            { id: 'prefix', header: 'Key', cell: key => <span className={styles.mono}>{key.keyPrefix}…</span> },
            {
              id: 'expires',
              header: 'Expires',
              cell: key => {
                const remaining = daysUntil(key.expiresAt);
                return (
                  <div className={styles.stackCell}>
                    <span className={styles.cellName}>{formatDate(key.expiresAt)}</span>
                    <ClientOnly>
                      {remaining <= EXPIRY_WARNING_DAYS && (
                        <StatusChip intent="warning">
                          in {remaining} day{remaining === 1 ? '' : 's'}
                        </StatusChip>
                      )}
                    </ClientOnly>
                  </div>
                );
              },
            },
            {
              id: 'lastUsed',
              header: 'Last used',
              cell: key => (
                <ClientOnly fallback={<span className={styles.muted}>{key.lastUsedAt ? formatDate(key.lastUsedAt) : 'never'}</span>}>
                  <span className={styles.muted}>{key.lastUsedAt ? `${relativeTime(key.lastUsedAt)}${key.lastUsedIp ? ` · ${key.lastUsedIp}` : ''}` : 'never'}</span>
                </ClientOnly>
              ),
            },
            {
              id: 'actions',
              header: '',
              align: 'end',
              cell: key => (
                <Button variant="ghost" size="sm" onClick={() => setRevokeTarget(key)}>
                  Revoke
                </Button>
              ),
            },
          ]}
        />
      </div>

      {inactiveKeys.length > 0 && (
        <div className={styles.revokedSection}>
          <div className={styles.revokedTitle}>Revoked &amp; expired</div>
          <div className={styles.rowList}>
            {inactiveKeys.map(key => (
              <div key={key.id} className={styles.listRow}>
                <div className={styles.listMain}>
                  <div className={styles.listName}>
                    {key.name} <span className={styles.listSubMono}>{key.keyPrefix}…</span>
                  </div>
                  <div className={styles.listSub}>
                    {key.status === 'REVOKED'
                      ? `Revoked ${formatDate(key.revokedAt)} by ${key.revokedBy?.displayName ?? 'a former member'}`
                      : `Expired ${formatDate(key.expiresAt)}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={open => !open && setRevokeTarget(null)}
        intent="danger"
        title={revokeTarget ? `Revoke ${revokeTarget.name}?` : 'Revoke key?'}
        description="Anything using this key stops working immediately. This cannot be undone."
        confirmLabel="Revoke key"
        loading={revoke.isPending}
        onConfirm={doRevoke}
      />
    </div>
  );
}
