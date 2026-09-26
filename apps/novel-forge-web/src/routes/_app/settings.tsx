import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Alert, Button, SegmentedControl, toast } from '@shadow-library/ui';

import { PageContainer, PageHeader, QueryState } from '@/components/nf';
import { accountSettingsQueryOptions, type CostTier, useAccountSettingsQuery, useUpdateAccountSettingsMutation } from '@/lib/apis';
import { tierLabel } from '@/lib/usage';

import styles from './settings.module.css';

export const Route = createFileRoute('/_app/settings')({
  head: () => ({ meta: [{ title: 'Settings · Novel Forge' }] }),
  loader: ({ context }) => context.queryClient.prefetchQuery(accountSettingsQueryOptions()),
  component: SettingsScreen,
});

const COST_TIERS: readonly CostTier[] = ['economy', 'balanced', 'performant'];

function isCostTier(value: string): value is CostTier {
  return (COST_TIERS as readonly string[]).includes(value);
}

function SettingsScreen(): React.JSX.Element {
  const settingsQuery = useAccountSettingsQuery();
  const update = useUpdateAccountSettingsMutation();

  const saved = settingsQuery.data?.defaultCostTier ?? 'balanced';
  const [costTier, setCostTier] = useState<CostTier>(saved);
  const [syncedFrom, setSyncedFrom] = useState(saved);
  if (saved !== syncedFrom) {
    setSyncedFrom(saved);
    setCostTier(saved);
  }

  const dirty = costTier !== saved;
  const save = (): void =>
    update.mutate({ defaultCostTier: costTier }, { onSuccess: () => toast.success('Your default cost tier is saved'), onError: err => toast.danger(err.message) });

  return (
    <PageContainer>
      <PageHeader title="Settings" subtitle="Your defaults for new projects. A project you already have keeps its own settings." />
      <QueryState isLoading={settingsQuery.isLoading} error={settingsQuery.error}>
        <div className={styles.page}>
          <section className={styles.group} aria-labelledby="new-projects">
            <h2 id="new-projects" className={styles.groupHead}>
              New projects
            </h2>
            <div className={styles.row}>
              <div className={styles.rowInfo}>
                <div className={styles.rowLabel}>Default cost tier for new projects</div>
                <div className={styles.rowHint}>How much quality you buy per call. A new project starts on it, and you can change it in the project’s settings.</div>
              </div>
              <SegmentedControl size="sm" aria-label="Default cost tier for new projects" value={costTier} onValueChange={value => isCostTier(value) && setCostTier(value)}>
                {COST_TIERS.map(tier => (
                  <SegmentedControl.Item key={tier} value={tier}>
                    {tierLabel(tier)}
                  </SegmentedControl.Item>
                ))}
              </SegmentedControl>
            </div>
          </section>

          <Alert intent="info" title="How models are picked">
            Each project runs on its cost tier; a project can pin a model per role in its settings, a chat can pin a tier or a model, and a single reply can override it. A chat’s
            pinned model outranks the project’s pin. Unrestricted projects use the platform’s unrestricted models for their tier, and any pinned model that the unrestricted list
            allows.
          </Alert>

          <div className={styles.saveRow}>
            <span className={styles.dirty}>{dirty ? 'Unsaved changes' : 'No unsaved changes'}</span>
            <Button variant="primary" loading={update.isPending} disabled={!dirty} onClick={save}>
              Save changes
            </Button>
          </div>
        </div>
      </QueryState>
    </PageContainer>
  );
}
