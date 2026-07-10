/**
 * Importing npm packages
 */
import { Alert, Button, Dialog, EmptyState, FormField, IconButton, Input, Select, Spinner, Tooltip, toast } from '@shadow-library/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

/**
 * Importing user defined modules
 */
import { BookIcon, CheckIcon, CloseIcon, CopyIcon, ListIcon, ProposalsIcon, ResetIcon } from '@/components/icons';
import { SectionCard, StatusChip } from '@/components/nf';
import {
  type ResetBody,
  type WorkflowRunDetailResponse,
  useAiUsageQuery,
  useCloneProjectMutation,
  useListRunsQuery,
  useProjectQuery,
  useProjectStatusQuery,
  useResetProjectMutation,
} from '@/lib/apis';
import { LIFECYCLE_PHASES, lifecyclePhase, projectKindLabel, projectKindTag, projectTitle, relativeTime } from '@/lib/format';

export const Route = createFileRoute('/novels/$novelId/overview')({
  component: OverviewScreen,
});

// The primary CTA target — the next actionable screen derived from real status counts.
interface NextStep {
  label: string;
  to: '/novels/$novelId/story-bible' | '/novels/$novelId/volumes' | '/novels/$novelId/chapters';
}

interface LifecycleStepperProps {
  completed: number;
}

