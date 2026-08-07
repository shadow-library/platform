import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button, Checkbox, Drawer, FormField, Input, SegmentedControl, Spinner, Textarea, toast } from '@shadow-library/ui';

import { type ChipIntent, PageHeader, QueryState, StatusChip } from '@/components/nf';
import {
  fetchReforgeManuscript,
  type ReforgeChapterStatus,
  type ReforgeFidelity,
  type ReforgeOverview,
  type ReforgeSummary,
  useChapterQuery,
  useListChaptersQuery,
  useReforgeChapterQuery,
  useReforgeChaptersQuery,
  useReforgeStatusQuery,
  useRerunReforgeChapterMutation,
  useStartReforgeMutation,
  useUpdateReforgeConfigMutation,
} from '@/lib/apis';

import styles from './reforge.module.css';

// No loader by design (category D): a live re-authoring dashboard (source projects only) that polls
// status, counts, and per-chapter progress while a reforge job runs — there is nothing stable to
// prefetch for the first server paint.
export const Route = createFileRoute('/novels/$novelId/reforge')({
  component: ReforgeScreen,
});

type RowStatus = ReforgeChapterStatus | 'pending';

const STATUS_CHIP: Record<RowStatus, ChipIntent> = { reforged: 'success', attention: 'warning', failed: 'danger', pending: 'neutral' };
const PHASE_LABEL: Record<string, string> = {
  pending: 'Not started',
  glossary: 'Seeding glossary',
  reforging: 'Re-authoring chapters',
  done: 'Done',
  failed: 'Failed',
};
const FIDELITY_HELP: Record<ReforgeFidelity, string> = {
  preserve: 'Keep every beat and the meaning of each line, re-prosed fully. The faithful default.',
  close: 'Stay close to the source wording of key dialogue while still elevating the prose.',
  loose: 'Allow scenes to be re-ordered or tightened for pacing where it helps the chapter.',
};

interface JobProgress {
  phase?: string;
  done?: number;
  total?: number;
  current?: string;
}

function jobIsActive(status?: ReforgeOverview): boolean {
  const jobStatus = status?.job?.status;
  return jobStatus === 'pending' || jobStatus === 'in_progress';
}

interface ConfigCardProps {
  novelId: string;
  status: ReforgeOverview | undefined;
}

function ConfigCard({ novelId, status }: ConfigCardProps): React.JSX.Element {
  const update = useUpdateReforgeConfigMutation(novelId);
  const [instructions, setInstructions] = useState('');
  const [fidelity, setFidelity] = useState<ReforgeFidelity>('preserve');
  const [judge, setJudge] = useState(true);
  const [targetWords, setTargetWords] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || !status) return;
    setInstructions(status.reforge.instructions ?? '');
    setFidelity(status.reforge.fidelity ?? 'preserve');
    setJudge(status.reforge.settings?.judgeEnabled !== false);
    setTargetWords(status.reforge.settings?.targetWords ? String(status.reforge.settings.targetWords) : '');
    setHydrated(true);
  }, [status, hydrated]);

  const save = (): void => {
    const parsedWords = Number.parseInt(targetWords, 10);
    const settings = { judgeEnabled: judge, ...(Number.isFinite(parsedWords) && parsedWords > 0 ? { targetWords: parsedWords } : {}) };
    update.mutate(
      { instructions: instructions.trim() || null, fidelity, settings },
      { onSuccess: () => toast.success('Reforge config saved'), onError: e => toast.danger(e.message) },
    );
  };

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Re-authoring instructions</h3>
      <FormField
        label="Author instructions (optional)"
        helper="What to cut and how to shape the prose — e.g. “drop the filler tournament arc and the repetitive inner monologue; keep the pacing tight”. Removals are exempt from the fidelity check."
      >
        <Textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="e.g. cut the filler side-quests; raise the prose quality" />
      </FormField>
      <FormField label="Fidelity" helper={FIDELITY_HELP[fidelity]}>
        <SegmentedControl value={fidelity} onValueChange={v => setFidelity(v as ReforgeFidelity)} size="sm">
          <SegmentedControl.Item value="preserve">Preserve</SegmentedControl.Item>
          <SegmentedControl.Item value="close">Close</SegmentedControl.Item>
          <SegmentedControl.Item value="loose">Loose</SegmentedControl.Item>
        </SegmentedControl>
      </FormField>
      <FormField label="Target words per chapter (optional)" helper="Guides the writer toward a length; leave empty to follow the source chapter's own length.">
        <Input type="number" value={targetWords} onChange={e => setTargetWords(e.target.value)} placeholder="e.g. 3000" />
      </FormField>
      <label className={styles.auditRow}>
        <Checkbox checked={judge} onCheckedChange={v => setJudge(Boolean(v))} aria-label="AI fidelity judge every chapter" />
        <span>
          AI fidelity judge every chapter{' '}
          <span className={styles.auditHint}>— one extra model call that checks beat coverage, naming, and de-nationalization against the outline</span>
        </span>
      </label>
      <div className={styles.cardActions}>
        <Button variant="secondary" size="sm" loading={update.isPending} onClick={save}>
          Save config
        </Button>
      </div>
    </div>
  );
}

