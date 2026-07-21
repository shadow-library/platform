/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { Avatar } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { ExternalLinkIcon } from '@/components/icons';
import { PageHeader, QueryState, StatusChip } from '@/components/si';
import { type MyApplication, myApplicationsQueryOptions, useMyApplicationsQuery, useRootDomain } from '@/lib/apis';
import { relativeTime } from '@/lib/format';

import styles from './applications.module.css';

export const Route = createFileRoute('/_portal/applications')({
  loader: ({ context }) => context.queryClient.ensureQueryData(myApplicationsQueryOptions()),
  component: ApplicationsPage,
});

function appUrl(app: MyApplication, rootDomain: string): string {
  return `https://${app.subDomain}.${rootDomain}`;
}

function ApplicationsPage(): React.JSX.Element {
  const apps = useMyApplicationsQuery();
  const rootDomain = useRootDomain();
  const list = apps.data?.applications ?? [];

  return (
    <div className={styles.page}>
      <PageHeader title="My applications" subtitle="Every app you use across the Shadow ecosystem. Jump straight back in." />

      <QueryState
        isLoading={apps.isLoading}
        error={apps.error}
        isEmpty={list.length === 0}
        emptyTitle="No applications yet"
        emptyDescription="Apps you sign in to will appear here."
      >
        <div className={styles.grid}>
          {list.map(app => (
            <a key={app.id} href={appUrl(app, rootDomain)} target="_blank" rel="noreferrer" className={`si-cardhover ${styles.card}`}>
              <div className={styles.cardTop}>
                <Avatar name={app.displayName ?? app.name} shape="square" size="lg" />
                <ExternalLinkIcon size={16} className={styles.extIcon} />
              </div>
              <div className={styles.cardName}>{app.displayName ?? app.name}</div>
              <div className={styles.cardDomain}>
                {app.subDomain}.{rootDomain}
              </div>
              <div className={styles.cardFoot}>
                {app.isActive ? (
                  <StatusChip intent="success" dot>
                    Active
                  </StatusChip>
                ) : (
                  <StatusChip intent="neutral">Inactive</StatusChip>
                )}
                <span className={styles.cardTime}>Used {relativeTime(app.lastUsedAt)}</span>
              </div>
            </a>
          ))}
        </div>
      </QueryState>
    </div>
  );
}
