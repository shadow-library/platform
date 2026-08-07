import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Alert, Button, Dialog, EmptyState, FormField, IconButton, Input, Select, Spinner, toast, Tooltip } from '@shadow-library/ui';

import { CheckIcon, CloseIcon, CopyIcon, DownloadIcon, ResetIcon } from '@/components/icons';
import { PageContainer, SectionCard, StatusChip } from '@/components/nf';
import { ImageUpload } from '@/components/nf/ImageUpload';
import {
  aiUsageQueryOptions,
  type GenerationJobItem,
  projectStatusQueryOptions,
  type ResetBody,
  type RoleUsage,
  useAiUsageQuery,
  useCloneProjectMutation,
  useDeleteCoverMutation,
  useListJobsQuery,
  useListRunsQuery,
  useProjectQuery,
  useProjectStatusQuery,
  useResetProjectMutation,
  useUploadCoverMutation,
  type WorkflowRunDetailResponse,
} from '@/lib/apis';
import { LIFECYCLE_PHASES, lifecyclePhase, projectKindLabel, projectKindTag, projectTitle, relativeTime } from '@/lib/format';

import styles from './overview.module.css';

export const Route = createFileRoute('/novels/$novelId/overview')({
  loader: async ({ context, params }) => {
    await Promise.all([context.queryClient.prefetchQuery(projectStatusQueryOptions(params.novelId)), context.queryClient.prefetchQuery(aiUsageQueryOptions(params.novelId))]);
  },
  component: OverviewScreen,
});

interface NextStep {
  label: string;
  to: '/novels/$novelId/story-bible' | '/novels/$novelId/volumes' | '/novels/$novelId/chapters';
}

interface LifecycleStepperProps {
  completed: number;
}

