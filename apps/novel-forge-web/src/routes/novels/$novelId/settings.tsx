/**
 * Importing npm packages
 */
import { Alert, Button, Dialog, FormField, Input, SegmentedControl, Select, Tabs, Textarea, toast } from '@shadow-library/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

/**
 * Importing user defined modules
 */
import { PageContainer, PageHeader, QueryState, SectionCard } from '@/components/nf';
import {
  type AiModelOption,
  type ContentMode,
  type ProjectConfig,
  type ProjectModelOverrides,
  useAiModelsQuery,
  useDeleteProjectMutation,
  useProjectQuery,
  useUpdateProjectMutation,
} from '@/lib/apis';
import { decodeModelRef, encodeModelRef, projectTitle } from '@/lib/format';

export const Route = createFileRoute('/novels/$novelId/settings')({
  component: SettingsScreen,
});

type ModelKind = 'llm' | 'embedding' | 'image';

// The backend keys per-role overrides by `AiRole`; `ProjectModelOverrides` is that exact, closed set.
type AiRole = keyof ProjectModelOverrides;

// The router resolves each role from `config.models[role]` as a `{ provider, model }` pair, falling
// back to the active server profile's default when a role is unset. A role left on INHERIT is simply
// omitted from the persisted map.
const INHERIT = 'inherit';

