import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Alert, Button, Dialog, EmptyState, FormField, IconButton, Input, Select, Skeleton, Spinner, toast, Tooltip } from '@shadow-library/ui';

import { CheckIcon, CloseIcon, CopyIcon, DownloadIcon, ResetIcon, SparkIcon } from '@/components/icons';
import { PageContainer, SectionCard, StatusChip, StopButton } from '@/components/nf';
import { ImageUpload } from '@/components/nf/ImageUpload';
import {
  type CostBreakdownItem,
  type GenerationJobItem,
  projectCostQueryOptions,
  projectStatusQueryOptions,
  type ResetBody,
  translationJobActive,
  useCloneProjectMutation,
  useDeleteCoverMutation,
  useDraftSummaryQuery,
  useJobStop,
  useListBriefsQuery,
  useListJobsQuery,
  useListProposalsQuery,
  useListRunsQuery,
  useListVolumesQuery,
  useProjectCostQuery,
  useProjectQuery,
  useProjectStatusQuery,
  useResetProjectMutation,
  useReviewQueueQuery,
  useRunStop,
  useTranslationStatusQuery,
  useUploadCoverMutation,
  type WorkflowRunDetailResponse,
} from '@/lib/apis';
import { LIFECYCLE_PHASES, lifecyclePhase, projectKindIntent, projectKindLabel, projectKindTag, projectTitle, relativeTime, translationLifecycle } from '@/lib/format';
import { computeNextStep, deriveNextStepInput, type NextStepTarget } from '@/lib/next-step';

import styles from './overview.module.css';

export const Route = createFileRoute('/novels/$novelId/overview')({
  loader: async ({ context, params }) => {
    await Promise.all([context.queryClient.prefetchQuery(projectStatusQueryOptions(params.novelId)), context.queryClient.prefetchQuery(projectCostQueryOptions(params.novelId))]);
  },
  component: OverviewScreen,
});

interface LifecycleStepperProps {
  labels: readonly string[];
  completed: number;
}

