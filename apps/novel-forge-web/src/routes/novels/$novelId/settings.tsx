import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Accordion, Alert, Button, Dialog, FormField, Input, SegmentedControl, Spinner, Tabs, Textarea, toast } from '@shadow-library/ui';

import { PageContainer, PageHeader, QueryState, SectionCard } from '@/components/nf';
import { PluginsTab } from '@/features/plugins/PluginsTab';
import {
  type ContentMode,
  type CostTier,
  type ProjectModelRoute,
  type ProjectWordTarget,
  useAiModelsQuery,
  useDeleteProjectMutation,
  useListPluginsQuery,
  useProjectModelsQuery,
  useProjectQuery,
  useUpdateProjectMutation,
} from '@/lib/apis';
import { projectTitle } from '@/lib/format';
import { useIsAdmin } from '@/lib/session';
import { contentModeLabel, groupLabel, isPace, paceCopy, PACES, tierLabel } from '@/lib/usage';

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
  component: SettingsScreen,
});

// Mirrors the server's default (`WORD_TARGET_MIN`/`MAX` in `deterministic-metrics.ts`), shown as the placeholder.
const DEFAULT_WORD_TARGET_MIN = 1800;
const DEFAULT_WORD_TARGET_MAX = 2600;

// Mirrors the server's `WORD_TARGET_FLOOR`/`WORD_TARGET_CEILING` in project.dto.ts, so the field rejects what the server would instead of round-tripping a 422.
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
const JOB_ORDER = ['writing', 'planning', 'review', 'chat', 'helper', 'image'];

function isContentMode(value: string): value is ContentMode {
  return (CONTENT_MODES as readonly string[]).includes(value);
}

function routePrice(route: ProjectModelRoute): string {
  if (route.inputPricePerMToken == null || route.outputPricePerMToken == null) return '—';
  return `$${route.inputPricePerMToken} in · $${route.outputPricePerMToken} out per 1M tokens`;
}

interface PaceSettingsProps {
  novelId: string;
  contentMode: ContentMode;
  costTier: CostTier;
  savedContentMode?: ContentMode;
  unrestrictedAvailable?: boolean;
  onContentModeChange: (mode: ContentMode) => void;
  onCostTierChange: (tier: CostTier) => void;
}

function PaceSettings({ novelId, contentMode, costTier, savedContentMode, unrestrictedAvailable, onContentModeChange, onCostTierChange }: PaceSettingsProps): React.JSX.Element {
  const isAdmin = useIsAdmin();
  const routesQuery = useProjectModelsQuery(novelId, { contentMode, costTier }, isAdmin);
  const routes = [...(routesQuery.data?.models ?? [])].sort((a, b) => JOB_ORDER.indexOf(a.group) - JOB_ORDER.indexOf(b.group));
  const showContentMode = unrestrictedAvailable === true || savedContentMode === 'unrestricted';

  return (
    <section className={styles.modelGroup} aria-labelledby="pace-settings">
      <div id="pace-settings" className={styles.modelGroupHead}>
        Defaults for this novel
      </div>
      <div className={`${styles.roleRow} ${styles.roleRowWrap}`}>
        <div className={styles.roleInfo}>
          <div className={styles.roleLabel}>Pace</div>
          {PACES.map(tier => (
            <div key={tier} className={styles.roleHint}>
              <strong>{tierLabel(tier)}</strong> · {paceCopy(tier)}
            </div>
          ))}
        </div>
        <SegmentedControl size="sm" aria-label="Pace" value={costTier} onValueChange={value => isPace(value) && onCostTierChange(value)}>
          {PACES.map(tier => (
            <SegmentedControl.Item key={tier} value={tier}>
              {tierLabel(tier)}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl>
      </div>
      {showContentMode && (
        <div className={`${styles.roleRow} ${styles.roleRowWrap}`}>
          <div className={styles.roleInfo}>
            <div className={styles.roleLabel}>Content mode</div>
            <div className={styles.roleHint}>Standard suits most books. Unrestricted allows dark content — for books that are dark throughout.</div>
            {unrestrictedAvailable === false && (
              <div className={styles.roleHint}>Unrestricted writing isn’t available right now, so this novel’s AI work stops until it is. Switch to Standard to keep writing.</div>
            )}
          </div>
          <SegmentedControl size="sm" aria-label="Content mode" value={contentMode} onValueChange={value => isContentMode(value) && onContentModeChange(value)}>
            {CONTENT_MODES.map(mode => (
              <SegmentedControl.Item key={mode} value={mode}>
                {contentModeLabel(mode)}
              </SegmentedControl.Item>
            ))}
          </SegmentedControl>
        </div>
      )}
      {isAdmin && (
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
                    <dd>{route.label}</dd>
                    <dd className={styles.jobPrice}>{routePrice(route)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function SettingsScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const { tab = 'general' } = Route.useSearch();
  const goSearch = Route.useNavigate();
  const navigate = useNavigate();
  const projectQuery = useProjectQuery(novelId);
  const pluginsQuery = useListPluginsQuery();
  const modelsQuery = useAiModelsQuery();
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
  const [confirmDelete, setConfirmDelete] = useState(false);

  const generalKey = project ? JSON.stringify([project.id, project.name, project.title, project.brief, project.instructions, project.wordTarget]) : undefined;
  const modelKey = project ? JSON.stringify([project.id, project.contentMode, project.costTier]) : undefined;
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
  }

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

  const paceChanged = costTier !== project?.costTier;
  const contentModeChanged = contentMode !== project?.contentMode;
  // Only what changed goes up: re-sending an unrestricted mode the server can no longer route would be refused (AI_024) even though nothing changed.
  const saveModels = (): void => {
    const body = { ...(paceChanged && { costTier }), ...(contentModeChanged && { contentMode }) };
    updateProject.mutate(body, { onSuccess: () => toast.success('Settings saved'), onError: err => toast.danger(err.message) });
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

  return (
    <PageContainer>
      <QueryState isLoading={projectQuery.isLoading} error={projectQuery.error} isEmpty={!project} emptyTitle="Project not found">
        <>
          <PageHeader title="Project settings" subtitle={project ? `${projectTitle(project)} · configure defaults and pace.` : ''} />

          <Tabs value={activeTab} onValueChange={value => isSettingsTab(value) && void goSearch({ search: { tab: value === 'general' ? undefined : value }, replace: true })}>
            <Tabs.List>
              <Tabs.Tab value="general">General</Tabs.Tab>
              <Tabs.Tab value="models">Pace</Tabs.Tab>
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
                <Alert intent="info" title="Pace changes apply to new work only">
                  Every chat reply, chapter and review uses the novel’s pace; Think deeper in the composer gives a single reply Meticulous thinking. Work already running keeps the
                  pace it started with.
                </Alert>
              </div>

              <PaceSettings
                novelId={novelId}
                contentMode={contentMode}
                costTier={costTier}
                savedContentMode={project?.contentMode}
                unrestrictedAvailable={modelsQuery.data?.unrestrictedAvailable}
                onContentModeChange={setContentMode}
                onCostTierChange={setCostTier}
              />
              <div className={styles.saveRow}>
                <div className={styles.spacer} />
                <Button variant="primary" loading={updateProject.isPending} disabled={!paceChanged && !contentModeChanged} onClick={saveModels}>
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
