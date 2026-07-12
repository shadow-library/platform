/**
 * Importing npm packages
 */
import { Button, IconButton, Spinner, Tooltip, toast } from '@shadow-library/ui';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef } from 'react';

/**
 * Importing user defined modules
 */
import { EditIcon, ResetIcon, SearchIcon, SourceIcon } from '@/components/icons';
import { PageHeader, QueryState, StatusChip, type ChipIntent } from '@/components/nf';
import {
  type ChapterListResponse,
  type GenerationJobItem,
  useConsolidateMutation,
  useExtractMutation,
  useIngestMutation,
  useListChaptersQuery,
  useListJobsQuery,
  useProjectQuery,
  useProjectStatusQuery,
  useResumeMutation,
  useSkeletonMutation,
} from '@/lib/apis';

import styles from './source.module.css';

export const Route = createFileRoute('/novels/$novelId/source')({
  component: SourceScreen,
});

type StageState = 'done' | 'running' | 'failed' | 'pending';

interface Stage {
  n: number;
  name: string;
  hint: string;
  icon: ReactNode;
  state: StageState;
  progress?: number;
  onRun?: () => void;
}

interface StageChipMeta {
  intent: ChipIntent;
  label: string;
}

const STAGE_CHIP: Record<StageState, StageChipMeta> = {
  done: { intent: 'success', label: 'done' },
  running: { intent: 'info', label: 'running' },
  failed: { intent: 'danger', label: 'failed' },
  pending: { intent: 'neutral', label: 'pending' },
};

interface IngestProgress {
  done?: number;
  phase?: string;
}

function isActiveJob(job: GenerationJobItem | undefined): boolean {
  return job?.status === 'pending' || job?.status === 'in_progress';
}

const CHAPTER_CHIP: Record<string, ChipIntent> = { done: 'success', failed: 'danger', skipped: 'neutral' };

interface StageCardProps {
  stage: Stage;
}

function StageCard({ stage }: StageCardProps): React.JSX.Element {
  const chip = STAGE_CHIP[stage.state];
  return (
    <div className={styles.stageCard} data-state={stage.state}>
      <div className={styles.stageTop}>
        <div className={styles.stageIcon} data-state={stage.state}>
          {stage.icon}
        </div>
        <span className={styles.stageNum}>{stage.n}</span>
      </div>
      <div className={styles.stageName}>{stage.name}</div>
      <div className={styles.stageHint}>{stage.hint}</div>
      {stage.progress != null && (
        <div className={styles.progress}>
          <div className={styles.progressBar} style={{ '--pct': `${stage.progress}%` } as React.CSSProperties} />
        </div>
      )}
      <div className={styles.stageActions}>
        <StatusChip intent={chip.intent}>
          {stage.state === 'running' && <Spinner size="sm" />}
          {chip.label}
        </StatusChip>
        {stage.onRun && stage.state !== 'running' && (
          <Button variant="text" size="sm" onClick={stage.onRun}>
            Run
          </Button>
        )}
      </div>
    </div>
  );
}

interface ChapterRowProps {
  chapter: ChapterListResponse;
}

function ChapterRow({ chapter }: ChapterRowProps): React.JSX.Element {
  return (
    <div className={styles.row}>
      <span className={styles.rowNum}>{String(chapter.number).padStart(2, '0')}</span>
      <span className={styles.rowTitle}>{chapter.title ?? 'Untitled'}</span>
      <span className={styles.rowWords}>{chapter.wordCount?.toLocaleString() ?? '—'}</span>
      <span>
        <StatusChip intent={CHAPTER_CHIP[chapter.status] ?? 'neutral'}>{chapter.status}</StatusChip>
      </span>
      <span className={styles.rowActions}>
        {chapter.url && (
          <Tooltip content="View source">
            <IconButton size="sm" variant="ghost" aria-label="View source" icon={<SearchIcon size={14} />} onClick={() => window.open(chapter.url ?? '', '_blank')} />
          </Tooltip>
        )}
        <Tooltip content="Edit">
          <IconButton size="sm" variant="ghost" aria-label="Edit chapter" icon={<EditIcon size={14} />} />
        </Tooltip>
      </span>
    </div>
  );
}

function SourceScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const statusQuery = useProjectStatusQuery(novelId);
  const projectQuery = useProjectQuery(novelId);
  const chaptersQuery = useListChaptersQuery(novelId, { limit: 200 });
  const jobsQuery = useListJobsQuery(novelId, true, { refetchInterval: 2500 });
  const ingest = useIngestMutation(novelId);
  const extract = useExtractMutation(novelId);
  const consolidate = useConsolidateMutation(novelId);
  const skeleton = useSkeletonMutation(novelId);
  const resume = useResumeMutation(novelId);

  const status = statusQuery.data;
  const project = projectQuery.data;
  const chapters = chaptersQuery.data?.items ?? [];
  const total = status?.chaptersTotal ?? chapters.length;
  const extracted = status?.chaptersExtracted ?? chapters.filter(c => c.status === 'done').length;

  const ingestJob = (jobsQuery.data?.items ?? []).filter(j => j.kind === 'ingest' || j.kind === 'resume').sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0];
  const ingestActive = isActiveJob(ingestJob);
  const ingestProgress = (ingestJob?.progress ?? null) as IngestProgress | null;

  // While a scrape runs, keep the chapter list and counters live; when it lands, one final refresh
  // picks up scrapeComplete and whatever the recombine/retitle passes changed.
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !ingestActive) queryClient.invalidateQueries({ queryKey: ['projects', novelId] });
    wasActive.current = ingestActive;
    if (!ingestActive) return;
    const timer = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['projects', novelId, 'chapters'] });
      queryClient.invalidateQueries({ queryKey: ['projects', novelId, 'status'] });
    }, 4000);
    return () => clearInterval(timer);
  }, [ingestActive, novelId, queryClient]);

  const scraped = ingestActive ? (ingestProgress?.done ?? total) : total;
  const ingestState: StageState = project?.scrapeComplete ? 'done' : ingestActive ? 'running' : ingestJob?.status === 'failed' ? 'failed' : 'pending';
  const ingestHint = ingestActive
    ? `${scraped} chapters · ${ingestProgress?.phase === 'recombining' ? 'merging parts…' : 'scraping…'}`
    : ingestState === 'failed'
      ? (ingestJob?.lastError ?? 'ingest failed — run again to resume')
      : ingestState === 'done'
        ? `${total} chapters · complete`
        : total > 0
          ? `${total} chapters so far`
          : 'Not started';

  const runToast = (label: string, err?: string): void => {
    if (err) toast.danger(err);
    else toast.success(`${label} started`);
  };

  const extractState: StageState = total > 0 && extracted >= total ? 'done' : extracted > 0 ? 'running' : 'pending';
  const stages: Stage[] = [
    {
      n: 1,
      name: 'Ingest',
      hint: ingestHint,
      icon: <SourceIcon size={15} />,
      state: ingestState,
      onRun: ingestState === 'done' ? undefined : () => ingest.mutate(undefined, { onSuccess: () => runToast('Ingest'), onError: e => runToast('Ingest', e.message) }),
    },
    {
      n: 2,
      name: 'Extract',
      hint: `${extracted} of ${total} chapters`,
      icon: <SourceIcon size={15} />,
      state: extractState,
      progress: total > 0 ? Math.round((extracted / total) * 100) : 0,
      onRun: () => extract.mutate(undefined, { onSuccess: () => runToast('Extract'), onError: e => runToast('Extract', e.message) }),
    },
    {
      n: 3,
      name: 'Consolidate',
      hint: 'Merge & dedupe entities',
      icon: <ResetIcon size={15} />,
      state: status?.planApproved ? 'done' : 'pending',
      onRun: () => consolidate.mutate(undefined, { onSuccess: () => runToast('Consolidate'), onError: e => runToast('Consolidate', e.message) }),
    },
    { n: 4, name: 'Assets', hint: 'Generated maps & art', icon: <SourceIcon size={15} />, state: 'pending' },
    {
      n: 5,
      name: 'Skeleton',
      hint: 'Structural outline',
      icon: <SourceIcon size={15} />,
      state: (status?.volumesTotal ?? 0) > 0 ? 'done' : 'pending',
      onRun: () => skeleton.mutate(undefined, { onSuccess: () => runToast('Skeleton'), onError: e => runToast('Skeleton', e.message) }),
    },
  ];

  return (
    <div className={`nf-page ${styles.page}`}>
      <PageHeader
        title="Source Pipeline"
        subtitle="Ingest an existing manuscript and turn it into a structured story bible. Each stage can be resumed independently."
        extra={
          <>
            <Button variant="secondary" onClick={() => navigate({ to: '/novels/$novelId/runs', params: { novelId } })}>
              View runs
            </Button>
            <Button
              variant="primary"
              loading={resume.isPending}
              onClick={() => resume.mutate(undefined, { onSuccess: () => runToast('Pipeline'), onError: e => runToast('Pipeline', e.message) })}
            >
              Resume pipeline
            </Button>
          </>
        }
      />

      <div className={styles.stageGrid}>
        {stages.map(stage => (
          <StageCard key={stage.n} stage={stage} />
        ))}
      </div>

      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>Source chapters</h3>
        <StatusChip intent="neutral">{total}</StatusChip>
      </div>

      <QueryState
        isLoading={chaptersQuery.isLoading}
        error={chaptersQuery.error}
        isEmpty={chapters.length === 0}
        emptyTitle="No source chapters"
        emptyDescription="Ingest a manuscript to populate this list."
      >
        <div className={styles.table}>
          <div className={styles.headerRow}>
            <span>#</span>
            <span>Title</span>
            <span>Words</span>
            <span>Extract</span>
            <span className={styles.headerActions}>Actions</span>
          </div>
          {chapters.map(chapter => (
            <ChapterRow key={chapter.id} chapter={chapter} />
          ))}
        </div>
      </QueryState>
    </div>
  );
}
