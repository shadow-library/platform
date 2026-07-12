/**
 * Importing npm packages
 */
import { Button, toast } from '@shadow-library/ui';
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { MonitorIcon, SmartphoneIcon } from '@/components/icons';
import { PageHeader, QueryState, StatusChip } from '@/components/si';
import { useStepUpGate } from '@/features/portal';
import { type SessionItem, useRevokeOtherSessionsMutation, useRevokeSessionMutation, useSessionsQuery } from '@/lib/apis';
import { countryFlag, deviceSummary, relativeTime } from '@/lib/format';

import styles from './sessions.module.css';

export const Route = createFileRoute('/_portal/account/sessions')({
  component: SessionsPage,
});

function isMobile(session: SessionItem): boolean {
  return /iphone|android|mobile|ipad/i.test(session.userAgent ?? '');
}

function SessionsPage(): React.JSX.Element {
  const sessions = useSessionsQuery();
  const revokeOne = useRevokeSessionMutation();
  const revokeOthers = useRevokeOtherSessionsMutation();
  const { require, dialog } = useStepUpGate();

  const list = sessions.data?.sessions ?? [];
  const others = list.filter(item => !item.isCurrent);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Sessions & devices"
        subtitle="Everywhere you’re signed in. Revoke any session you don’t recognize."
        actions={
          others.length > 0 && (
            <Button
              variant="secondary"
              loading={revokeOthers.isPending}
              onClick={() =>
                require(() =>
                  revokeOthers.mutate(undefined, { onSuccess: result => toast.success(`Signed out ${result.revoked} other session${result.revoked === 1 ? '' : 's'}`) }),
                )
              }
            >
              Sign out all others
            </Button>
          )
        }
      />

      <QueryState isLoading={sessions.isLoading} error={sessions.error} isEmpty={list.length === 0} emptyTitle="No active sessions">
        <div className={styles.list}>
          {list.map(session => (
            <div key={session.id} className={styles.row}>
              <span className={styles.icon}>{isMobile(session) ? <SmartphoneIcon size={19} /> : <MonitorIcon size={19} />}</span>
              <div className={styles.meta}>
                <div className={styles.name}>
                  {deviceSummary(session)}
                  {session.isCurrent && (
                    <StatusChip intent="success" dot>
                      This device
                    </StatusChip>
                  )}
                  {session.aal === 'AAL2' && <StatusChip intent="neutral">AAL2</StatusChip>}
                </div>
                <div className={styles.sub}>
                  {[session.ipCountry ? `${countryFlag(session.ipCountry)} ${session.ipCountry}` : null, session.ipAddress, `Last active ${relativeTime(session.lastUsedAt)}`]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              {!session.isCurrent && (
                <Button variant="ghost" size="sm" onClick={() => require(() => revokeOne.mutate(session.id, { onSuccess: () => toast.success('Session revoked') }))}>
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      </QueryState>
      {dialog}
    </div>
  );
}
