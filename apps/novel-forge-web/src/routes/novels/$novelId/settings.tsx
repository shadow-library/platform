import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Alert, Button, Dialog, FormField, Input, SegmentedControl, Tabs, Textarea, toast } from '@shadow-library/ui';

import { INHERIT_MODEL, type ModelKind, ModelPicker, PageContainer, PageHeader, QueryState, SectionCard } from '@/components/nf';
import { PluginsTab } from '@/features/plugins/PluginsTab';
import {
  aiModelsQueryOptions,
  type ContentMode,
  type ProjectConfig,
  type ProjectModelOverrides,
  useAccountSettingsQuery,
  useAiModelsQuery,
  useDeleteProjectMutation,
  useListPluginsQuery,
  useProjectQuery,
  useUpdateProjectMutation,
} from '@/lib/apis';
import { decodeModelRef, encodeModelRef, projectTitle } from '@/lib/format';
import { inheritedModel } from '@/lib/model-defaults';

import styles from './settings.module.css';

export const Route = createFileRoute('/novels/$novelId/settings')({
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
  planning: ['premise', 'plan', 'arc', 'outline', 'skeleton', 'bible', 'extraction'],
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
      { key: 'planning', label: 'Planning & canon', hint: 'Premise, plan, arcs, outlines, skeletons, bible & extraction', kind: 'llm' },
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

function SettingsScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
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
  const [models, setModels] = useState<Partial<Record<ModelGroup, string>>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const unrestrictedAllowlist = modelsQuery.data?.unrestrictedAllowlist;
  const [synced, setSynced] = useState<{ project: typeof project; allowlist: typeof unrestrictedAllowlist }>({ project: undefined, allowlist: undefined });
  if (project && (synced.project !== project || synced.allowlist !== unrestrictedAllowlist)) {
    setSynced({ project, allowlist: unrestrictedAllowlist });
    setTitle(projectTitle(project));
    setBrief(project.brief ?? '');
    setInstructions(project.instructions ?? '');
    setContentMode(project.contentMode);
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
    updateProject.mutate(
      { title: title.trim(), brief, instructions, contentMode },
      { onSuccess: () => toast.success('Settings saved'), onError: err => toast.danger(err.message) },
    );
  };

  const saveModels = (): void => {
    // A group's choice fans out across every role it owns; INHERIT_MODEL groups are omitted so the router
    // falls back to the profile default. The locked embedding override (if any) is preserved untouched.
    const overrides: ProjectModelOverrides = {};
    const existingEmbedding = project?.config?.models?.embedding;
    if (existingEmbedding) overrides.embedding = existingEmbedding;
    for (const group of ALL_ROLES) {
      const value = models[group.key];
      if (!value || value === INHERIT_MODEL) continue;
      const ref = decodeModelRef(value);
      for (const role of GROUP_ROLES[group.key]) overrides[role] = ref;
    }
    const config: ProjectConfig = { models: overrides };
    updateProject.mutate({ config }, { onSuccess: () => toast.success('Models saved'), onError: err => toast.danger(err.message) });
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
  const unrestricted = contentMode === 'unrestricted';
  const allowlist = new Set(modelsQuery.data?.unrestrictedAllowlist ?? []);
  const modelOptions = (modelsQuery.data?.models ?? []).filter(m => !unrestricted || allowlist.has(m.id) || m.kind === 'embedding');
  const profile = modelsQuery.data?.profile;
  const inheritedDefaults = unrestricted ? (modelsQuery.data?.unrestrictedDefaults ?? []) : (modelsQuery.data?.defaults ?? []);

  return (
    <PageContainer>
      <QueryState isLoading={projectQuery.isLoading} error={projectQuery.error} isEmpty={!project} emptyTitle="Project not found">
        <>
          <PageHeader title="Project settings" subtitle={project ? `${projectTitle(project)} · configure defaults and the models each AI operation uses.` : ''} />

          <Tabs defaultValue="general">
            <Tabs.List>
              <Tabs.Tab value="general">General</Tabs.Tab>
              <Tabs.Tab value="models">Models</Tabs.Tab>
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
                  <FormField
                    label="Chapter writing instructions"
                    helper="Always sent to the AI when it writes a chapter — voice, style, and length. Clear the field to restore the default."
                  >
                    <Textarea value={instructions} onValueChange={setInstructions} minRows={6} autoGrow />
                  </FormField>
                  <FormField label="Content mode" helper="Unrestricted uses the alternate model map. Standard uses the default quality stack.">
                    <SegmentedControl value={contentMode} onValueChange={v => setContentMode(v as ContentMode)}>
                      <SegmentedControl.Item value="standard">Standard</SegmentedControl.Item>
                      <SegmentedControl.Item value="unrestricted">Unrestricted</SegmentedControl.Item>
                    </SegmentedControl>
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
                  Each operation picks a provider and model together; the provider follows the model you choose. Operations set to “Inherit default” use your defaults from
                  Settings, or else the
                  <strong>{profile ? ` ${profile}` : ''}</strong> server profile{unrestricted ? ' Unrestricted map' : ''}. In-flight jobs keep the model they started with.
                  {unrestricted ? ' Unrestricted only lists models on the unrestricted allowlist; other providers are hidden.' : ''}
                </Alert>
              </div>

              {modelsQuery.error ? (
                <Alert intent="danger" title="Couldn’t load the model registry">
                  {modelsQuery.error.message}
                </Alert>
              ) : (
                <>
                  {ROLE_GROUPS.map(section => (
                    <div key={section.title} className={styles.modelGroup}>
                      <div className={styles.modelGroupHead}>{section.title}</div>
                      {section.roles.map(role => {
                        const inherited = inheritedModel(
                          role.key,
                          accountQuery.data?.models,
                          inheritedDefaults,
                          modelsQuery.data?.models ?? [],
                          unrestricted ? allowlist : undefined,
                        );
                        return (
                          <div key={role.key} className={styles.roleRow}>
                            <div className={styles.roleInfo}>
                              <div className={styles.roleLabel}>{role.label}</div>
                              <div className={styles.roleHint}>
                                {role.hint}
                                {models[role.key] === INHERIT_MODEL && inherited
                                  ? ` · inherits ${inherited.model} from ${inherited.source === 'account' ? 'your defaults' : 'the platform'}`
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

                  <div className={styles.saveRow}>
                    <div className={styles.spacer} />
                    <Button variant="primary" loading={updateProject.isPending} onClick={saveModels}>
                      Save changes
                    </Button>
                  </div>
                </>
              )}
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