function LifecycleStepper({ completed }: LifecycleStepperProps): React.JSX.Element {
  return (
    <div className={styles.stepper}>
      {LIFECYCLE_PHASES.map((label, i) => {
        const state = i < completed ? 'done' : i === completed ? 'current' : 'pending';
        return (
          <div key={label} className={styles.stepContents}>
            {i > 0 && <div className={styles.connector} data-lit={i <= completed} />}
            <div className={styles.step}>
              <div className={styles.stepDot} data-state={state}>
                {state === 'done' ? <CheckIcon size={16} strokeWidth={2.6} /> : i + 1}
              </div>
              <span className={styles.stepLabel} data-state={state}>
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
    <div className={styles.statCard}>
      <div className={styles.statCardLabel}>{label}</div>
      {children}
      {footer && <div className={styles.statCardFooter}>{footer}</div>}
    </div>
  );
}

interface RoleBarProps {
  usage: RoleUsage;
  maxTokens: number;
}

function roleLabel(role: string): string {
  return role.replace(/^bible:/, '');
}

function RoleBar({ usage, maxTokens }: RoleBarProps): React.JSX.Element {
  const tokens = usage.inputTokens + usage.outputTokens;
  const pct = maxTokens > 0 ? Math.max(4, Math.round((tokens / maxTokens) * 100)) : 4;
  const cost = usage.costUsd > 0 ? ` · $${usage.costUsd.toFixed(2)}` : '';
  const tip = `${usage.role} · ${usage.calls} call${usage.calls === 1 ? '' : 's'} · ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out${cost}`;
  return (
    <Tooltip content={tip}>
      <div className={styles.barCol}>
        <div className={styles.barTrack}>
          <div className={styles.barFill} style={{ '--pct': `${pct}%` } as React.CSSProperties} />
        </div>
        <span className={styles.barLabel}>{roleLabel(usage.role)}</span>
      </div>
    </Tooltip>
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
    <div className={styles.runRow}>
      {run.status === 'running' ? <Spinner size="sm" /> : <span className={styles.runDot} style={{ '--nf-dot': intent.color } as React.CSSProperties} />}
      <div className={styles.runBody}>
        <div className={styles.runTitle}>
          {run.graph} · {run.target}
        </div>
        <div className={styles.runMeta}>
          {intent.label} · {relativeTime(run.endedAt ?? run.startedAt)}
        </div>
      </div>
    </div>
  );
}

function latestJob(items: GenerationJobItem[], kind: GenerationJobItem['kind']): GenerationJobItem | undefined {
  return items.filter(j => j.kind === kind).sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0];
}

function jobIsActive(job: GenerationJobItem | undefined): boolean {
  return job?.status === 'pending' || job?.status === 'in_progress';
}

interface ImportJobProgress {
  phase?: string;
  done?: number;
  total?: number;
  current?: string;
}

const IMPORT_PHASE_LABEL: Record<string, string> = {
  inserting: 'Inserting chapters',
  recombining: 'Merging split chapters',
};

interface ImportJobBannerProps {
  job: GenerationJobItem;
  onDismiss?: () => void;
}

function ImportJobBanner({ job, onDismiss }: ImportJobBannerProps): React.JSX.Element {
  const progress = (job.progress ?? null) as ImportJobProgress | null;
  const pct = progress?.total ? Math.round(((progress.done ?? 0) / progress.total) * 100) : null;
  const failed = job.status === 'failed';

  return (
    <SectionCard className={styles.sectionSpacer}>
      <div className={styles.progressHead}>
        <h3 className={styles.usageTitle}>{failed ? 'Import failed' : 'Importing novel'}</h3>
        <div className={styles.progressHeadActions}>
          <StatusChip intent={failed ? 'danger' : 'info'}>
            {!failed && <Spinner size="sm" />}
            {failed ? 'failed' : (IMPORT_PHASE_LABEL[progress?.phase ?? ''] ?? 'working')}
          </StatusChip>
          {onDismiss && <IconButton size="sm" variant="ghost" aria-label="Dismiss" icon={<CloseIcon size={14} />} onClick={onDismiss} />}
        </div>
      </div>
      {!failed && progress && (
        <div className={styles.progressRow}>
          <span className={styles.progressLabel}>
            {progress.phase === 'inserting' && progress.current !== 'chapters'
              ? `Chapter ${progress.current} · ${progress.done} of ${progress.total}`
              : `${progress.done ?? 0} of ${progress.total ?? '?'}`}
          </span>
          {pct !== null && (
            <div className={styles.progressTrack}>
              <div className={styles.progressBar} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      )}
      {failed && job.lastError && <p className={styles.error}>{job.lastError}</p>}
    </SectionCard>
  );
}

function OverviewScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const navigate = useNavigate();
  const projectQuery = useProjectQuery(novelId);
  const statusQuery = useProjectStatusQuery(novelId);
  const usageQuery = useAiUsageQuery(novelId);
  const runsQuery = useListRunsQuery(novelId);
  // Only the `import` job needs live polling here (it's the one this screen surfaces progress for); once
  // it settles — or there never was one — stop, rather than polling this project's jobs forever on every
  // overview visit.
  const jobsQuery = useListJobsQuery(novelId, true, {
    refetchInterval: query => (jobIsActive(latestJob(query.state.data?.items ?? [], 'import')) ? 2500 : false),
  });
  const cloneProject = useCloneProjectMutation(novelId);
  const resetProject = useResetProjectMutation(novelId);
  const uploadCover = useUploadCoverMutation(novelId);
  const removeCover = useDeleteCoverMutation(novelId);

  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStage, setResetStage] = useState<ResetBody['stage']>('generate');
  const [dismissedImportJobId, setDismissedImportJobId] = useState<string | null>(null);

  const project = projectQuery.data;
  const status = statusQuery.data;
  const usage = usageQuery.data;
  const runs = runsQuery.data?.items ?? [];
  const phase = lifecyclePhase(status);
  const isSource = project?.kind === 'source';

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

  const importJob = latestJob(jobsQuery.data?.items ?? [], 'import');

  const roles = usage?.roles ?? [];
  const maxTokens = roles.reduce((m, r) => Math.max(m, r.inputTokens + r.outputTokens), 0);
  const totalCalls = roles.reduce((s, r) => s + r.calls, 0);

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
    <PageContainer>
      {projectQuery.isLoading ? (
        <div className={styles.loading}>
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
          {importJob && importJob.id !== dismissedImportJobId && (importJob.status === 'pending' || importJob.status === 'in_progress' || importJob.status === 'failed') && (
            <ImportJobBanner job={importJob} onDismiss={importJob.status === 'failed' ? () => setDismissedImportJobId(importJob.id) : undefined} />
          )}
          <div className={styles.header}>
            <ImageUpload
              className={styles.headerCover}
              src={project.coverUrl ?? undefined}
              alt={`${projectTitle(project)} cover`}
              uploading={uploadCover.isPending || removeCover.isPending}
              onUpload={body => uploadCover.mutate(body, { onSuccess: () => toast.success('Cover updated'), onError: e => toast.danger(e.message) })}
              onRemove={() => removeCover.mutate(undefined, { onSuccess: () => toast.success('Cover removed'), onError: e => toast.danger(e.message) })}
            />
            <div className={styles.headerMain}>
              <div className={styles.kindRow}>
                <StatusChip intent={isSource ? 'info' : 'accent'}>{projectKindTag(project.kind)} project</StatusChip>
                <span className={styles.created}>
                  {projectKindLabel(project.kind)} · created {new Date(project.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <h1 className={styles.projectTitle}>{projectTitle(project)}</h1>
              {project.brief && <p className={styles.brief}>{project.brief}</p>}
            </div>
            <div className={styles.headerActions}>
              <Tooltip content="Export as a .novel package">
                <IconButton
                  variant="secondary"
                  aria-label="Export .novel package"
                  icon={<DownloadIcon />}
                  onClick={() => {
                    // A same-origin GET whose Content-Disposition drives the browser's download; the API
                    // client only speaks JSON, so navigate to the endpoint directly.
                    window.location.assign(`/api/v1/projects/${novelId}/export/novel`);
                  }}
                />
              </Tooltip>
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

          <SectionCard className={styles.sectionSpacer}>
            <LifecycleStepper completed={phase.completed} />
          </SectionCard>

          <div className={styles.statGrid}>
            <StatCard label="Chapters">
              <div className={styles.statBig}>
                <span className={styles.statNum}>{status?.chaptersExtracted ?? 0}</span>
                <span className={styles.statUnit}>
                  / {status?.chaptersTotal ?? 0} {isSource ? 'extracted' : 'planned'}
                </span>
              </div>
            </StatCard>
            <StatCard label="Volumes" footer={<StatusChip intent="info">{status?.volumesTotal ?? 0} total</StatusChip>}>
              <div className={styles.statBig}>
                <span className={styles.statNum}>{status?.volumesTotal ?? 0}</span>
                <span className={styles.statUnit}>total</span>
              </div>
            </StatCard>
            <StatCard label="Drafts">
              <div className={styles.statBig}>
                <span className={styles.statNum}>{status?.draftsFinal ?? 0}</span>
                <span className={styles.statUnit}>/ {status?.draftsTotal ?? 0} final</span>
              </div>
            </StatCard>
            <StatCard label="Plan status">
              <div className={styles.planRow}>
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

          <div className={styles.mainGrid}>
            <SectionCard>
              <div className={styles.usageHead}>
                <div>
                  <h3 className={styles.usageTitle}>AI Usage &amp; Cost</h3>
                  <p className={styles.usageSub}>Tokens per role · all runs · hover a bar for detail</p>
                </div>
                <div className={styles.usageCostWrap}>
                  <div className={styles.usageCost}>${(usage?.totalCostUsd ?? 0).toFixed(2)}</div>
                </div>
              </div>
              {roles.length > 0 && (
                <div className={styles.bars}>
                  {roles.map(r => (
                    <RoleBar key={r.role} usage={r} maxTokens={maxTokens} />
                  ))}
                </div>
              )}
              <div className={styles.tokenGrid}>
                <div>
                  <div className={styles.tokenLabel}>Input tokens</div>
                  <div className={styles.tokenValue}>{(usage?.totalInputTokens ?? 0).toLocaleString()}</div>
                </div>
                <div>
                  <div className={styles.tokenLabel}>Output tokens</div>
                  <div className={styles.tokenValue}>{(usage?.totalOutputTokens ?? 0).toLocaleString()}</div>
                </div>
                <div>
                  <div className={styles.tokenLabel}>Model calls</div>
                  <div className={styles.tokenValue}>{totalCalls.toLocaleString()}</div>
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
                <p className={styles.emptyRuns}>No runs yet.</p>
              ) : (
                <div>
                  {runs.slice(0, 5).map(run => (
                    <RunRow key={run.id} run={run} />
                  ))}
                </div>
              )}
            </SectionCard>
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
    </PageContainer>
  );
}
