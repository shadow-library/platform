/**
 * Importing npm packages
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Avatar, Button, ConfirmDialog, DescriptionList, Dialog, FormField, Input, Spinner, Timeline, type TimelineStatus, toast } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { ArrowLeftIcon } from '@/components/icons';
import { useStepUpGate } from '@/features/portal';
import {
  adminUserAuditQueryOptions,
  adminUserQueryOptions,
  useBlockUserMutation,
  useDeactivateUserMutation,
  useDeleteUserMutation,
  useForcePasswordResetMutation,
  useLockUserMutation,
  useReactivateUserMutation,
  useSuspendUserMutation,
  useTerminateUserSessionsMutation,
  useUnlockUserMutation,
  useUserAuditQuery,
  useUserQuery,
} from '@/lib/apis';
import { formatDate, relativeTime } from '@/lib/format';

import styles from './console.module.css';
import { userStatusChip } from './users.index';

export const Route = createFileRoute('/console/users/$userId')({
  loader: ({ context, params }) =>
    Promise.all([context.queryClient.ensureQueryData(adminUserQueryOptions(params.userId)), context.queryClient.ensureQueryData(adminUserAuditQueryOptions(params.userId))]),
  component: UserDetailPage,
});

type HoldKind = 'SUSPENDED' | 'BLOCKED';

/** The two holds differ in intent rather than mechanics, so the dialog has to say which one the administrator is choosing. */
const HOLD_COPY: Record<HoldKind, string> = {
  SUSPENDED: 'A temporary hold. Sessions and tokens are revoked immediately, and the account is expected to come back — set a lift date, or restore it manually.',
  BLOCKED: 'A punitive, indefinite bar for policy or security violations. Sessions and tokens are revoked immediately and only an administrator can lift it.',
};

function auditStatus(outcome: string): TimelineStatus {
  const value = outcome.toUpperCase();
  if (value.includes('SUCCESS') || value === 'OK') return 'success';
  if (value.includes('FAIL') || value.includes('DENY') || value.includes('DENIED') || value.includes('ERROR')) return 'danger';
  return 'default';
}

