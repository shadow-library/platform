/**
 * Importing npm packages
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Select } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { organisationsQueryOptions, switchOrganisation } from '@/lib/apis';

import styles from './Layout.module.css';

/**
 * Lets an operator change the organisation this session acts in. Every permission on every request is
 * evaluated in that organisation, so switching changes what the whole console may do.
 *
 * Renders nothing unless there is a genuine choice. Pulse is an INTERNAL application reached only
 * through the platform organisation, so today that means it renders nothing at all — the surface
 * exists so a second organisation appearing needs no further frontend work, not because one exists.
 */
export default function OrgSwitcher(): ReactElement | null {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState(false);
  const { data: organisations } = useQuery(organisationsQueryOptions());

  const active = organisations?.find(organisation => organisation.active);
  if (!organisations || organisations.length < 2 || !active) return null;

  /**
   * Every cached response was fetched under the previous organisation and may not survive it, so the
   * cache is cleared outright rather than selectively invalidated — a stale list rendered against new
   * permissions is exactly the confusion this avoids. The router reload then refetches the route's
   * data under the organisation now in force.
   */
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
