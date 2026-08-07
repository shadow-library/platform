import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef } from 'react';
import { Button, IconButton, Spinner, toast, Tooltip } from '@shadow-library/ui';

import { EditIcon, ResetIcon, SourceIcon } from '@/components/icons';
import { type ChipIntent, PageHeader, QueryState, StatusChip } from '@/components/nf';
import {
  type ChapterListResponse,
  listChaptersQueryOptions,
  projectStatusQueryOptions,
  useConsolidateMutation,
  useExtractMutation,
  useListChaptersQuery,
  useListJobsQuery,
  useProjectStatusQuery,
  useSkeletonMutation,
} from '@/lib/apis';

import styles from './source.module.css';

export const Route = createFileRoute('/novels/$novelId/source')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(listChaptersQueryOptions(params.novelId, { limit: 200 })),
      context.queryClient.prefetchQuery(projectStatusQueryOptions(params.novelId)),
    ]);
  },
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
  const chaptersQuery = useListChaptersQuery(novelId, { limit: 200 });
  const jobsQuery = useListJobsQuery(novelId, true, { refetchInterval: 2500 });
  const extract = useExtractMutation(novelId);
  const consolidate = useConsolidateMutation(novelId);
  const skeleton = useSkeletonMutation(novelId);

  const status = statusQuery.data;
  const chapters = chaptersQuery.data?.items ?? [];
  const total = status?.chaptersTotal ?? chapters.length;
  const extracted = status?.chaptersExtracted ?? chapters.filter(c => c.status === 'done').length;

  // Only `import` (chapters still landing/recombining right after the bundle lands) and `extract` (the
  // one background job this screen's own actions enqueue — consolidate/skeleton are synchronous) can
  // change what this screen shows. Other kinds (e.g. an hours-long `generate` run elsewhere in the
  // project) shouldn't re-trigger this screen's own refresh loop.
  const jobActive = (jobsQuery.data?.items ?? []).some(j => (j.kind === 'import' || j.kind === 'extract') && (j.status === 'pending' || j.status === 'in_progress'));
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !jobActive) queryClient.invalidateQueries({ queryKey: ['projects', novelId] });
    wasActive.current = jobActive;
    if (!jobActive) return;
    const timer = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['projects', novelId, 'chapters'] });
      queryClient.invalidateQueries({ queryKey: ['projects', novelId, 'status'] });
    }, 4000);
    return () => clearInterval(timer);
  }, [jobActive, novelId, queryClient]);

  const runToast = (label: string, err?: string): void => {
    if (err) toast.danger(err);
    else toast.success(`${label} started`);
  };

  const extractState: StageState = total > 0 && extracted >= total ? 'done' : extracted > 0 ? 'running' : 'pending';
  const stages: Stage[] = [
    {
      n: 1,
      name: 'Extract',
      hint: `${extracted} of ${total} chapters`,
      icon: <SourceIcon size={15} />,
      state: extractState,
      progress: total > 0 ? Math.round((extracted / total) * 100) : 0,
      onRun: () => extract.mutate(undefined, { onSuccess: () => runToast('Extract'), onError: e => runToast('Extract', e.message) }),
    },
    {
      n: 2,
      name: 'Consolidate',
      hint: 'Merge & dedupe entities',
      icon: <ResetIcon size={15} />,
      state: status?.planApproved ? 'done' : 'pending',
      onRun: () => consolidate.mutate(undefined, { onSuccess: () => runToast('Consolidate'), onError: e => runToast('Consolidate', e.message) }),
    },
    { n: 3, name: 'Assets', hint: 'Generated maps & art', icon: <SourceIcon size={15} />, state: 'pending' },
    {
      n: 4,
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
        subtitle="Turn imported source chapters into a structured story bible. Each stage can be re-run independently."
        extra={
          <Button variant="secondary" onClick={() => navigate({ to: '/novels/$novelId/runs', params: { novelId } })}>
            View runs
          </Button>
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
        emptyDescription="Source chapters arrive through a novel-import bundle — this project has none yet."
        emptyAction={{ label: 'Import novel', onClick: () => navigate({ to: '/import' }) }}
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