function UserDetailPage(): React.JSX.Element {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const user = useUserQuery(userId);
  const audit = useUserAuditQuery(userId);
  const { require, dialog } = useStepUpGate();

  const lock = useLockUserMutation();
  const unlock = useUnlockUserMutation();
  const resetPassword = useForcePasswordResetMutation();
  const terminate = useTerminateUserSessionsMutation();
  const deactivate = useDeactivateUserMutation();
  const reactivate = useReactivateUserMutation();
  const suspend = useSuspendUserMutation();
  const block = useBlockUserMutation();
  const del = useDeleteUserMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hold, setHold] = useState<HoldKind | null>(null);
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState('');

  const data = user.data;
  const toastDone = (message: string) => ({ onSuccess: () => toast.success(message), onError: (error: { message: string }) => toast.danger(error.message) });

  const openHold = (kind: HoldKind): void => {
    setReason('');
    setUntil('');
    setHold(kind);
  };

  const applyHold = (): void => {
    if (!hold) return;
    const done = {
      onSuccess: () => {
        toast.success(hold === 'SUSPENDED' ? 'Account suspended' : 'Account blocked');
        setHold(null);
      },
      onError: (error: { message: string }) => toast.danger(error.message),
    };
    const input = { userId, reason: reason.trim() || undefined };
    require(() => (hold === 'SUSPENDED' ? suspend.mutate({ ...input, until: until ? new Date(until).toISOString() : undefined }, done) : block.mutate(input, done)));
  };

  if (user.isLoading || !data)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
        <Spinner size="lg" label="Loading user" />
      </div>
    );

  const isLocked = data.lockMode !== 'NONE';
  const isActive = data.status === 'ACTIVE';
  const label = data.username ?? data.emails.find(email => email.isPrimary)?.value ?? `User ${data.id}`;
  const mfa =
    [data.mfa.totp ? 'TOTP' : null, data.mfa.passkeyCount ? `${data.mfa.passkeyCount} passkey${data.mfa.passkeyCount === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') ||
    'None';

  return (
    <div className={styles.page} style={{ maxWidth: 920 }}>
      <button className={styles.backLink} onClick={() => navigate({ to: '/console/users' })}>
        <ArrowLeftIcon size={15} />
        Back to users
      </button>

      <div className={styles.detailHead}>
        <Avatar name={label} size="xl" />
        <div>
          <div className={styles.detailName}>
            {label}
            {userStatusChip(data)}
          </div>
          <div className={styles.detailSub}>
            {data.emails.find(email => email.isPrimary)?.value} · {data.id}
          </div>
        </div>
      </div>

      <div className={styles.actionBar}>
        {isLocked ? (
          <Button variant="secondary" size="sm" onClick={() => require(() => unlock.mutate({ userId }, toastDone('Account unlocked')))}>
            Unlock account
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => require(() => lock.mutate({ userId, mode: 'FULL' }, toastDone('Account locked')))}>
            Lock account
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => require(() => resetPassword.mutate({ userId }, toastDone('Password reset forced')))}>
          Force password reset
        </Button>
        <Button variant="secondary" size="sm" onClick={() => require(() => terminate.mutate({ userId }, toastDone('Sessions terminated')))}>
          Terminate sessions
        </Button>
        {isActive ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => openHold('SUSPENDED')}>
              Suspend…
            </Button>
            <Button variant="secondary" size="sm" onClick={() => openHold('BLOCKED')}>
              Block…
            </Button>
            <Button variant="secondary" size="sm" onClick={() => require(() => deactivate.mutate({ userId }, toastDone('Account deactivated')))}>
              Deactivate
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => require(() => reactivate.mutate({ userId }, toastDone('Account reactivated')))}>
            Reactivate
          </Button>
        )}
        <div className={styles.spacer} />
        <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
          Delete user…
        </Button>
      </div>

      <div className={styles.detailGrid}>
        <div className={styles.detailCard}>
          <DescriptionList layout="row" termWidth={130} title="Account">
            <DescriptionList.Item term="User ID" mono copyable>
              {data.id}
            </DescriptionList.Item>
            <DescriptionList.Item term="Status">{userStatusChip(data)}</DescriptionList.Item>
            {data.statusReason && <DescriptionList.Item term="Reason">{data.statusReason}</DescriptionList.Item>}
            {data.statusUntil && <DescriptionList.Item term="Lifts on">{formatDate(data.statusUntil)}</DescriptionList.Item>}
            <DescriptionList.Item term="Email">{data.emails.find(email => email.isPrimary)?.value ?? '—'}</DescriptionList.Item>
            <DescriptionList.Item term="MFA">{mfa}</DescriptionList.Item>
            <DescriptionList.Item term="Active sessions">{data.activeSessionCount}</DescriptionList.Item>
            <DescriptionList.Item term="Password reset">{data.passwordResetRequired ? 'Required' : 'No'}</DescriptionList.Item>
            <DescriptionList.Item term="Created">{relativeTime(data.createdAt)}</DescriptionList.Item>
          </DescriptionList>
        </div>
        <div className={styles.detailCard}>
          <div className={styles.detailCardTitle}>Recent activity</div>
          {audit.isLoading ? (
            <Spinner size="sm" />
          ) : (audit.data?.events.length ?? 0) === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--sh-text-tertiary)' }}>No recent audit events.</div>
          ) : (
            <Timeline>
              {audit.data?.events.slice(0, 10).map(event => (
                <Timeline.Item key={event.id} status={auditStatus(event.outcome)} title={event.action} timestamp={relativeTime(event.occurredAt)}>
                  {event.ipAddress}
                </Timeline.Item>
              ))}
            </Timeline>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        intent="danger"
        title={`Delete ${label}?`}
        description="Right-to-erasure scrubs the account's PII and credentials and closes it. The audit skeleton is retained. This cannot be undone."
        confirmLabel="Delete user"
        typedConfirmation={data.emails.find(email => email.isPrimary)?.value}
        loading={del.isPending}
        onConfirm={() =>
          require(() =>
            del.mutate(
              { userId },
              {
                onSuccess: () => {
                  toast.success('User deleted');
                  setConfirmDelete(false);
                  navigate({ to: '/console/users' });
                },
                onError: error => toast.danger(error.message),
              },
            ),
          )
        }
      />
      <Dialog open={hold !== null} onOpenChange={open => !open && setHold(null)}>
        <Dialog.Content size="md">
          <Dialog.Header title={hold === 'BLOCKED' ? `Block ${label}?` : `Suspend ${label}?`} description={hold === 'BLOCKED' ? HOLD_COPY.BLOCKED : HOLD_COPY.SUSPENDED} />
          <Dialog.Body>
            <FormField label="Reason" helper="Shown to administrators and written to the audit trail.">
              <Input value={reason} onValueChange={setReason} placeholder={hold === 'BLOCKED' ? 'Policy violation' : 'Payment overdue'} maxLength={256} autoFocus />
            </FormField>
            {hold === 'SUSPENDED' && (
              <FormField label="Lift automatically on" helper="Leave empty to suspend until an administrator restores the account.">
                <Input type="datetime-local" value={until} onValueChange={setUntil} />
              </FormField>
            )}
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="danger" loading={suspend.isPending || block.isPending} onClick={applyHold}>
              {hold === 'BLOCKED' ? 'Block account' : 'Suspend account'}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
      {dialog}
    </div>
  );
}
