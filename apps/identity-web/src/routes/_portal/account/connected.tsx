/**
 * Importing npm packages
 */
import { Avatar, Button, Tag, toast } from '@shadow-library/ui';
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { PageHeader, QueryState, StatusChip } from '@/components/si';
import { type ConsentRecord, consentsQueryOptions, useMyConsentsQuery, useRevokeConsentMutation } from '@/lib/apis';
import { relativeTime } from '@/lib/format';

import styles from './connected.module.css';

export const Route = createFileRoute('/_portal/account/connected')({
  loader: ({ context }) => context.queryClient.ensureQueryData(consentsQueryOptions()),
  component: ConnectedPage,
});

/** First-party apps are auto-granted; admin grants are provisioned for you — both are worth labelling. */
const SOURCE_LABEL: Record<ConsentRecord['source'], string | null> = {
  USER: null,
  FIRST_PARTY_POLICY: 'Shadow app',
  ADMIN: 'Granted by admin',
};

function ConnectedPage(): React.JSX.Element {
  const consents = useMyConsentsQuery();
  const revoke = useRevokeConsentMutation();
  const list = consents.data?.items ?? [];

  const onRevoke = (record: ConsentRecord): void =>
    revoke.mutate(record.clientId, {
      onSuccess: () => toast.success(`Revoked access for ${record.clientName}`),
      onError: error => toast.danger(error.message),
    });

  return (
    <div className={styles.page}>
      <PageHeader title="Connected apps" subtitle="Apps and services you’ve allowed to access your Shadow account." />

      <QueryState
        isLoading={consents.isLoading}
        error={consents.error}
        isEmpty={list.length === 0}
        emptyTitle="No connected apps"
        emptyDescription="Apps you authorize will appear here."
      >
        <div className={styles.list}>
          {list.map(record => {
            const sourceLabel = SOURCE_LABEL[record.source];
            return (
              <div key={record.clientId} className={styles.row}>
                <Avatar name={record.clientName} shape="square" size="md" />
                <div className={styles.meta}>
                  <div className={styles.name}>
                    {record.clientName}
                    {sourceLabel && <StatusChip intent="neutral">{sourceLabel}</StatusChip>}
                  </div>
                  <div className={styles.sub}>Granted {relativeTime(record.grantedAt)}</div>
                  {record.scopeNames.length > 0 && (
                    <div className={styles.scopes}>
                      {record.scopeNames.map(scope => (
                        <Tag key={scope} size="sm">
                          {scope}
                        </Tag>
                      ))}
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="sm" loading={revoke.isPending && revoke.variables === record.clientId} onClick={() => onRevoke(record)}>
                  Revoke
                </Button>
              </div>
            );
          })}
        </div>
      </QueryState>

      <p className={styles.note}>Revoking access signs the app out of your account. Shadow’s own apps may reconnect automatically the next time you use them.</p>
    </div>
  );
}
