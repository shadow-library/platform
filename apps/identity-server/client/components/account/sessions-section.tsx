/**
 * Importing npm packages
 */
import { Badge, Button, Card, ConfirmDialog } from '@shadow-library/ui';
import { type ReactElement, useCallback, useEffect, useState } from 'react';

/**
 * Importing user defined packages
 */
import { useStepUp } from './step-up';
import { type SessionItem, api } from '../../lib/api';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const formatWhen = (iso: string): string => new Date(iso).toLocaleString();

export function SessionsSection(): ReactElement {
  const { withStepUp } = useStepUp();
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setSessions(await api.sessions().catch(() => []));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const revokeOne = async (session: SessionItem): Promise<void> => {
    setNotice(null);
    await withStepUp(() => api.revokeSession(session.id)).catch(() => setNotice('The session could not be signed out.'));
    await refresh();
  };

  const revokeOthers = async (): Promise<void> => {
    setNotice(null);
    setConfirmAll(false);
    const revoked = await withStepUp(() => api.revokeOtherSessions()).catch(() => null);
    if (revoked !== null) setNotice(revoked === 0 ? 'No other sessions were active.' : `Signed out ${revoked} other ${revoked === 1 ? 'session' : 'sessions'}.`);
    await refresh();
  };

  return (
    <Card>
      <Card.Header
        title="Active sessions"
        action={
          <Button variant="secondary" size="sm" onClick={() => setConfirmAll(true)}>
            Sign out everywhere else
          </Button>
        }
      />
      <Card.Body>
        <div className="stack gap-16">
          {notice ? <p className="text-secondary">{notice}</p> : null}
          {sessions === null ? (
            <p className="text-secondary">Loading…</p>
          ) : (
            <ul className="stack gap-12">
              {sessions.map(session => (
                <li key={session.id} className="flex items-center justify-between gap-16">
                  <div className="stack gap-4">
                    <span className="cluster gap-8">
                      <span>{session.deviceName ?? session.userAgent ?? 'Unknown device'}</span>
                      {session.isCurrent ? <Badge intent="success">This device</Badge> : null}
                      <Badge variant="outline">{session.aal}</Badge>
                    </span>
                    <span className="text-tertiary text-body-sm">
                      {session.ipAddress ?? 'Unknown network'} · last seen {formatWhen(session.lastUsedAt)}
                    </span>
                  </div>
                  {!session.isCurrent ? (
                    <Button variant="ghost" size="sm" onClick={() => void revokeOne(session)}>
                      Sign out
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card.Body>

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        intent="danger"
        title="Sign out everywhere else?"
        description="Every session except this one ends immediately, including apps that stay signed in through this account."
        confirmLabel="Sign out others"
        onConfirm={() => void revokeOthers()}
      />
    </Card>
  );
}
