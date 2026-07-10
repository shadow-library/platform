/**
 * Importing npm packages
 */
import { Button, IconButton, Spinner, Tooltip, toast } from '@shadow-library/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { type ReactNode } from 'react';

/**
 * Importing user defined modules
 */
import { EditIcon, ResetIcon, SearchIcon, SourceIcon } from '@/components/icons';
import { PageHeader, QueryState, StatusChip, type ChipIntent } from '@/components/nf';
import {
  type ChapterListResponse,
  useConsolidateMutation,
  useExtractMutation,
  useListChaptersQuery,
  useProjectStatusQuery,
  useResumeMutation,
  useSkeletonMutation,
} from '@/lib/apis';

export const Route = createFileRoute('/novels/$novelId/source')({
  component: SourceScreen,
});

type StageState = 'done' | 'running' | 'pending';

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
  pending: { intent: 'neutral', label: 'pending' },
};

const CHAPTER_CHIP: Record<string, ChipIntent> = { done: 'success', failed: 'danger', skipped: 'neutral' };

interface StageCardProps {
  stage: Stage;
}

function StageCard({ stage }: StageCardProps): React.JSX.Element {
  const chip = STAGE_CHIP[stage.state];
  return (
    <div style={{ background: 'var(--sh-surface-card)', border: '1px solid var(--sh-border-subtle)', borderRadius: 'var(--sh-radius-lg)', padding: '15px 15px 13px', opacity: stage.state === 'pending' ? 0.85 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: stage.state === 'done' ? 'var(--sh-success-bg-subtle)' : stage.state === 'running' ? 'var(--sh-info-bg-subtle)' : 'var(--sh-surface-well)',
            color: stage.state === 'done' ? 'var(--sh-success-solid)' : stage.state === 'running' ? 'var(--sh-info-solid)' : 'var(--sh-text-tertiary)',
          }}
        >
          {stage.icon}
        </div>
        <span style={{ fontFamily: 'var(--sh-font-mono)', fontSize: 11, color: 'var(--sh-text-tertiary)' }}>{stage.n}</span>
      </div>
      <div style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 700 }}>{stage.name}</div>
      <div style={{ fontSize: 11, color: 'var(--sh-text-tertiary)', margin: '2px 0 9px' }}>{stage.hint}</div>
      {stage.progress != null && (
        <div style={{ height: 4, borderRadius: 99, background: 'var(--sh-bg-pressed)', overflow: 'hidden', marginBottom: 9 }}>
          <div style={{ width: `${stage.progress}%`, height: '100%', background: 'var(--sh-info-solid)' }} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
    <div
      style={{ display: 'grid', gridTemplateColumns: '52px 1fr 110px 130px 96px', gap: 12, padding: '11px 18px', borderBottom: '1px solid var(--sh-border-subtle)', alignItems: 'center' }}
    >
      <span style={{ fontFamily: 'var(--sh-font-mono)', fontSize: 12, color: 'var(--sh-text-tertiary)' }}>{String(chapter.number).padStart(2, '0')}</span>
      <span style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 500 }}>{chapter.title ?? 'Untitled'}</span>
      <span style={{ fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{chapter.wordCount?.toLocaleString() ?? '—'}</span>
      <span>
        <StatusChip intent={CHAPTER_CHIP[chapter.status] ?? 'neutral'}>{chapter.status}</StatusChip>
      </span>
      <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
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
  const statusQuery = useProjectStatusQuery(novelId);
  const chaptersQuery = useListChaptersQuery(novelId, { limit: 200 });
  const extract = useExtractMutation(novelId);
  const consolidate = useConsolidateMutation(novelId);
  const skeleton = useSkeletonMutation(novelId);
  const resume = useResumeMutation(novelId);

  const status = statusQuery.data;
  const chapters = chaptersQuery.data?.items ?? [];
  const total = status?.chaptersTotal ?? chapters.length;
  const extracted = status?.chaptersExtracted ?? chapters.filter(c => c.status === 'done').length;

  const runToast = (label: string, err?: string): void => {
    if (err) toast.danger(err);
    else toast.success(`${label} started`);
  };

  const extractState: StageState = total > 0 && extracted >= total ? 'done' : extracted > 0 ? 'running' : 'pending';
  const stages: Stage[] = [
    { n: 1, name: 'Ingest', hint: `${total} chapters`, icon: <SourceIcon size={15} />, state: total > 0 ? 'done' : 'pending' },
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
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '28px 28px 60px' }}>
      <PageHeader
        title="Source Pipeline"
        subtitle="Ingest an existing manuscript and turn it into a structured story bible. Each stage can be resumed independently."
        extra={
          <>
            <Button variant="secondary" onClick={() => navigate({ to: '/novels/$novelId/runs', params: { novelId } })}>
              View runs
            </Button>
            <Button variant="primary" loading={resume.isPending} onClick={() => resume.mutate(undefined, { onSuccess: () => runToast('Pipeline'), onError: e => runToast('Pipeline', e.message) })}>
              Resume pipeline
            </Button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 24 }}>
        {stages.map(stage => (
          <StageCard key={stage.n} stage={stage} />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 'var(--sh-text-h3)', fontWeight: 700 }}>Source chapters</h3>
        <StatusChip intent="neutral">{total}</StatusChip>
      </div>

      <QueryState isLoading={chaptersQuery.isLoading} error={chaptersQuery.error} isEmpty={chapters.length === 0} emptyTitle="No source chapters" emptyDescription="Ingest a manuscript to populate this list.">
        <div style={{ background: 'var(--sh-surface-card)', border: '1px solid var(--sh-border-subtle)', borderRadius: 'var(--sh-radius-lg)', overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '52px 1fr 110px 130px 96px',
              gap: 12,
              padding: '9px 18px',
              borderBottom: '1px solid var(--sh-border-subtle)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--sh-text-tertiary)',
            }}
          >
            <span>#</span>
            <span>Title</span>
            <span>Words</span>
            <span>Extract</span>
            <span style={{ textAlign: 'right' }}>Actions</span>
          </div>
          {chapters.map(chapter => (
            <ChapterRow key={chapter.id} chapter={chapter} />
          ))}
        </div>
      </QueryState>
    </div>
  );
}
