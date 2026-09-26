import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Accordion, Alert, Button, Dialog, FormField, Input, SegmentedControl, Spinner, Tabs, Textarea, toast } from '@shadow-library/ui';

import { INHERIT_MODEL, type ModelKind, ModelPicker, PageContainer, PageHeader, QueryState, SectionCard } from '@/components/nf';
import { PluginsTab } from '@/features/plugins/PluginsTab';
import {
  aiModelsQueryOptions,
  type ContentMode,
  type CostTier,
  type ProjectModelOverrides,
  type ProjectModelRoute,
  type ProjectWordTarget,
  useAccountSettingsQuery,
  useAiModelsQuery,
  useDeleteProjectMutation,
  useListPluginsQuery,
  useProjectModelsQuery,
  useProjectQuery,
  useUpdateProjectMutation,
} from '@/lib/apis';
import { decodeModelRef, encodeModelRef, projectTitle } from '@/lib/format';
import { inheritedModel, modelLabel, modelSaveBody } from '@/lib/model-defaults';
import { contentModeLabel, groupLabel, tierLabel } from '@/lib/usage';

import styles from './settings.module.css';

type SettingsTab = 'general' | 'models' | 'plugins' | 'danger';

interface SettingsSearch {
  tab?: SettingsTab;
}

const SETTINGS_TABS: readonly SettingsTab[] = ['general', 'models', 'plugins', 'danger'];

function isSettingsTab(value: unknown): value is SettingsTab {
  return typeof value === 'string' && (SETTINGS_TABS as readonly string[]).includes(value);
}

export const Route = createFileRoute('/novels/$novelId/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({ tab: isSettingsTab(search.tab) ? search.tab : undefined }),
  loader: ({ context }) => context.queryClient.prefetchQuery(aiModelsQueryOptions()),
  component: SettingsScreen,
});

type AiRole = keyof ProjectModelOverrides;

// The author picks a model per *group*, not per fine-grained role. Selecting a group's model fans that
// choice out across every role it owns (GROUP_ROLES) so the backend — which still resolves per role —
// routes them identically. `embedding` is intentionally absent: it's locked to the pgvector schema.
type ModelGroup = 'writing' | 'planning' | 'review' | 'chat' | 'helper' | 'image';

const GROUP_ROLES: Record<ModelGroup, AiRole[]> = {
  writing: ['generation', 'revision', 'fix'],
  planning: ['premise', 'plan', 'outline', 'bible', 'extraction'],
  review: ['judge', 'validation', 'continuity', 'review', 'audit'],
  chat: ['chat'],
  helper: ['title', 'compact'],
  image: ['image'],
};

interface RoleDef {
  key: ModelGroup;
  label: string;
  hint: string;
  kind: ModelKind;
}

interface RoleGroup {
  title: string;
  roles: RoleDef[];
}

const ROLE_GROUPS: RoleGroup[] = [
  {
    title: 'Text generation',
    roles: [
      { key: 'writing', label: 'Writing', hint: 'Chapter prose — drafts, revisions, and repairs', kind: 'llm' },
      { key: 'planning', label: 'Planning & canon', hint: 'Premise, plan, outlines, bible & extraction', kind: 'llm' },
      { key: 'review', label: 'Review & QA', hint: 'Continuity judge, validation, editorial review & bible audit', kind: 'llm' },
      { key: 'chat', label: 'Refinement chat', hint: 'Conversational proposals · defaults to the Planning model', kind: 'llm' },
      { key: 'helper', label: 'Fast helpers', hint: 'Titles & context compaction — small, cheap calls', kind: 'llm' },
    ],
  },
  {
    title: 'Media',
    roles: [{ key: 'image', label: 'Illustrations', hint: 'Cover & scene art', kind: 'image' }],
  },
];

const ALL_ROLES = ROLE_GROUPS.flatMap(g => g.roles);

// Mirrors the server's application default (`WORD_TARGET_MIN`/`MAX` in `deterministic-metrics.ts`) —
// shown as the field placeholder so an unset project visibly states what it inherits.
const DEFAULT_WORD_TARGET_MIN = 1800;
const DEFAULT_WORD_TARGET_MAX = 2600;

