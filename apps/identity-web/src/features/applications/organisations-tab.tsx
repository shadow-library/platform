import { useState } from 'react';
import { Button, EmptyState, Input, Table, toast } from '@shadow-library/ui';

import { type ChipIntent, StatusChip } from '@/components/si';
import { type ApplicationOrganisationItem, useApplicationOrganisationsQuery, useReleaseApplicationMutation, useRevokeApplicationReleaseMutation } from '@/lib/apis';
import { formatDate } from '@/lib/format';
import { type Require } from './application-detail.types';
import styles from '@/features/console/console.module.css';

const RELEASE_SOURCE: Record<ApplicationOrganisationItem['source'], { label: string; intent: ChipIntent }> = {
  PLATFORM_RELEASE: { label: 'Released', intent: 'info' },
  ORG_ASSIGNMENT: { label: 'Org-assigned', intent: 'neutral' },
};

/** A PLATFORM_RELEASE row is controlled by the platform admin; an ORG_ASSIGNMENT row is the organisation's own downstream choice, shown read-only. */
export function OrganisationsTab(props: { appId: string; require: Require }): React.JSX.Element {
  const { appId, require } = props;
  const orgs = useApplicationOrganisationsQuery(appId);
  const release = useReleaseApplicationMutation();
  const revoke = useRevokeApplicationReleaseMutation();
  const [orgIdInput, setOrgIdInput] = useState('');

  const rows = orgs.data?.items ?? [];

  const doRelease = (): void => {
    const organisationId = orgIdInput.trim();
    if (!organisationId) {
      toast.danger('Enter an organization ID to release to.');
      return;
    }
    require(() =>
      release.mutate(
        { appId, organisationId },
        {
          onSuccess: () => {
            toast.success('Application released to organization');
            setOrgIdInput('');
          },
          onError: error => toast.danger(error.message),
        },
      ),
    );
  };

  const doRevoke = (organisationId: string): void =>
    require(() => revoke.mutate({ appId, organisationId }, { onSuccess: () => toast.success('Release revoked'), onError: error => toast.danger(error.message) }));

  return (
    <div className={styles.page}>
      <div className={styles.tabHead}>
        <div className={styles.tabHeadMain}>
          <h2 className={styles.tabTitle}>Organizations</h2>
          <p className={styles.tabDesc}>
            This application is restricted: only the organizations you release it to may use it. Each organization then chooses which of its members get it.
          </p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Input size="sm" placeholder="Organization ID to release…" aria-label="Organization ID to release" value={orgIdInput} onValueChange={setOrgIdInput} />
        </div>
        <Button variant="primary" size="sm" loading={release.isPending} onClick={doRelease}>
          Release
        </Button>
      </div>

      <div className={styles.tableCard}>
        <Table
          data={rows}
          rowKey="organisationId"
          loading={orgs.isLoading}
          aria-label="Organizations"
          emptyState={<EmptyState size="inline" title="No organizations yet" description="Release this application to an organization to let its members use it." />}
          columns={[
            {
              id: 'org',
              header: 'Organization',
              cell: item => (
                <div className={styles.cellMain}>
                  <div className={styles.cellName}>{item.name}</div>
                  <div className={styles.cellSub}>{item.slug}</div>
                </div>
              ),
            },
            { id: 'source', header: 'Source', cell: item => <StatusChip intent={RELEASE_SOURCE[item.source].intent}>{RELEASE_SOURCE[item.source].label}</StatusChip> },
            { id: 'assignedAt', header: 'Since', cell: item => <span className={styles.muted}>{formatDate(item.assignedAt)}</span> },
            {
              id: 'actions',
              header: '',
              align: 'end',
              cell: item =>
                item.source === 'PLATFORM_RELEASE' ? (
                  <Button variant="ghost" size="sm" onClick={() => doRevoke(item.organisationId)}>
                    Revoke
                  </Button>
                ) : null,
            },
          ]}
        />
      </div>
    </div>
  );
}
