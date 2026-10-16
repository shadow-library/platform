import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Select } from '@shadow-library/ui';

import { organisationsQueryOptions, switchOrganisation } from '@/lib';

import styles from './Layout.module.css';

export function OrgSwitcher(): ReactElement | null {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState(false);
  const { data: organisations } = useQuery(organisationsQueryOptions());

  const active = organisations?.find(organisation => organisation.active);
  if (!organisations || organisations.length < 2 || !active) return null;

  /** Every cached response, the permissions included, was answered for the previous organisation. */
  const handleChange = async (organisationId: string): Promise<void> => {
    if (organisationId === active.id) return;
    setSwitching(true);
    try {
      await switchOrganisation(organisationId);
      queryClient.clear();
      await router.invalidate();
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className={styles.orgSwitcher}>
      <Select
        value={active.id}
        onValueChange={organisationId => void handleChange(organisationId)}
        disabled={switching}
        loading={switching}
        size="sm"
        aria-label="Active organisation"
      >
        {organisations.map(organisation => (
          <Select.Item key={organisation.id} value={organisation.id}>
            {organisation.name}
          </Select.Item>
        ))}
      </Select>
    </div>
  );
}