interface ProgressCardProps {
  status: ReforgeOverview;
}

function ProgressCard({ status }: ProgressCardProps): React.JSX.Element {
  const active = jobIsActive(status);
  const progress = (status.job?.progress ?? null) as JobProgress | null;
  const remaining = Math.max(status.sourceChapters - status.counts.reforged - status.counts.attention, 0);
  const pct = progress?.total ? Math.round(((progress.done ?? 0) / progress.total) * 100) : null;

  return (
    <div className={styles.card}>
      <div className={styles.progressHead}>
        <h3 className={styles.cardTitle}>Pipeline</h3>
        <StatusChip intent={status.reforge.status === 'done' ? 'success' : status.reforge.status === 'failed' ? 'danger' : active ? 'info' : 'neutral'}>
          {active && <Spinner size="sm" />}
          {PHASE_LABEL[status.reforge.status] ?? status.reforge.status}
        </StatusChip>
      </div>
      {active && progress && (
        <div className={styles.progressRow}>
          <span className={styles.progressLabel}>
            {progress.phase === 'reforging' ? `Chapter ${progress.current} — ${progress.done} of ${progress.total}` : (progress.phase ?? 'working')}
          </span>
          {pct !== null && (
            <div className={styles.progressTrack}>
              <div className={styles.progressBar} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      )}
      {status.reforge.lastError && <p className={styles.error}>{status.reforge.lastError}</p>}
      <div className={styles.chips}>
        <StatusChip intent="success">{status.counts.reforged} reforged</StatusChip>
        <StatusChip intent="warning">{status.counts.attention} attention</StatusChip>
        <StatusChip intent="danger">{status.counts.failed} failed</StatusChip>
        <StatusChip intent="neutral">{remaining} remaining</StatusChip>
        <StatusChip intent="neutral">{status.glossaryCount} glossary names</StatusChip>
      </div>
    </div>
  );
}

interface ReaderDrawerProps {
  novelId: string;
  chapter: number | null;
  onClose: () => void;
}

function ReaderDrawer({ novelId, chapter, onClose }: ReaderDrawerProps): React.JSX.Element {
  const [view, setView] = useState<'reforged' | 'source'>('reforged');
  const reforgeQuery = useReforgeChapterQuery(novelId, chapter);
  const sourceQuery = useChapterQuery(novelId, chapter ?? 0, chapter !== null && view === 'source');
  const reforge = reforgeQuery.data;
  const changes = reforge?.changes;

  return (
    <Drawer open={chapter !== null} onOpenChange={open => !open && onClose()} placement="right" size="lg">
      <Drawer.Header title={`Chapter ${chapter ?? ''}`} meta={reforge?.title ?? undefined} />
      <Drawer.Body>
        <div className={styles.readerControls}>
          <SegmentedControl value={view} onValueChange={v => setView(v as 'reforged' | 'source')} size="sm">
            <SegmentedControl.Item value="reforged">Reforged</SegmentedControl.Item>
            <SegmentedControl.Item value="source">Source</SegmentedControl.Item>
          </SegmentedControl>
        </div>

        {view === 'reforged' ? (
          <QueryState isLoading={reforgeQuery.isLoading} error={reforgeQuery.error} isEmpty={!reforge} emptyTitle="Not reforged yet">
            <div>
              {reforge && (reforge.issues?.length ?? 0) > 0 && (
                <div className={styles.issueBox}>
                  <div className={styles.issueTitle}>Needs attention</div>
                  {reforge.issues?.map((issue, i) => (
                    <div key={i} className={styles.issueRow}>
                      <span className={styles.issueType}>{issue.type}</span> {issue.detail}
                    </div>
                  ))}
                </div>
              )}
              {reforge?.summary && <p className={styles.changeSummary}>{reforge.summary}</p>}
              {reforge?.fidelity?.totalBeats != null && (
                <div className={styles.metaRow}>
                  <StatusChip intent={reforge.fidelity.verdict === 'clean' ? 'success' : 'warning'}>
                    {reforge.fidelity.coveredBeats ?? 0}/{reforge.fidelity.totalBeats} beats covered
                  </StatusChip>
                </div>
              )}
              {changes && (
                <div className={styles.metaList}>
                  {(changes.removals ?? []).map((r, i) => (
                    <div key={`rm-${i}`} className={styles.metaRow}>
                      <StatusChip intent="danger">removed</StatusChip> {r}
                    </div>
                  ))}
                  {(changes.addedScenes ?? []).map((s, i) => (
                    <div key={`add-${i}`} className={styles.metaRow}>
                      <StatusChip intent="info">added scene</StatusChip> {s}
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.prose}>{reforge?.body}</div>
            </div>
          </QueryState>
        ) : (
          <QueryState isLoading={sourceQuery.isLoading} error={sourceQuery.error} isEmpty={!sourceQuery.data}>
            <div className={styles.prose}>{sourceQuery.data?.content}</div>
          </QueryState>
        )}
      </Drawer.Body>
    </Drawer>
  );
}

function ReforgeScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const statusQuery = useReforgeStatusQuery(novelId);
  const active = jobIsActive(statusQuery.data);
  const reforgesQuery = useReforgeChaptersQuery(novelId, active);
  const chaptersQuery = useListChaptersQuery(novelId, { limit: 500 });
  const start = useStartReforgeMutation(novelId);
  const rerun = useRerunReforgeChapterMutation(novelId);
  const [reading, setReading] = useState<number | null>(null);

  const status = statusQuery.data;
  const reforges = new Map<number, ReforgeSummary>((reforgesQuery.data?.items ?? []).map(c => [c.chapter, c]));
  const chapters = chaptersQuery.data?.items ?? [];
  const readable = (status?.counts.reforged ?? 0) + (status?.counts.attention ?? 0) > 0;

  const download = async (): Promise<void> => {
    try {
      const { markdown } = await fetchReforgeManuscript(novelId);
      const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `reforge-manuscript-${novelId}.md`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : 'Download failed');
    }
  };

  return (
    <div className={`nf-page ${styles.page}`}>
      <PageHeader
        title="Reforge"
        subtitle="Re-author the source novel from scratch: same plot, characters, and dialogue meaning, unwanted content removed and the prose elevated — fully automatic once the source chapters are imported."
        extra={
          <>
            <Button variant="secondary" disabled={!readable} onClick={download}>
              Download manuscript
            </Button>
            <Button
              variant="primary"
              loading={start.isPending}
              disabled={active}
              onClick={() => start.mutate(undefined, { onSuccess: () => toast.success('Reforge started'), onError: e => toast.danger(e.message) })}
            >
              {active ? 'Running…' : 'Start reforge'}
            </Button>
          </>
        }
      />

      <QueryState isLoading={statusQuery.isLoading} error={statusQuery.error}>
        <div>
          <div className={styles.cards}>
            {status && <ProgressCard status={status} />}
            <ConfigCard novelId={novelId} status={status} />
          </div>

          <div className={styles.sectionHead}>
            <h3 className={styles.sectionTitle}>Chapters</h3>
            <StatusChip intent="neutral">{chapters.length}</StatusChip>
          </div>
          <QueryState
            isLoading={chaptersQuery.isLoading}
            error={chaptersQuery.error}
            isEmpty={chapters.length === 0}
            emptyTitle="No source chapters"
            emptyDescription="Source chapters arrive through a novel-import bundle. Import a novel to give this pipeline something to re-author."
          >
            <div className={styles.table}>
              <div className={styles.headerRow}>
                <span>#</span>
                <span>Title</span>
                <span>Status</span>
                <span className={styles.headerActions}>Actions</span>
              </div>
              {chapters.map(chapter => {
                const reforge = reforges.get(chapter.number);
                const rowStatus: RowStatus = reforge?.status ?? 'pending';
                return (
                  <div key={chapter.number} className={styles.row}>
                    <span className={styles.rowNum}>{String(chapter.number).padStart(2, '0')}</span>
                    <span className={styles.rowTitle}>{reforge?.title ?? chapter.title ?? 'Untitled'}</span>
                    <span className={styles.rowStatus}>
                      <StatusChip intent={STATUS_CHIP[rowStatus]}>{rowStatus}</StatusChip>
                      {(reforge?.issueCount ?? 0) > 0 && <span className={styles.issueCount}>{reforge?.issueCount} issue(s)</span>}
                    </span>
                    <span className={styles.rowActions}>
                      {reforge && reforge.status !== 'failed' && (
                        <Button variant="text" size="sm" onClick={() => setReading(chapter.number)}>
                          Read
                        </Button>
                      )}
                      <Button
                        variant="text"
                        size="sm"
                        disabled={active}
                        onClick={() => rerun.mutate(chapter.number, { onSuccess: () => toast.success(`Chapter ${chapter.number} queued`), onError: e => toast.danger(e.message) })}
                      >
                        {reforge ? 'Re-run' : 'Reforge'}
                      </Button>
                    </span>
                  </div>
                );
              })}
            </div>
          </QueryState>
        </div>
      </QueryState>

      <ReaderDrawer novelId={novelId} chapter={reading} onClose={() => setReading(null)} />
    </div>
  );
}