// Mirrors the server's `WORD_TARGET_FLOOR`/`WORD_TARGET_CEILING` in project.dto.ts — client-side
// validation is a UX convenience, not a substitute for the server's own check, but it should reject
// the same values rather than round-trip a 422 for something the field could have refused outright.
const WORD_TARGET_FLOOR = 500;
const WORD_TARGET_CEILING = 6000;

type WordTargetInput = { value: ProjectWordTarget | null } | { error: string };

function isInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value);
}

// Both fields blank clears the override back to the application default; both filled sets it. One
// filled and one blank is rejected client-side rather than silently coerced to the other's default.
function parseWordTargetInput(minInput: string, maxInput: string): WordTargetInput {
  const minTrimmed = minInput.trim();
  const maxTrimmed = maxInput.trim();
  if (!minTrimmed && !maxTrimmed) return { value: null };
  if (!minTrimmed || !maxTrimmed) return { error: 'Enter both a minimum and a maximum word count, or leave both blank for the default.' };
  const min = Number(minTrimmed);
  const max = Number(maxTrimmed);
  if (!isInteger(min) || !isInteger(max)) return { error: 'Word count target must be a whole number.' };
  if (min < WORD_TARGET_FLOOR || min > WORD_TARGET_CEILING || max < WORD_TARGET_FLOOR || max > WORD_TARGET_CEILING) {
    return { error: `Word count target must be between ${WORD_TARGET_FLOOR.toLocaleString('en-US')} and ${WORD_TARGET_CEILING.toLocaleString('en-US')}.` };
  }
  if (max <= min) return { error: 'Maximum word count must be greater than the minimum.' };
  return { value: { min, max } };
}

const CONTENT_MODES: readonly ContentMode[] = ['standard', 'unrestricted'];
const COST_TIERS: readonly CostTier[] = ['economy', 'balanced', 'performant'];
const JOB_ORDER = ['writing', 'planning', 'review', 'chat', 'helper', 'image'];

function isContentMode(value: string): value is ContentMode {
  return (CONTENT_MODES as readonly string[]).includes(value);
}

function isCostTier(value: string): value is CostTier {
  return (COST_TIERS as readonly string[]).includes(value);
}

function routePrice(route: ProjectModelRoute): string {
  if (route.inputPricePerMToken == null || route.outputPricePerMToken == null) return '—';
  return `$${route.inputPricePerMToken} in · $${route.outputPricePerMToken} out per 1M tokens`;
}

interface ModelCostDefaultsProps {
  novelId: string;
  contentMode: ContentMode;
  costTier: CostTier;
  onContentModeChange: (mode: ContentMode) => void;
  onCostTierChange: (tier: CostTier) => void;
}

