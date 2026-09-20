import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Alert, Button, toast } from '@shadow-library/ui';

import { INHERIT_MODEL, type ModelKind, ModelPicker, PageContainer, PageHeader, QueryState } from '@/components/nf';
import {
  type AccountModelDefaults,
  accountSettingsQueryOptions,
  aiModelsQueryOptions,
  useAccountSettingsQuery,
  useAiModelsQuery,
  useUpdateAccountSettingsMutation,
} from '@/lib/apis';
import { decodeModelRef, encodeModelRef } from '@/lib/format';
import { type AccountModelGroup, modelLabel } from '@/lib/model-defaults';

import styles from './settings.module.css';

export const Route = createFileRoute('/_app/settings')({
  head: () => ({ meta: [{ title: 'Settings · Novel Forge' }] }),
  loader: ({ context }) => Promise.all([context.queryClient.prefetchQuery(aiModelsQueryOptions()), context.queryClient.prefetchQuery(accountSettingsQueryOptions())]),
  component: SettingsScreen,
});

interface GroupRow {
  key: AccountModelGroup;
  label: string;
  hint: string;
  kind: ModelKind;
}

const SECTIONS: { title: string; rows: GroupRow[] }[] = [
  { title: 'Ideas', rows: [{ key: 'ideation', label: 'Ideation studio', hint: 'Every idea chat and its sheet', kind: 'llm' }] },
  {
    title: 'Writing a novel',
    rows: [
      { key: 'writing', label: 'Writing', hint: 'Chapter prose: drafts, revisions and repairs', kind: 'llm' },
      { key: 'planning', label: 'Planning & canon', hint: 'Premise, plan, arcs, outlines, bible and extraction', kind: 'llm' },
      { key: 'review', label: 'Review & QA', hint: 'Continuity judge, validation and editorial review', kind: 'llm' },
      { key: 'chat', label: 'Refinement chat', hint: 'Conversational proposals on a novel', kind: 'llm' },
    ],
  },
  {
    title: 'Everywhere',
    rows: [
      { key: 'helper', label: 'Fast helpers', hint: 'Idea names, chapter titles and context compaction', kind: 'llm' },
      { key: 'image', label: 'Illustrations', hint: 'Cover and scene art', kind: 'image' },
    ],
  },
];

const PRECEDENCE = [
  { label: 'Pinned on a chat', here: false },
  { label: 'Project setting', here: false },
  { label: 'Your default', here: true },
  { label: 'Platform default', here: false },
];

type Picks = Partial<Record<AccountModelGroup, string>>;

function toPicks(models: AccountModelDefaults | undefined): Picks {
  const picks: Picks = {};
  for (const row of SECTIONS.flatMap(section => section.rows)) {
    const ref = models?.[row.key];
    picks[row.key] = ref ? encodeModelRef(ref.provider, ref.model) : INHERIT_MODEL;
  }
  return picks;
}

function toModels(picks: Picks): AccountModelDefaults {
  const models: AccountModelDefaults = {};
  for (const [group, value] of Object.entries(picks) as [AccountModelGroup, string | undefined][]) {
    if (value && value !== INHERIT_MODEL) models[group] = decodeModelRef(value);
  }
  return models;
}

function SettingsScreen(): React.JSX.Element {
  const modelsQuery = useAiModelsQuery();
  const settingsQuery = useAccountSettingsQuery();
  const update = useUpdateAccountSettingsMutation();

  const saved = settingsQuery.data?.models;
  const [picks, setPicks] = useState<Picks>(() => toPicks(saved));
  const [syncedFrom, setSyncedFrom] = useState(saved);
  if (saved !== syncedFrom) {
    setSyncedFrom(saved);
    setPicks(toPicks(saved));
  }

  const savedPicks = toPicks(saved);
  const dirty = SECTIONS.some(section => section.rows.some(row => (picks[row.key] ?? INHERIT_MODEL) !== savedPicks[row.key]));
  const registry = modelsQuery.data?.models ?? [];
  const platform = new Map((modelsQuery.data?.defaults ?? []).map(entry => [entry.role, modelLabel(registry, entry.model, entry.provider)]));

  const save = (): void => update.mutate({ models: toModels(picks) }, { onSuccess: () => toast.success('Your defaults are saved'), onError: err => toast.danger(err.message) });

  return (
    <PageContainer>
      <PageHeader title="Settings" subtitle="Your defaults for every project and idea you own. A change applies to runs that start after you save." />
      <QueryState isLoading={settingsQuery.isLoading || modelsQuery.isLoading} error={settingsQuery.error ?? modelsQuery.error}>
        <div className={styles.page}>
          <div className={styles.precedence}>
            <span>Which model is used:</span>
            <ol className={styles.chain}>
              {PRECEDENCE.map(step => (
                <li key={step.label} className={styles.step} data-here={step.here || undefined}>
                  {step.label}
                </li>
              ))}
            </ol>
          </div>

          {SECTIONS.map(section => (
            <section key={section.title} className={styles.group} aria-labelledby={`models-${section.title}`}>
              <h2 id={`models-${section.title}`} className={styles.groupHead}>
                {section.title}
              </h2>
              {section.rows.map(row => {
                const pick = picks[row.key] ?? INHERIT_MODEL;
                const platformModel = platform.get(row.key);
                return (
                  <div key={row.key} className={styles.row}>
                    <div className={styles.rowInfo}>
                      <div className={styles.rowLabel}>{row.label}</div>
                      <div className={styles.rowHint}>
                        {row.hint} · {pick === INHERIT_MODEL ? `platform default${platformModel ? `, ${platformModel}` : ''}` : 'your default'}
                      </div>
                    </div>
                    <div className={styles.rowPicker}>
                      <ModelPicker
                        value={pick}
                        onChange={value => setPicks(current => ({ ...current, [row.key]: value }))}
                        kind={row.kind}
                        models={registry}
                        loading={modelsQuery.isLoading}
                        inheritLabel={platformModel ? `Platform default · ${platformModel}` : 'Platform default'}
                        aria-label={`${row.label} model`}
                      />
                    </div>
                  </div>
                );
              })}
            </section>
          ))}

          <Alert intent="info" title="Unrestricted projects">
            Unrestricted projects only take models on the unrestricted list. Where your default isn’t on it, those projects keep the platform’s unrestricted default.
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
