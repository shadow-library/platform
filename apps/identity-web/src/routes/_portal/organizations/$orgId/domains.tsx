/**
 * Importing npm packages
 */
import { Button, DescriptionList, Input, toast } from '@shadow-library/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

/**
 * Importing user defined modules
 */
import { PlusIcon } from '@/components/icons';
import { QueryState, StatusChip } from '@/components/si';
import { useStepUpGate } from '@/features/portal';
import { type DomainStatus, useDomainsQuery, useRegisterDomainMutation, useRemoveDomainMutation, useVerifyDomainMutation } from '@/lib/apis';
import { formatDate } from '@/lib/format';

import styles from './domains.module.css';

export const Route = createFileRoute('/_portal/organizations/$orgId/domains')({
  component: DomainsPage,
});

const STATUS_CHIP: Record<DomainStatus, 'success' | 'warning' | 'danger'> = { VERIFIED: 'success', PENDING: 'warning', FAILED: 'danger' };

function DomainsPage(): React.JSX.Element {
  const { orgId } = Route.useParams();
  const domains = useDomainsQuery(orgId);
  const register = useRegisterDomainMutation(orgId);
  const verify = useVerifyDomainMutation(orgId);
  const remove = useRemoveDomainMutation(orgId);
  const { require, dialog } = useStepUpGate();

  const [value, setValue] = useState('');
  const list = domains.data?.domains ?? [];

  const add = (): void => {
    if (!value.trim()) return;
    require(() =>
      register.mutate(value.trim(), {
        onSuccess: () => {
          toast.success('Domain added — add the TXT record to verify');
          setValue('');
        },
        onError: error => toast.danger(error.message),
      }),
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.addRow}>
        <Input placeholder="example.com" value={value} onValueChange={setValue} onKeyDown={event => event.key === 'Enter' && add()} />
        <Button variant="secondary" prefix={<PlusIcon size={15} />} loading={register.isPending} onClick={add}>
          Add domain
        </Button>
      </div>

      <QueryState
        isLoading={domains.isLoading}
        error={domains.error}
        isEmpty={list.length === 0}
        emptyTitle="No domains yet"
        emptyDescription="Add a domain to enable SSO and SCIM for your members."
      >
        <div className={styles.list}>
          {list.map(domain => (
            <div key={domain.id} className={styles.card}>
              <div className={styles.cardHead}>
                <div className={styles.domainName}>
                  {domain.domain}
                  <StatusChip intent={STATUS_CHIP[domain.status]} dot>
                    {domain.status[0] + domain.status.slice(1).toLowerCase()}
                  </StatusChip>
                </div>
                <div className={styles.cardActions}>
                  {domain.status !== 'VERIFIED' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={verify.isPending}
                      onClick={() =>
                        require(() =>
                          verify.mutate(domain.id, {
                            onSuccess: result =>
                              toast[result.status === 'VERIFIED' ? 'success' : 'danger'](result.status === 'VERIFIED' ? 'Domain verified' : 'TXT record not found yet'),
                          }),
                        )
                      }
                    >
                      Verify
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => require(() => remove.mutate(domain.id, { onSuccess: () => toast.success('Domain removed') }))}>
                    Remove
                  </Button>
                </div>
              </div>

              {domain.status === 'VERIFIED' ? (
                <div className={styles.verifiedNote}>Verified {domain.verifiedAt ? formatDate(domain.verifiedAt) : ''}. This domain can be used for SSO and SCIM provisioning.</div>
              ) : (
                <div className={styles.dns}>
                  <div className={styles.dnsHint}>Add this TXT record at your DNS provider, then click Verify:</div>
                  <DescriptionList layout="row" termWidth={70}>
                    <DescriptionList.Item term="Type">TXT</DescriptionList.Item>
                    <DescriptionList.Item term="Name" mono copyable>
                      {domain.txtRecordName}
                    </DescriptionList.Item>
                    <DescriptionList.Item term="Value" mono copyable>
                      {domain.txtRecordValue}
                    </DescriptionList.Item>
                  </DescriptionList>
                  {domain.lastCheckError && <div className={styles.dnsError}>Last check: {domain.lastCheckError}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </QueryState>
      {dialog}
    </div>
  );
}