function LifecycleStepper({ completed }: LifecycleStepperProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {LIFECYCLE_PHASES.map((label, i) => {
        const done = i < completed;
        const current = i === completed;
        return (
          <div key={label} style={{ display: 'contents' }}>
            {i > 0 && <div style={{ flex: 1, height: 2, background: i <= completed ? 'var(--sh-success-solid)' : 'var(--sh-bg-pressed)', margin: '0 6px 22px' }} />}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  background: done ? 'var(--sh-success-solid)' : current ? 'var(--sh-accent)' : 'var(--sh-surface-well)',
                  color: done ? 'var(--sh-success-on-solid)' : current ? 'var(--sh-on-accent)' : 'var(--sh-text-tertiary)',
                  border: done || current ? 'none' : '1.5px solid var(--sh-border-default)',
                  boxShadow: current ? '0 0 0 4px var(--sh-accent-soft)' : undefined,
                }}
              >
                {done ? <CheckIcon size={16} strokeWidth={2.6} /> : i + 1}
              </div>
              <span
                style={{
                  fontSize: 'var(--sh-text-body-sm)',
                  fontWeight: current ? 700 : done ? 600 : 500,
                  color: current ? 'var(--sh-accent)' : done ? 'var(--sh-text-primary)' : 'var(--sh-text-tertiary)',
                }}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface StatCardProps {
  label: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

function StatCard({ label, children, footer }: StatCardProps): React.JSX.Element {
  return (
    <div style={{ background: 'var(--sh-surface-card)', border: '1px solid var(--sh-border-subtle)', borderRadius: 'var(--sh-radius-lg)', padding: '16px 18px' }}>
      <div style={{ fontSize: 'var(--sh-text-caption)', color: 'var(--sh-text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{label}</div>
      {children}
      {footer && <div style={{ marginTop: 10 }}>{footer}</div>}
    </div>
  );
}

interface BarProps {
  value: number;
  max: number;
}

function Bar({ value, max }: BarProps): React.JSX.Element {
  const pct = max > 0 ? Math.max(6, Math.round((value / max) * 100)) : 6;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
      <div style={{ height: `${pct}%`, background: 'var(--sh-indigo-400)', borderRadius: '3px 3px 0 0' }} />
    </div>
  );
}

interface RunIntentMeta {
  color: string;
  label: string;
}

const RUN_INTENT: Record<string, RunIntentMeta> = {
  running: { color: 'var(--sh-info-solid)', label: 'running' },
  completed: { color: 'var(--sh-success-solid)', label: 'completed' },
  awaiting_review: { color: 'var(--sh-warning-solid)', label: 'awaiting review' },
  failed: { color: 'var(--sh-danger-solid)', label: 'failed' },
  cancelled: { color: 'var(--sh-text-tertiary)', label: 'cancelled' },
};

interface RunRowProps {
  run: WorkflowRunDetailResponse;
}

function RunRow({ run }: RunRowProps): React.JSX.Element {
  const intent = RUN_INTENT[run.status] ?? { color: 'var(--sh-text-tertiary)', label: run.status };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--sh-border-subtle)' }}>
      {run.status === 'running' ? <Spinner size="sm" /> : <span style={{ width: 10, height: 10, borderRadius: '50%', background: intent.color, flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {run.graph} · {run.target}
        </div>
        <div style={{ fontSize: 10, color: 'var(--sh-text-tertiary)' }}>
          {intent.label} · {relativeTime(run.endedAt ?? run.startedAt)}
        </div>
      </div>
    </div>
  );
}

interface QuickLinkProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}

function QuickLink({ icon, title, subtitle, onClick }: QuickLinkProps): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="nf-cardhover"
      style={{ textAlign: 'left', background: 'var(--sh-surface-card)', border: '1px solid var(--sh-border-subtle)', borderRadius: 'var(--sh-radius-lg)', padding: 16, cursor: 'pointer' }}
    >
      <span style={{ color: 'var(--sh-accent)', display: 'inline-flex' }}>{icon}</span>
      <div style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 600, marginTop: 10 }}>{title}</div>
      <div style={{ fontSize: 'var(--sh-text-caption)', color: 'var(--sh-text-tertiary)', marginTop: 2 }}>{subtitle}</div>
    </button>
  );
}

function OverviewScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const navigate = useNavigate();
  const projectQuery = useProjectQuery(novelId);
  const statusQuery = useProjectStatusQuery(novelId);
  const usageQuery = useAiUsageQuery(novelId);
  const runsQuery = useListRunsQuery(novelId);
  const cloneProject = useCloneProjectMutation(novelId);
  const resetProject = useResetProjectMutation(novelId);

  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStage, setResetStage] = useState<ResetBody['stage']>('generate');

  const project = projectQuery.data;
  const status = statusQuery.data;
  const usage = usageQuery.data;
  const runs = runsQuery.data?.items ?? [];
  const phase = lifecyclePhase(status);
  const isSource = project?.kind === 'source';

  // Route the primary CTA to the actual next actionable step, derived from real status counts rather
  // than always dropping into the (possibly empty) chapters editor.
  const volumesTotal = status?.volumesTotal ?? 0;
  const draftsTotal = status?.draftsTotal ?? 0;
  const draftsFinal = status?.draftsFinal ?? 0;
  const allFinal = draftsTotal > 0 && draftsFinal === draftsTotal;
  const next: NextStep =
    volumesTotal === 0
      ? { label: 'Open story bible →', to: '/novels/$novelId/story-bible' }
      : !status?.planApproved
        ? { label: 'Review & approve plan →', to: '/novels/$novelId/volumes' }
        : draftsTotal === 0
          ? { label: 'Start drafting →', to: '/novels/$novelId/chapters' }
          : allFinal
            ? { label: 'Review chapters →', to: '/novels/$novelId/chapters' }
            : { label: 'Continue drafting →', to: '/novels/$novelId/chapters' };
  const continueLabel = next.label;
  const onContinue = (): void => {
    navigate({ to: next.to, params: { novelId } });
  };

  const callsPerRole = usage?.callsPerRole ?? {};
  const roleEntries = Object.entries(callsPerRole);
  const maxCalls = roleEntries.reduce((m, [, v]) => Math.max(m, v), 0);
  const totalCalls = roleEntries.reduce((s, [, v]) => s + v, 0);

  const doClone = (): void => {
    if (!cloneName.trim()) return;
    cloneProject.mutate(
      { name: cloneName.trim() },
      {
        onSuccess: created => {
          toast.success(`Cloned to “${created.title || created.name}”`);
          setCloneOpen(false);
          setCloneName('');
          navigate({ to: '/novels/$novelId/overview', params: { novelId: created.id } });
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  const doReset = (): void => {
    resetProject.mutate(
      { stage: resetStage },
      {
        onSuccess: () => {
          toast.success(`Reset ${resetStage} artefacts`);
          setResetOpen(false);
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '28px 28px 60px' }}>
      {projectQuery.isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
          <Spinner size="lg" label="Loading" />
        </div>
      ) : projectQuery.error ? (
        <Alert intent="danger" title="Couldn’t reach the backend">
          {projectQuery.error.message}
        </Alert>
      ) : !project ? (
        <EmptyState size="inline" title="Project not found" />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 24 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <StatusChip intent={isSource ? 'info' : 'accent'}>{projectKindTag(project.kind)} project</StatusChip>
                <span style={{ fontSize: 'var(--sh-text-caption)', color: 'var(--sh-text-tertiary)' }}>
                  {projectKindLabel(project.kind)} · created {new Date(project.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <h1 style={{ margin: '0 0 6px', fontSize: 'var(--sh-text-display)', fontWeight: 700, letterSpacing: '-0.025em' }}>{projectTitle(project)}</h1>
              {project.brief && <p style={{ margin: 0, fontSize: 'var(--sh-text-body)', color: 'var(--sh-text-secondary)', maxWidth: 620 }}>{project.brief}</p>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <Tooltip content="Clone project">
                <IconButton variant="secondary" aria-label="Clone project" icon={<CopyIcon />} onClick={() => setCloneOpen(true)} />
              </Tooltip>
              <Tooltip content="Reset derived state">
                <IconButton variant="secondary" aria-label="Reset project" icon={<ResetIcon />} onClick={() => setResetOpen(true)} />
              </Tooltip>
              <Button variant="primary" onClick={onContinue}>
                {continueLabel}
              </Button>
            </div>
          </div>

          <SectionCard style={{ marginBottom: 20 }}>
            <LifecycleStepper completed={phase.completed} />
          </SectionCard>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
            <StatCard label="Chapters">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{status?.chaptersExtracted ?? 0}</span>
                <span style={{ fontSize: 14, color: 'var(--sh-text-tertiary)' }}>
                  / {status?.chaptersTotal ?? 0} {isSource ? 'extracted' : 'planned'}
                </span>
              </div>
            </StatCard>
            <StatCard label="Volumes" footer={<StatusChip intent="info">{status?.volumesTotal ?? 0} total</StatusChip>}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{status?.volumesTotal ?? 0}</span>
                <span style={{ fontSize: 14, color: 'var(--sh-text-tertiary)' }}>total</span>
              </div>
            </StatCard>
            <StatCard label="Drafts">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{status?.draftsFinal ?? 0}</span>
                <span style={{ fontSize: 14, color: 'var(--sh-text-tertiary)' }}>/ {status?.draftsTotal ?? 0} final</span>
              </div>
            </StatCard>
            <StatCard label="Plan status">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                {status?.planApproved ? (
                  <StatusChip intent="success" dot>
                    Approved
                  </StatusChip>
                ) : (
                  <StatusChip intent="neutral" dot>
                    Draft
                  </StatusChip>
                )}
              </div>
            </StatCard>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, marginBottom: 20 }}>
            <SectionCard>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 'var(--sh-text-h3)', fontWeight: 700 }}>AI Usage &amp; Cost</h3>
                  <p style={{ margin: '3px 0 0', fontSize: 'var(--sh-text-caption)', color: 'var(--sh-text-tertiary)' }}>All runs · this project</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>${(usage?.totalCostUsd ?? 0).toFixed(2)}</div>
                </div>
              </div>
              {roleEntries.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 88, marginBottom: 14 }}>
                  {roleEntries.map(([role, v]) => (
                    <Bar key={role} value={v} max={maxCalls} />
                  ))}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, paddingTop: 14, borderTop: '1px solid var(--sh-border-subtle)' }}>
                <div>
                  <div style={{ fontSize: 'var(--sh-text-caption)', color: 'var(--sh-text-tertiary)' }}>Input tokens</div>
                  <div style={{ fontSize: 'var(--sh-text-body-lg)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{(usage?.totalInputTokens ?? 0).toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--sh-text-caption)', color: 'var(--sh-text-tertiary)' }}>Output tokens</div>
                  <div style={{ fontSize: 'var(--sh-text-body-lg)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{(usage?.totalOutputTokens ?? 0).toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--sh-text-caption)', color: 'var(--sh-text-tertiary)' }}>Model calls</div>
                  <div style={{ fontSize: 'var(--sh-text-body-lg)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{totalCalls.toLocaleString()}</div>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Recent runs"
              action={
                <Button variant="text" size="sm" onClick={() => navigate({ to: '/novels/$novelId/runs', params: { novelId } })}>
                  View all
                </Button>
              }
            >
              {runs.length === 0 ? (
                <p style={{ margin: 0, fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-tertiary)' }}>No runs yet.</p>
              ) : (
                <div>
                  {runs.slice(0, 5).map(run => (
                    <RunRow key={run.id} run={run} />
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <h3 style={{ margin: '0 0 12px', fontSize: 'var(--sh-text-h3)', fontWeight: 700 }}>Jump into</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
            <QuickLink icon={<BookIcon size={20} />} title="Story Bible" subtitle="Entities & canon" onClick={() => navigate({ to: '/novels/$novelId/story-bible', params: { novelId } })} />
            <QuickLink icon={<ListIcon size={20} />} title="Volumes & Arcs" subtitle="Structure & briefs" onClick={() => navigate({ to: '/novels/$novelId/volumes', params: { novelId } })} />
            <QuickLink icon={<BookIcon size={20} />} title="Chapters" subtitle="Draft & edit" onClick={() => navigate({ to: '/novels/$novelId/chapters', params: { novelId } })} />
            <QuickLink icon={<ProposalsIcon size={20} />} title="Proposals" subtitle="Canon edits" onClick={() => navigate({ to: '/novels/$novelId/proposals', params: { novelId } })} />
          </div>
        </>
      )}

      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <Dialog.Content size="sm">
          <Dialog.Header title="Clone project" description="Creates a fresh copy you can experiment with." />
          <Dialog.Body>
            <FormField label="New project name" required>
              <Input value={cloneName} onValueChange={setCloneName} placeholder="e.g. The Ashfall Compact (copy)" autoFocus />
            </FormField>
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="primary" loading={cloneProject.isPending} onClick={doClone}>
              Clone
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <Dialog.Content size="sm">
          <Dialog.Header title="Reset derived state" description="This clears generated artefacts up to the chosen stage. It cannot be undone." />
          <Dialog.Body>
            <FormField label="Reset up to stage">
              <Select value={resetStage} onValueChange={v => setResetStage(v as ResetBody['stage'])}>
                <Select.Item value="generate">Generated drafts</Select.Item>
                <Select.Item value="plan">Plan &amp; drafts</Select.Item>
                <Select.Item value="extract">Everything after extract</Select.Item>
                <Select.Item value="all">Everything</Select.Item>
              </Select>
            </FormField>
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost" prefix={<CloseIcon />}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button variant="danger" loading={resetProject.isPending} onClick={doReset}>
              Reset {resetStage}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </div>
  );
}
