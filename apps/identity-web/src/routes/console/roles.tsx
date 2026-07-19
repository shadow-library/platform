/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Select, Spinner } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { ShieldCheckIcon } from '@/components/icons';
import { PageHeader } from '@/components/si';
import { adminApplicationsQueryOptions, useApplicationQuery, useApplicationsQuery, usePermissionsQuery } from '@/lib/apis';

import styles from './console.module.css';

export const Route = createFileRoute('/console/roles')({
  // The application list feeds the picker; permissions load once an application is chosen (client state).
  loader: ({ context }) => context.queryClient.ensureQueryData(adminApplicationsQueryOptions()),
  component: RolesPage,
});

function RolesPage(): React.JSX.Element {
  const apps = useApplicationsQuery();
  const [appId, setAppId] = useState('');
  const firstAppId = apps.data?.items[0]?.id;
  // Default to the first application until the operator picks another — derived, so no effect is needed.
  const effectiveAppId = appId || (firstAppId === undefined ? '' : String(firstAppId));

  const app = useApplicationQuery(effectiveAppId, Boolean(effectiveAppId));
  const permissions = usePermissionsQuery(Number(effectiveAppId), Boolean(effectiveAppId));

  const roles = app.data?.roles ?? [];
  const perms = permissions.data?.items ?? [];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Roles & permissions"
        subtitle="Roles and permissions are defined by each application and synced through the platform catalog; assign them to principals from the role assignments view."
      />

      <div className={styles.toolbar}>
        <Select placeholder="Select an application" value={effectiveAppId} onValueChange={setAppId}>
          {(apps.data?.items ?? []).map(item => (
            <Select.Item key={item.id} value={String(item.id)}>
              {item.displayName ?? item.name}
            </Select.Item>
          ))}
        </Select>
      </div>

      {!effectiveAppId ? (
        <div style={{ color: 'var(--sh-text-tertiary)', fontSize: 13 }}>Choose an application to view its roles and permissions.</div>
      ) : app.isLoading ? (
        <Spinner size="lg" />
      ) : (
        <div className={styles.twoCol}>
          <section className={styles.detailCard}>
            <div className={styles.sectionHead}>
              <div className={styles.detailCardTitle}>Roles</div>
            </div>
            {roles.length === 0 ? (
              <div className={styles.empty}>This application has not published any roles.</div>
            ) : (
              roles.map(role => (
                <div key={role.id} className={styles.accessRow}>
                  <div className={styles.accessMain}>
                    <div className={styles.accessName}>
                      <ShieldCheckIcon size={15} />
                      {role.roleName}
                    </div>
                    {role.description && <div className={styles.accessSub}>{role.description}</div>}
                  </div>
                </div>
              ))
            )}
          </section>

          <section className={styles.detailCard}>
            <div className={styles.sectionHead}>
              <div className={styles.detailCardTitle}>Permissions</div>
            </div>
            {perms.length === 0 ? (
              <div className={styles.empty}>This application has not published any permissions.</div>
            ) : (
              perms.map(permission => (
                <div key={permission.id} className={styles.accessRow}>
                  <div className={styles.accessMain}>
                    <div className={styles.accessName}>{permission.name}</div>
                    {permission.description && <div className={styles.accessSub}>{permission.description}</div>}
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </div>
  );
}