function ModelCostDefaults({ novelId, contentMode, costTier, onContentModeChange, onCostTierChange }: ModelCostDefaultsProps): React.JSX.Element {
  const routesQuery = useProjectModelsQuery(novelId, { contentMode, costTier });
  const routes = [...(routesQuery.data?.models ?? [])].sort((a, b) => JOB_ORDER.indexOf(a.group) - JOB_ORDER.indexOf(b.group));

  return (
    <section className={styles.modelGroup} aria-labelledby="model-cost-defaults">
      <div id="model-cost-defaults" className={styles.modelGroupHead}>
        Defaults for this novel
      </div>
      <div className={`${styles.roleRow} ${styles.roleRowWrap}`}>
        <div className={styles.roleInfo}>
          <div className={styles.roleLabel}>Model type</div>
          <div className={styles.roleHint}>Standard uses Claude. Unrestricted uses models that allow dark content — for books that are dark throughout.</div>
        </div>
        <SegmentedControl size="sm" aria-label="Model type" value={contentMode} onValueChange={value => isContentMode(value) && onContentModeChange(value)}>
          {CONTENT_MODES.map(mode => (
            <SegmentedControl.Item key={mode} value={mode}>
              {contentModeLabel(mode)}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl>
      </div>
      <div className={`${styles.roleRow} ${styles.roleRowWrap}`}>
        <div className={styles.roleInfo}>
          <div className={styles.roleLabel}>Cost tier</div>
          <div className={styles.roleHint}>How much quality you buy per call. New chats, chapters and reviews use it.</div>
        </div>
        <SegmentedControl size="sm" aria-label="Cost tier" value={costTier} onValueChange={value => isCostTier(value) && onCostTierChange(value)}>
          {COST_TIERS.map(tier => (
            <SegmentedControl.Item key={tier} value={tier}>
              {tierLabel(tier)}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl>
      </div>
      <div className={styles.roleRow}>
        <div className={styles.roleInfo}>
          <div className={styles.roleLabel}>What that means for each job</div>
          {routesQuery.isLoading && <Spinner size="sm" label="Loading the models" />}
          {routesQuery.error && <div className={styles.roleHint}>Couldn’t load the models: {routesQuery.error.message}</div>}
          {routes.length > 0 && (
            <dl className={styles.jobMap}>
              {routes.map(route => (
                <div key={route.group} className={styles.jobRow}>
                  <dt>{groupLabel(route.group)}</dt>
                  <dd>
                    {route.label}
                    {route.source === 'project' ? ' · your pick' : route.source === 'account' ? ' · your default' : ''}
                  </dd>
                  <dd className={styles.jobPrice}>{routePrice(route)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </section>
  );
}

function SettingsScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const { tab = 'general' } = Route.useSearch();
  const goSearch = Route.useNavigate();
  const navigate = useNavigate();
  const projectQuery = useProjectQuery(novelId);
  const modelsQuery = useAiModelsQuery();
  const accountQuery = useAccountSettingsQuery();
  const pluginsQuery = useListPluginsQuery();
  const updateProject = useUpdateProjectMutation(novelId);
  const deleteProject = useDeleteProjectMutation();

  const project = projectQuery.data;
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [instructions, setInstructions] = useState('');
  const [contentMode, setContentMode] = useState<ContentMode>('standard');
  const [costTier, setCostTier] = useState<CostTier>('balanced');
  const [wordTargetMin, setWordTargetMin] = useState('');
  const [wordTargetMax, setWordTargetMax] = useState('');
  const [models, setModels] = useState<Partial<Record<ModelGroup, string>>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const unrestrictedAllowlist = modelsQuery.data?.unrestrictedAllowlist;
  const generalKey = project ? JSON.stringify([project.id, project.name, project.title, project.brief, project.instructions, project.wordTarget]) : undefined;
  const modelKey = project ? JSON.stringify([project.id, project.contentMode, project.costTier, project.config?.models, unrestrictedAllowlist]) : undefined;
  const [syncedGeneral, setSyncedGeneral] = useState<string>();
  const [syncedModels, setSyncedModels] = useState<string>();
  if (project && syncedGeneral !== generalKey) {
    setSyncedGeneral(generalKey);
    setTitle(projectTitle(project));
    setBrief(project.brief ?? '');
    setInstructions(project.instructions ?? '');
    setWordTargetMin(project.wordTarget ? String(project.wordTarget.min) : '');
    setWordTargetMax(project.wordTarget ? String(project.wordTarget.max) : '');
  }
  if (project && syncedModels !== modelKey) {
    setSyncedModels(modelKey);
    setContentMode(project.contentMode);
    setCostTier(project.costTier);
    const overrides = project.config?.models ?? {};
    const next: Partial<Record<ModelGroup, string>> = {};
    const allowed = new Set(unrestrictedAllowlist ?? []);
    const unrestrictedMode = project.contentMode === 'unrestricted';
    for (const group of ALL_ROLES) {
      const entry = GROUP_ROLES[group.key].map(role => overrides[role]).find(Boolean);
      const honour = Boolean(entry && (!unrestrictedMode || allowed.has(entry.model)));
      next[group.key] = honour && entry ? encodeModelRef(entry.provider, entry.model) : INHERIT_MODEL;
    }
    setModels(next);
  }

  const setModel = (key: ModelGroup, value: string): void => setModels(prev => ({ ...prev, [key]: value }));

  const saveGeneral = (): void => {
    const wordTarget = parseWordTargetInput(wordTargetMin, wordTargetMax);
    if ('error' in wordTarget) {
      toast.danger(wordTarget.error);
      return;
    }
    updateProject.mutate(
      { title: title.trim(), brief, instructions, wordTarget: wordTarget.value },
      { onSuccess: () => toast.success('Settings saved'), onError: err => toast.danger(err.message) },
    );
  };

  const saveModels = (): void => {
    const picks = ALL_ROLES.map(group => {
      const value = models[group.key];
      return { roles: GROUP_ROLES[group.key], ref: value && value !== INHERIT_MODEL ? decodeModelRef(value) : null };
    });
    const body = modelSaveBody({ contentMode, costTier, unrestrictedAllowlist, picks, embedding: project?.config?.models?.embedding });
    updateProject.mutate(body, { onSuccess: () => toast.success('Model & cost settings saved'), onError: err => toast.danger(err.message) });
  };

  const doDelete = (): void => {
    deleteProject.mutate(novelId, {
      onSuccess: () => {
        toast.success('Project deleted');
        navigate({ to: '/' });
      },
      onError: err => toast.danger(err.message),
    });
  };

  // A deployment with no plugin directory answers `[]`, and the tab does not exist at all there.
  const hasPlugins = (pluginsQuery.data?.length ?? 0) > 0;
  const activeTab = tab === 'plugins' && !hasPlugins ? 'general' : tab;
  const unrestricted = contentMode === 'unrestricted';
  const allowlist = new Set(modelsQuery.data?.unrestrictedAllowlist ?? []);
  const registry = modelsQuery.data?.models ?? [];
  const modelOptions = registry.filter(m => !unrestricted || allowlist.has(m.id) || m.kind === 'embedding');
  const profile = modelsQuery.data?.profile;
  const inheritedDefaults = unrestricted ? (modelsQuery.data?.unrestrictedDefaults ?? []) : (modelsQuery.data?.defaults ?? []);

  return (
    <PageContainer>
      <QueryState isLoading={projectQuery.isLoading} error={projectQuery.error} isEmpty={!project} emptyTitle="Project not found">
        <>
          <PageHeader title="Project settings" subtitle={project ? `${projectTitle(project)} · configure defaults and the models each AI operation uses.` : ''} />

          <Tabs value={activeTab} onValueChange={value => isSettingsTab(value) && void goSearch({ search: { tab: value === 'general' ? undefined : value }, replace: true })}>
            <Tabs.List>
              <Tabs.Tab value="general">General</Tabs.Tab>
              <Tabs.Tab value="models">Model &amp; cost</Tabs.Tab>
              {hasPlugins && <Tabs.Tab value="plugins">Plugins</Tabs.Tab>}
              <Tabs.Tab value="danger">Danger zone</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="general" className={styles.tabPanel}>
              <SectionCard title="General">
                <div className={styles.form}>
                  <FormField label="Working title">
                    <Input value={title} onValueChange={setTitle} />
                  </FormField>
                  <FormField label="Premise / brief">
                    <Textarea value={brief} onValueChange={setBrief} minRows={3} autoGrow />
                  </FormField>
                  {project?.defaultCopyRemoved && <Alert intent="warning">Some of your rules repeated the built-in style and were removed; review what remains.</Alert>}
                  <FormField
                    label="Your writing rules"
                    helper="Added after the built-in writing style every time the AI writes or repairs a chapter — point of view, tone, content limits. Where the two conflict, your rules win. Leave blank to use the built-in style alone."
                  >
                    <Textarea
                      value={instructions}
                      onValueChange={setInstructions}
                      minRows={4}
                      autoGrow
                      placeholder="e.g. First person, present tense. End every chapter on a hook."
                    />
                  </FormField>
                  {project && (
                    <Accordion type="single" collapsible variant="contained">
                      <Accordion.Item value="default-style" title="Built-in writing style (read-only)">
                        <pre className={styles.defaultStyle}>{project.defaultInstructions}</pre>
                      </Accordion.Item>
                    </Accordion>
                  )}
                  <FormField
                    label="Chapter word-count target"
                    helper={`How long a generated chapter should run — length checks, the expansion pass, and the writer's prompt all read this. Leave both blank for the default (${DEFAULT_WORD_TARGET_MIN.toLocaleString('en-US')}–${DEFAULT_WORD_TARGET_MAX.toLocaleString('en-US')}).`}
                  >
                    <div className={styles.fieldRow}>
                      <div className={styles.fieldCol}>
                        <Input
                          type="number"
                          min={WORD_TARGET_FLOOR}
                          max={WORD_TARGET_CEILING}
                          step={1}
                          value={wordTargetMin}
                          onValueChange={setWordTargetMin}
                          placeholder={String(DEFAULT_WORD_TARGET_MIN)}
                          aria-label="Minimum word count"
                        />
                      </div>
                      <div className={styles.fieldCol}>
                        <Input
                          type="number"
                          min={WORD_TARGET_FLOOR}
                          max={WORD_TARGET_CEILING}
                          step={1}
                          value={wordTargetMax}
                          onValueChange={setWordTargetMax}
                          placeholder={String(DEFAULT_WORD_TARGET_MAX)}
                          aria-label="Maximum word count"
                        />
                      </div>
                    </div>
                  </FormField>
                  <div>
                    <Button variant="primary" loading={updateProject.isPending} onClick={saveGeneral}>
                      Save changes
                    </Button>
                  </div>
                </div>
              </SectionCard>
            </Tabs.Panel>

            <Tabs.Panel value="models" className={styles.tabPanel}>
              <div className={styles.alertWrap}>
                <Alert intent="info" title="Model changes apply to new runs only">
                  Operations set to “Inherit default” use your defaults from Settings, or else the
                  <strong>{profile ? ` ${profile}` : ''}</strong> server profile{unrestricted ? ' Unrestricted map' : ''}. In-flight jobs keep the model they started with.
                  {unrestricted ? ' Unrestricted only lists the models cleared for it; the rest are hidden.' : ''}
                </Alert>
              </div>

              <ModelCostDefaults novelId={novelId} contentMode={contentMode} costTier={costTier} onContentModeChange={setContentMode} onCostTierChange={setCostTier} />
              {modelsQuery.error ? (
                <div className={styles.alertWrap}>
                  <Alert intent="danger" title="Couldn’t load the model registry">
                    {modelsQuery.error.message}
                  </Alert>
                </div>
              ) : (
                <>
                  {ROLE_GROUPS.map(section => (
                    <div key={section.title} className={styles.modelGroup}>
                      <div className={styles.modelGroupHead}>{section.title}</div>
                      {section.roles.map(role => {
                        const inherited = inheritedModel(role.key, accountQuery.data?.models, inheritedDefaults, registry, unrestricted ? allowlist : undefined);
                        return (
                          <div key={role.key} className={styles.roleRow}>
                            <div className={styles.roleInfo}>
                              <div className={styles.roleLabel}>{role.label}</div>
                              <div className={styles.roleHint}>
                                {role.hint}
                                {models[role.key] === INHERIT_MODEL && inherited
                                  ? ` · inherits ${modelLabel(registry, inherited.model, inherited.provider)} from ${inherited.source === 'account' ? 'your defaults' : 'the platform'}`
                                  : ''}
                              </div>
                            </div>
                            <div className={styles.rolePicker}>
                              <ModelPicker
                                value={models[role.key] ?? INHERIT_MODEL}
                                onChange={v => setModel(role.key, v)}
                                kind={role.kind}
                                models={modelOptions}
                                loading={modelsQuery.isLoading}
                                inheritLabel="Inherit default"
                                aria-label={`${role.label} model`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
              <div className={styles.saveRow}>
                <div className={styles.spacer} />
                <Button variant="primary" loading={updateProject.isPending} onClick={saveModels}>
                  Save changes
                </Button>
              </div>
            </Tabs.Panel>

            {hasPlugins && (
              <Tabs.Panel value="plugins" className={styles.tabPanel}>
                <PluginsTab novelId={novelId} manifests={pluginsQuery.data ?? []} />
              </Tabs.Panel>
            )}

            <Tabs.Panel value="danger" className={styles.tabPanel}>
              <SectionCard title="Delete project">
                <p className={styles.dangerText}>Permanently delete this project and every draft, entity, and run it contains. This cannot be undone.</p>
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                  Delete project
                </Button>
              </SectionCard>
            </Tabs.Panel>
          </Tabs>
        </>
      </QueryState>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <Dialog.Content size="sm">
          <Dialog.Header title="Delete this project?" description="Every draft, entity, and run will be permanently removed. This cannot be undone." />
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="danger" loading={deleteProject.isPending} onClick={doDelete}>
              Delete project
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </PageContainer>
  );
}