interface RoleDef {
  key: AiRole;
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

// The backend `AiRole` set, grouped into product-facing sections. Every routable role is configurable;
// unlisted-to-the-user roles would silently inherit, so we surface them all.
const ROLE_GROUPS: RoleGroup[] = [
  {
    title: 'Authoring',
    roles: [
      { key: 'generation', label: 'Draft generation', hint: 'Prose for each chapter', kind: 'llm' },
      { key: 'revision', label: 'Revision pass', hint: 'Rewrites against review notes', kind: 'llm' },
      { key: 'fix', label: 'Repair', hint: 'Fixes flagged contradictions', kind: 'llm' },
      { key: 'title', label: 'Title generation', hint: 'Chapter & work titles', kind: 'llm' },
    ],
  },
  {
    title: 'Planning',
    roles: [
      { key: 'premise', label: 'Premise enhancement', hint: 'Expands the project brief', kind: 'llm' },
      { key: 'plan', label: 'Story planning', hint: 'Top-level story structure', kind: 'llm' },
      { key: 'arc', label: 'Arc planning', hint: 'Narrative arcs + coverage', kind: 'llm' },
      { key: 'outline', label: 'Chapter outline', hint: 'Beat-level outline from brief', kind: 'llm' },
      { key: 'skeleton', label: 'Chapter skeleton', hint: 'Scene scaffold before prose', kind: 'llm' },
    ],
  },
  {
    title: 'Knowledge & chat',
    roles: [
      { key: 'bible', label: 'Bible synthesis', hint: 'World / plot / timeline docs', kind: 'llm' },
      { key: 'extraction', label: 'Bible extraction', hint: 'Entities from source chapters', kind: 'llm' },
      { key: 'chat', label: 'Refinement chat', hint: 'Conversational proposals', kind: 'llm' },
    ],
  },
  {
    title: 'Quality & review',
    roles: [
      { key: 'judge', label: 'Continuity judge', hint: 'consistent / contradiction verdicts', kind: 'llm' },
      { key: 'continuity', label: 'Continuity proposals', hint: 'Suggests canon fixes', kind: 'llm' },
      { key: 'validation', label: 'Validation', hint: 'Structural checks', kind: 'llm' },
      { key: 'review', label: 'Review', hint: 'Editorial review pass', kind: 'llm' },
      { key: 'audit', label: 'Bible audit', hint: 'Consistency sweep of the bible', kind: 'llm' },
    ],
  },
  {
    title: 'Utility',
    roles: [{ key: 'compact', label: 'Context compaction', hint: 'Summarises long context', kind: 'llm' }],
  },
  {
    title: 'Media & retrieval',
    roles: [
      { key: 'embedding', label: 'Embeddings', hint: 'Vector index for retrieval', kind: 'embedding' },
      { key: 'image', label: 'Illustrations', hint: 'Cover & scene art', kind: 'image' },
    ],
  },
];

const ALL_ROLES = ROLE_GROUPS.flatMap(g => g.roles);

// Providers rendered as one visual group; the two CLI subprocess providers share a section since they
// route on provider alone (the model id is ignored) and authenticate via the local CLI, not an API key.
const PROVIDER_GROUPS: ProviderGroup[] = [
  { label: 'xAI · API key', providers: ['xai'] },
  { label: 'Anthropic · API key', providers: ['anthropic'] },
  { label: 'OpenAI · API key', providers: ['openai'] },
  { label: 'Ollama · local', providers: ['ollama'] },
  { label: 'CLI · uses local auth', providers: ['anthropic-claude-code', 'openai-codex'] },
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
  const [contentMode, setContentMode] = useState<ContentMode>('standard');
  const [models, setModels] = useState<Partial<Record<AiRole, string>>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!project) return;
    setTitle(projectTitle(project));
    setBrief(project.brief ?? '');
    setContentMode(project.contentMode);
    const overrides = project.config?.models ?? {};
    const next: Partial<Record<AiRole, string>> = {};
    for (const role of ALL_ROLES) {
      const entry = overrides[role.key];
      next[role.key] = entry ? encodeModelRef(entry.provider, entry.model) : INHERIT;
    }
    setModels(next);
  }, [project]);

  const setModel = (key: AiRole, value: string): void => setModels(prev => ({ ...prev, [key]: value }));

  const saveGeneral = (): void => {
    updateProject.mutate({ title: title.trim(), brief, contentMode }, { onSuccess: () => toast.success('Settings saved'), onError: err => toast.danger(err.message) });
  };

  const saveModels = (): void => {
    // INHERIT rows are omitted so the router falls back to the active profile's default for that role.
    const overrides: ProjectModelOverrides = {};
    for (const role of ALL_ROLES) {
      const value = models[role.key];
      if (value && value !== INHERIT) overrides[role.key] = decodeModelRef(value);
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

            <Tabs.Panel value="general" style={{ paddingTop: 20 }}>
              <SectionCard title="General">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <FormField label="Working title">
                    <Input value={title} onValueChange={setTitle} />
                  </FormField>
                  <FormField label="Premise / brief">
                    <Textarea value={brief} onValueChange={setBrief} minRows={3} autoGrow />
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

            <Tabs.Panel value="models" style={{ paddingTop: 20 }}>
              <div style={{ marginBottom: 16 }}>
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
                    <div
                      key={section.title}
                      style={{
                        background: 'var(--sh-surface-card)',
                        border: '1px solid var(--sh-border-subtle)',
                        borderRadius: 'var(--sh-radius-lg)',
                        overflow: 'hidden',
                        marginBottom: 16,
                      }}
                    >
                      <div style={{ padding: '13px 20px', borderBottom: '1px solid var(--sh-border-subtle)', fontSize: 'var(--sh-text-body-sm)', fontWeight: 700 }}>
                        {section.title}
                      </div>
                      {section.roles.map((role, i) => {
                        const inheritedDefault = defaultsMap.get(role.key);
                        return (
                          <div
                            key={role.key}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 16,
                              padding: '14px 20px',
                              borderBottom: i < section.roles.length - 1 ? '1px solid var(--sh-border-subtle)' : undefined,
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 600 }}>{role.label}</div>
                              <div style={{ fontSize: 11, color: 'var(--sh-text-tertiary)' }}>
                                {role.hint}
                                {models[role.key] === INHERIT && inheritedDefault ? ` · inherits ${inheritedDefault}` : ''}
                              </div>
                            </div>
                            <div style={{ minWidth: 210 }}>
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

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }} />
                    <Button variant="primary" loading={updateProject.isPending} onClick={saveModels}>
                      Save changes
                    </Button>
                  </div>
                </>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="danger" style={{ paddingTop: 20 }}>
              <SectionCard title="Delete project">
                <p style={{ margin: '0 0 14px', fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)' }}>
                  Permanently delete this project and every draft, entity, and run it contains. This cannot be undone.
                </p>
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
