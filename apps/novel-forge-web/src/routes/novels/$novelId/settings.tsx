import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, FormField, Input, SegmentedControl, Select, Tabs, Textarea, toast } from '@shadow-library/ui';

import { PageContainer, PageHeader, QueryState, SectionCard } from '@/components/nf';
import {
  type AiModelOption,
  aiModelsQueryOptions,
  type ContentMode,
  type ProjectConfig,
  type ProjectModelOverrides,
  useAiModelsQuery,
  useDeleteProjectMutation,
  useProjectQuery,
  useUpdateProjectMutation,
} from '@/lib/apis';
import { decodeModelRef, encodeModelRef, projectTitle } from '@/lib/format';

import styles from './settings.module.css';

export const Route = createFileRoute('/novels/$novelId/settings')({
  loader: ({ context }) => context.queryClient.prefetchQuery(aiModelsQueryOptions()),
  component: SettingsScreen,
});

type ModelKind = 'llm' | 'embedding' | 'image';

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

const INHERIT = 'inherit';

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

interface ProviderGroup {
  label: string;
  providers: string[];
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

const PROVIDER_GROUPS: ProviderGroup[] = [
  { label: 'OpenRouter · API key', providers: ['openrouter'] },
  { label: 'Image vendors · API key', providers: ['xai', 'openai'] },
  { label: 'Ollama · local', providers: ['ollama'] },
];

interface ModelPickerProps {
  value: string;
  onChange: (v: string) => void;
  kind: ModelKind;
  models: AiModelOption[];
  loading: boolean;
}

function ModelPicker({ value, onChange, kind, models, loading }: ModelPickerProps): React.JSX.Element {
  return (
    <Select value={value} onValueChange={onChange} loading={loading} aria-label="Model">
      <Select.Item value={INHERIT}>Inherit default</Select.Item>
      {PROVIDER_GROUPS.map(group => {
        const items = models.filter(m => m.kind === kind && group.providers.includes(m.provider));
        if (items.length === 0) return null;
        return (
          <Select.Group key={group.label} label={group.label}>
            {items.map(m => (
              <Select.Item key={m.provider + m.id} value={encodeModelRef(m.provider, m.id)} disabled={!m.enabled} description={m.enabled ? undefined : 'enable on server'}>
                {m.label}
              </Select.Item>
            ))}
          </Select.Group>
        );
      })}
    </Select>
  );
}

function SettingsScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const navigate = useNavigate();
  const projectQuery = useProjectQuery(novelId);
  const modelsQuery = useAiModelsQuery();
  const updateProject = useUpdateProjectMutation(novelId);
  const deleteProject = useDeleteProjectMutation();

  const project = projectQuery.data;
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [instructions, setInstructions] = useState('');
  const [contentMode, setContentMode] = useState<ContentMode>('standard');
  const [models, setModels] = useState<Partial<Record<ModelGroup, string>>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!project) return;
    setTitle(projectTitle(project));
    setBrief(project.brief ?? '');
    setInstructions(project.instructions ?? '');
    setContentMode(project.contentMode);
    const overrides = project.config?.models ?? {};
    const next: Partial<Record<ModelGroup, string>> = {};
    for (const group of ALL_ROLES) {
      const entry = GROUP_ROLES[group.key].map(role => overrides[role]).find(Boolean);
      next[group.key] = entry ? encodeModelRef(entry.provider, entry.model) : INHERIT;
    }
    setModels(next);
  }, [project]);

  const setModel = (key: ModelGroup, value: string): void => setModels(prev => ({ ...prev, [key]: value }));

  const saveGeneral = (): void => {
    updateProject.mutate(
      { title: title.trim(), brief, instructions, contentMode },
      { onSuccess: () => toast.success('Settings saved'), onError: err => toast.danger(err.message) },
    );
  };

  const saveModels = (): void => {
    // A group's choice fans out across every role it owns; INHERIT groups are omitted so the router
    // falls back to the profile default. The locked embedding override (if any) is preserved untouched.
    const overrides: ProjectModelOverrides = {};
    const existingEmbedding = project?.config?.models?.embedding;
    if (existingEmbedding) overrides.embedding = existingEmbedding;
    for (const group of ALL_ROLES) {
      const value = models[group.key];
      if (!value || value === INHERIT) continue;
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

  const modelOptions = modelsQuery.data?.models ?? [];
  const profile = modelsQuery.data?.profile;
  const defaultsMap = new Map((modelsQuery.data?.defaults ?? []).map(d => [d.role, d.model]));

  return (
    <PageContainer>
      <QueryState isLoading={projectQuery.isLoading} error={projectQuery.error} isEmpty={!project} emptyTitle="Project not found">
        <>
          <PageHeader title="Project settings" subtitle={project ? `${projectTitle(project)} · configure defaults and the models each AI operation uses.` : ''} />

          <Tabs defaultValue="general">
            <Tabs.List>
              <Tabs.Tab value="general">General</Tabs.Tab>
              <Tabs.Tab value="models">Models</Tabs.Tab>
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
                  <FormField label="Content mode">
                    <SegmentedControl value={contentMode} onValueChange={v => setContentMode(v as ContentMode)}>
                      <SegmentedControl.Item value="standard">Standard</SegmentedControl.Item>
                      <SegmentedControl.Item value="grok_only">Grok only</SegmentedControl.Item>
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
                  Each operation picks a provider and model together; the provider follows the model you choose. Operations set to “Inherit default” use the
                  <strong>{profile ? ` ${profile}` : ''}</strong> server profile. In-flight jobs keep the model they started with.
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
                        const inheritedDefault = defaultsMap.get(role.key);
                        return (
                          <div key={role.key} className={styles.roleRow}>
                            <div className={styles.roleInfo}>
                              <div className={styles.roleLabel}>{role.label}</div>
                              <div className={styles.roleHint}>
                                {role.hint}
                                {models[role.key] === INHERIT && inheritedDefault ? ` · inherits ${inheritedDefault}` : ''}
                              </div>
                            </div>
                            <div className={styles.rolePicker}>
                              <ModelPicker
                                value={models[role.key] ?? INHERIT}
                                onChange={v => setModel(role.key, v)}
                                kind={role.kind}
                                models={modelOptions}
                                loading={modelsQuery.isLoading}
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