function LifecycleStepper({ labels, completed }: LifecycleStepperProps): React.JSX.Element {
  return (
    <div className={styles.stepper}>
      {labels.map((label, i) => {
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
  usage: CostBreakdownItem;
  maxTokens: number;
}

function roleLabel(role: string): string {
  return role.replace(/^bible:/, '');
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function RoleBar({ usage, maxTokens }: RoleBarProps): React.JSX.Element {
  const tokens = usage.inputTokens + usage.outputTokens;
  const pct = maxTokens > 0 ? Math.max(4, Math.round((tokens / maxTokens) * 100)) : 4;
  const cost = usage.costUsd > 0 ? ` · ${formatUsd(usage.costUsd)}` : '';
  const tip = `${usage.key} · ${usage.calls} call${usage.calls === 1 ? '' : 's'} · ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out${cost}`;
  return (
    <Tooltip content={tip}>
      <div className={styles.barCol}>
        <div className={styles.barTrack}>
          <div className={styles.barFill} style={{ '--pct': `${pct}%` } as React.CSSProperties} />
        </div>
        <span className={styles.barLabel}>{roleLabel(usage.key)}</span>
      </div>
    </Tooltip>
  );
}

interface ModelCostTableProps {
  models: CostBreakdownItem[];
}

function ModelCostTable({ models }: ModelCostTableProps): React.JSX.Element {
  return (
    <table className={styles.costTable}>
      <thead>
        <tr>
          <th>Model</th>
          <th>Calls</th>
          <th>Tokens in / out</th>
          <th>Cost</th>
        </tr>
      </thead>
      <tbody>
        {models.map(model => (
          <tr key={model.key}>
            <td>{model.label}</td>
            <td>{model.calls.toLocaleString()}</td>
            <td>
              {model.inputTokens.toLocaleString()} / {model.outputTokens.toLocaleString()}
            </td>
            <td>
              {formatUsd(model.costUsd)}
              {model.estimatedCostUsd > 0 && <span className={styles.estimateMark}>*</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
  novelId: string;
  run: WorkflowRunDetailResponse;
}

function RunRow({ novelId, run }: RunRowProps): React.JSX.Element {
  const runStop = useRunStop(novelId);
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
      {run.status === 'running' && <StopButton onStop={() => runStop.stop(run.id)} stopping={runStop.stopping} />}
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
  novelId: string;
  job: GenerationJobItem;
  onDismiss?: () => void;
}

function ImportJobBanner({ novelId, job, onDismiss }: ImportJobBannerProps): React.JSX.Element {
  const jobStop = useJobStop(novelId);
  const progress = (job.progress ?? null) as ImportJobProgress | null;
  const pct = progress?.total ? Math.round(((progress.done ?? 0) / progress.total) * 100) : null;
  const active = job.status === 'pending' || job.status === 'in_progress';
  const failed = job.status === 'failed';
  const cancelled = job.status === 'cancelled';
  const title = cancelled ? 'Import stopped' : failed ? 'Import failed' : 'Importing novel';

  return (
    <SectionCard className={styles.sectionSpacer}>
      <div className={styles.progressHead}>
        <h3 className={styles.usageTitle}>{title}</h3>
        <div className={styles.progressHeadActions}>
          <StatusChip intent={failed ? 'danger' : cancelled ? 'neutral' : 'info'}>
            {active && <Spinner size="sm" />}
            {failed ? 'failed' : cancelled ? 'cancelled' : (IMPORT_PHASE_LABEL[progress?.phase ?? ''] ?? 'working')}
          </StatusChip>
          {active && <StopButton onStop={() => jobStop.stop(job.id)} stopping={jobStop.stopping} />}
          {onDismiss && <IconButton size="sm" variant="ghost" aria-label="Dismiss" icon={<CloseIcon size={14} />} onClick={onDismiss} />}
        </div>
      </div>
      {active && progress && (
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
      {cancelled && (
        <p className={styles.progressLabel}>
          {progress?.done
            ? `${progress.done} of ${progress.total ?? '?'} chapters were inserted before stopping — nothing already written was undone.`
            : 'Stopped before any chapters landed.'}{' '}
          Re-import the bundle to pick up where this left off.
        </p>
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
  const costQuery = useProjectCostQuery(novelId);
  const runsQuery = useListRunsQuery(novelId);
  const isTranslation = projectQuery.data?.kind === 'translation';
  // The Next step rule engine only covers the bible → plan → draft → arc → finalize pipeline, which is
  // shared by these two kinds; translation and curated projects keep the simpler fallback below.
  const isAuthoring = projectQuery.data?.kind === 'new_novel' || projectQuery.data?.kind === 'source';
  const translationQuery = useTranslationStatusQuery(novelId, isTranslation);
  const reviewQueueQuery = useReviewQueueQuery(novelId, isAuthoring);
  const proposalsQuery = useListProposalsQuery(novelId, { status: 'pending', limit: 50 }, isAuthoring);
  const briefsQuery = useListBriefsQuery(novelId, isAuthoring);
  const volumesQuery = useListVolumesQuery(novelId, { limit: 50 }, isAuthoring);
  const draftsQuery = useDraftSummaryQuery(novelId, isAuthoring);
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
  const cost = costQuery.data;
  const runs = runsQuery.data?.items ?? [];
  const translation = translationQuery.data;
  const phase = isTranslation
    ? translationLifecycle(translation && { counts: translation.counts, glossary: translation.glossary, jobActive: translationJobActive(translation) })
    : lifecyclePhase(status, project?.kind);
  const isSource = project?.kind === 'source';

  const volumesTotal = status?.volumesTotal ?? 0;
  const draftsTotal = status?.draftsTotal ?? 0;
  const draftsFinal = status?.draftsFinal ?? 0;
  const allFinal = draftsTotal > 0 && draftsFinal === draftsTotal;

  // Every input the rule engine reads has to have actually arrived — otherwise an empty brief/draft
  // list reads as "nothing outlined" and briefly recommends the wrong action until the real data lands.
  const nextStepReady = !briefsQuery.isLoading && !volumesQuery.isLoading && !reviewQueueQuery.isLoading && !proposalsQuery.isLoading && !draftsQuery.isLoading;
  const nextStep =
    isAuthoring && nextStepReady
      ? computeNextStep(
          deriveNextStepInput({
            volumesTotal,
            planApproved: status?.planApproved ?? false,
            draftsTotal,
            draftsFinal,
            briefs: briefsQuery.data?.items ?? [],
            volumes: volumesQuery.data?.items ?? [],
            draftedChapters: draftsQuery.data?.items ?? [],
            reviewDrafts: reviewQueueQuery.data?.drafts ?? [],
            pendingContinuityCount: reviewQueueQuery.data?.proposals.length ?? 0,
            pendingRefinementCount: proposalsQuery.data?.items.length ?? 0,
          }),
        )
      : undefined;

  // Translation and curated projects have no bible/plan/briefs to reason about, so they keep the
  // original coarse "where in the lifecycle am I" fallback instead of the rule engine above.
  const fallbackStep = !isAuthoring
    ? volumesTotal === 0
      ? { label: 'Open story bible →', to: '/novels/$novelId/story-bible' as const }
      : !status?.planApproved
        ? { label: 'Review & approve plan →', to: '/novels/$novelId/volumes' as const }
        : draftsTotal === 0
          ? { label: 'Start drafting →', to: '/novels/$novelId/chapters' as const }
          : allFinal
            ? { label: 'Review chapters →', to: '/novels/$novelId/chapters' as const }
            : { label: 'Continue drafting →', to: '/novels/$novelId/chapters' as const }
    : undefined;

  const goToNextStepTarget = (target: NextStepTarget): void => {
    switch (target.screen) {
      case 'story-bible':
        navigate({ to: '/novels/$novelId/story-bible', params: { novelId } });
        return;
      case 'volumes':
        navigate({ to: '/novels/$novelId/volumes', params: { novelId }, search: { volume: target.volumeKey } });
        return;
      case 'chapters':
        navigate({ to: '/novels/$novelId/chapters', params: { novelId }, search: { chapter: target.chapter, review: target.review } });
        return;
      case 'review':
        navigate({ to: '/novels/$novelId/review', params: { novelId } });
        return;
      case 'chat':
        navigate({ to: '/novels/$novelId/chat', params: { novelId } });
        return;
    }
  };

  const nextStepAction = nextStep?.next;
  const continueLabel = nextStepAction?.label ?? fallbackStep?.label;
  const onContinue = (): void => {
    if (fallbackStep) navigate({ to: fallbackStep.to, params: { novelId } });
    else if (nextStepAction) goToNextStepTarget(nextStepAction.target);
  };

  const importJob = latestJob(jobsQuery.data?.items ?? [], 'import');

  const roles = [...(cost?.byRole ?? [])].sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens));
  const maxTokens = roles.reduce((m, r) => Math.max(m, r.inputTokens + r.outputTokens), 0);

  const doClone = (): void => {
    if (!cloneName.trim()) return;
    cloneProject.mutate(
      { name: cloneName.trim() },
      {
        onSuccess: created => {
          toast.success(`Cloned to “${created.title || created.name}”`);
          setCloneOpen(false);
          setCloneName('');
          navigate({ to: '/novels/$novelId', params: { novelId: created.id } });
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
          {importJob &&
            importJob.id !== dismissedImportJobId &&
            (importJob.status === 'pending' || importJob.status === 'in_progress' || importJob.status === 'failed' || importJob.status === 'cancelled') && (
              <ImportJobBanner
                novelId={novelId}
                job={importJob}
                onDismiss={importJob.status === 'failed' || importJob.status === 'cancelled' ? () => setDismissedImportJobId(importJob.id) : undefined}
              />
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
                <StatusChip intent={projectKindIntent(project.kind)}>{projectKindTag(project.kind)} project</StatusChip>
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
              <Tooltip content="Compose a cover from the story bible">
                <IconButton
                  variant="secondary"
                  aria-label="Generate cover"
                  icon={<SparkIcon />}
                  onClick={() => navigate({ to: '/novels/$novelId/illustrations', params: { novelId }, search: { subject: 'cover', start: true } })}
                />
              </Tooltip>
              <Tooltip content="Clone project">
                <IconButton variant="secondary" aria-label="Clone project" icon={<CopyIcon />} onClick={() => setCloneOpen(true)} />
              </Tooltip>
              <Tooltip content="Reset derived state">
                <IconButton variant="secondary" aria-label="Reset project" icon={<ResetIcon />} onClick={() => setResetOpen(true)} />
              </Tooltip>
              {continueLabel && (
                <Button variant="primary" onClick={onContinue}>
                  {continueLabel}
                </Button>
              )}
            </div>
          </div>

          {LIFECYCLE_PHASES[project.kind].length > 0 && (
            <SectionCard className={styles.sectionSpacer}>
              <LifecycleStepper labels={LIFECYCLE_PHASES[project.kind]} completed={phase.completed} />
            </SectionCard>
          )}

          {isAuthoring && (
            <SectionCard className={styles.sectionSpacer}>
              {nextStepReady ? (
                <>
                  <div className={styles.nextStepRow}>
                    <div className={styles.nextStepBody}>
                      <h3 className={styles.usageTitle}>Next step</h3>
                      <p className={styles.nextStepReason}>{nextStepAction?.reason ?? 'Nothing needs your attention right now.'}</p>
                    </div>
                    {nextStepAction && (
                      <Button variant="primary" onClick={() => goToNextStepTarget(nextStepAction.target)}>
                        {nextStepAction.label}
                      </Button>
                    )}
                  </div>
                  {nextStep && nextStep.comingUp.length > 0 && (
                    <div className={styles.comingUp}>
                      <div className={styles.comingUpLabel}>Coming up</div>
                      <ul className={styles.comingUpList}>
                        {nextStep.comingUp.map(item => (
                          <li key={item.id} className={styles.comingUpItem}>
                            <span className={styles.comingUpDot} />
                            {item.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.nextStepRow}>
                  <div className={styles.nextStepBody}>
                    <h3 className={styles.usageTitle}>Next step</h3>
                    <Skeleton width={280} height={14} />
                  </div>
                  <Skeleton shape="rect" width={140} height={36} radius={8} />
                </div>
              )}
            </SectionCard>
          )}

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
                  <div className={styles.usageCost}>{formatUsd(cost?.totalCostUsd ?? 0)}</div>
                  <div className={styles.usageSub}>
                    {formatUsd(cost?.last7DaysCostUsd ?? 0)} last 7 days · {formatUsd(cost?.last30DaysCostUsd ?? 0)} last 30
                  </div>
                </div>
              </div>
              {roles.length > 0 && (
                <div className={styles.bars}>
                  {roles.map(r => (
                    <RoleBar key={r.key} usage={r} maxTokens={maxTokens} />
                  ))}
                </div>
              )}
              <div className={styles.tokenGrid}>
                <div>
                  <div className={styles.tokenLabel}>Input tokens</div>
                  <div className={styles.tokenValue}>{(cost?.inputTokens ?? 0).toLocaleString()}</div>
                </div>
                <div>
                  <div className={styles.tokenLabel}>Output tokens</div>
                  <div className={styles.tokenValue}>{(cost?.outputTokens ?? 0).toLocaleString()}</div>
                </div>
                <div>
                  <div className={styles.tokenLabel}>Model calls</div>
                  <div className={styles.tokenValue}>{(cost?.calls ?? 0).toLocaleString()}</div>
                </div>
              </div>
              {cost && cost.byModel.length > 0 && <ModelCostTable models={cost.byModel} />}
              {cost && cost.estimatedCostUsd > 0 && (
                <p className={styles.estimateNote}>
                  <span className={styles.estimateMark}>*</span> Includes {formatUsd(cost.estimatedCostUsd)} estimated from list prices for calls that recorded no cost.
                </p>
              )}
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
                    <RunRow key={run.id} novelId={novelId} run={run} />
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
