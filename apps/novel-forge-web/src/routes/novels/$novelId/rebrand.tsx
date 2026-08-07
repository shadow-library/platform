import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button, Checkbox, Drawer, FormField, Input, SegmentedControl, Spinner, Textarea, toast } from '@shadow-library/ui';

import { type ChipIntent, PageHeader, QueryState, StatusChip } from '@/components/nf';
import {
  type ConversionStatus,
  type ConversionSummary,
  fetchRebrandManuscript,
  type RebrandOverview,
  useChapterQuery,
  useListChaptersQuery,
  useRebrandChapterQuery,
  useRebrandConversionsQuery,
  useRebrandStatusQuery,
  useRerunRebrandChapterMutation,
  useStartRebrandMutation,
  useUpdateRebrandConfigMutation,
} from '@/lib/apis';

import styles from './rebrand.module.css';

// No loader by design (category D): a live conversion-pipeline dashboard (source projects only) that polls
// status, counts, and per-chapter progress while a rebrand job runs — there is nothing stable to prefetch
// for the first server paint.
export const Route = createFileRoute('/novels/$novelId/rebrand')({
  component: RebrandScreen,
});

type RowStatus = ConversionStatus | 'pending';

const STATUS_CHIP: Record<RowStatus, ChipIntent> = { converted: 'success', attention: 'warning', failed: 'danger', pending: 'neutral' };
const PHASE_LABEL: Record<string, string> = {
  pending: 'Not started',
  glossary: 'Seeding glossary',
  converting: 'Converting chapters',
  done: 'Done',
  failed: 'Failed',
};

interface JobProgress {
  phase?: string;
  done?: number;
  total?: number;
  current?: string;
}

function jobIsActive(status?: RebrandOverview): boolean {
  const jobStatus = status?.job?.status;
  return jobStatus === 'pending' || jobStatus === 'in_progress';
}

interface ConfigCardProps {
  novelId: string;
  status: RebrandOverview | undefined;
}

function ConfigCard({ novelId, status }: ConfigCardProps): React.JSX.Element {
  const update = useUpdateRebrandConfigMutation(novelId);
  const [directives, setDirectives] = useState('');
  const [banned, setBanned] = useState('');
  const [audit, setAudit] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || !status) return;
    setDirectives(status.rebrand.directives ?? '');
    setBanned((status.rebrand.settings?.bannedExtra ?? []).join(', '));
    setAudit(status.rebrand.settings?.auditEnabled !== false);
    setHydrated(true);
  }, [status, hydrated]);

  const save = (): void => {
    const bannedExtra = banned
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    update.mutate(
      { directives: directives.trim() || null, settings: { bannedExtra, auditEnabled: audit } },
      { onSuccess: () => toast.success('Rebrand config saved'), onError: e => toast.danger(e.message) },
    );
  };

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Conversion directives</h3>
      <FormField
        label="Additional scenes (optional)"
        helper="Free-text instruction woven through every chapter, e.g. “weave a slow-burn romance into the story”. Leave empty for a faithful conversion."
      >
        <Textarea value={directives} onChange={e => setDirectives(e.target.value)} placeholder="e.g. weave romance into the story" />
      </FormField>
      <FormField label="Extra banned terms" helper="Comma-separated words the residue scan flags on top of the built-in real-world list.">
        <Input value={banned} onChange={e => setBanned(e.target.value)} placeholder="Tang, Han, Shaolin" />
      </FormField>
      <label className={styles.auditRow}>
        <Checkbox checked={audit} onCheckedChange={v => setAudit(Boolean(v))} aria-label="AI audit every chapter" />
        <span>
          AI audit every chapter <span className={styles.auditHint}>— one extra model call per chapter that checks nationalism removal and naming consistency</span>
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
  status: RebrandOverview;
}

function ProgressCard({ status }: ProgressCardProps): React.JSX.Element {
  const active = jobIsActive(status);
  const progress = (status.job?.progress ?? null) as JobProgress | null;
  const remaining = Math.max(status.sourceChapters - status.counts.converted - status.counts.attention, 0);
  const pct = progress?.total ? Math.round(((progress.done ?? 0) / progress.total) * 100) : null;

  return (
    <div className={styles.card}>
      <div className={styles.progressHead}>
        <h3 className={styles.cardTitle}>Pipeline</h3>
        <StatusChip intent={status.rebrand.status === 'done' ? 'success' : status.rebrand.status === 'failed' ? 'danger' : active ? 'info' : 'neutral'}>
          {active && <Spinner size="sm" />}
          {PHASE_LABEL[status.rebrand.status] ?? status.rebrand.status}
        </StatusChip>
      </div>
      {active && progress && (
        <div className={styles.progressRow}>
          <span className={styles.progressLabel}>
            {progress.phase === 'converting' ? `Chapter ${progress.current} — ${progress.done} of ${progress.total}` : (progress.phase ?? 'working')}
          </span>
          {pct !== null && (
            <div className={styles.progressTrack}>
              <div className={styles.progressBar} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      )}
      {status.rebrand.lastError && <p className={styles.error}>{status.rebrand.lastError}</p>}
      <div className={styles.chips}>
        <StatusChip intent="success">{status.counts.converted} converted</StatusChip>
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
  const [view, setView] = useState<'converted' | 'original'>('converted');
  const conversionQuery = useRebrandChapterQuery(novelId, chapter);
  const originalQuery = useChapterQuery(novelId, chapter ?? 0, chapter !== null && view === 'original');
  const conversion = conversionQuery.data;

  return (
    <Drawer open={chapter !== null} onOpenChange={open => !open && onClose()} placement="right" size="lg">
      <Drawer.Header title={`Chapter ${chapter ?? ''}`} meta={conversion?.title ?? undefined} />
      <Drawer.Body>
        <div className={styles.readerControls}>
          <SegmentedControl value={view} onValueChange={v => setView(v as 'converted' | 'original')} size="sm">
            <SegmentedControl.Item value="converted">Converted</SegmentedControl.Item>
            <SegmentedControl.Item value="original">Original</SegmentedControl.Item>
          </SegmentedControl>
        </div>

        {view === 'converted' ? (
          <QueryState isLoading={conversionQuery.isLoading} error={conversionQuery.error} isEmpty={!conversion} emptyTitle="Not converted yet">
            <div>
              {conversion && (conversion.issues?.length ?? 0) > 0 && (
                <div className={styles.issueBox}>
                  <div className={styles.issueTitle}>Needs attention</div>
                  {conversion.issues?.map((issue, i) => (
                    <div key={i} className={styles.issueRow}>
                      <span className={styles.issueType}>{issue.type}</span> {issue.detail}
                    </div>
                  ))}
                </div>
              )}
              {conversion?.summaryOfChanges && <p className={styles.changeSummary}>{conversion.summaryOfChanges}</p>}
              {conversion && (conversion.addedScenes?.length ?? 0) > 0 && (
                <div className={styles.metaList}>
                  {conversion.addedScenes?.map((scene, i) => (
                    <div key={i} className={styles.metaRow}>
                      <StatusChip intent="info">added scene</StatusChip> {scene.placement} — {scene.purpose}
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.prose}>{conversion?.body}</div>
            </div>
          </QueryState>
        ) : (
          <QueryState isLoading={originalQuery.isLoading} error={originalQuery.error} isEmpty={!originalQuery.data}>
            <div className={styles.prose}>{originalQuery.data?.content}</div>
          </QueryState>
        )}
      </Drawer.Body>
    </Drawer>
  );
}

function RebrandScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const statusQuery = useRebrandStatusQuery(novelId);
  const active = jobIsActive(statusQuery.data);
  const conversionsQuery = useRebrandConversionsQuery(novelId, active);
  const chaptersQuery = useListChaptersQuery(novelId, { limit: 500 });
  const start = useStartRebrandMutation(novelId);
  const rerun = useRerunRebrandChapterMutation(novelId);
  const [reading, setReading] = useState<number | null>(null);

  const status = statusQuery.data;
  const conversions = new Map<number, ConversionSummary>((conversionsQuery.data?.items ?? []).map(c => [c.chapter, c]));
  const chapters = chaptersQuery.data?.items ?? [];
  const readable = (status?.counts.converted ?? 0) + (status?.counts.attention ?? 0) > 0;

  const download = async (): Promise<void> => {
    try {
      const { markdown } = await fetchRebrandManuscript(novelId);
      const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `rebrand-manuscript-${novelId}.md`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : 'Download failed');
    }
  };

  return (
    <div className={`nf-page ${styles.page}`}>
      <PageHeader
        title="Rebrand"
        subtitle="Convert the source novel into an alternate world: names remapped, nationalism removed, minor errors fixed — fully automatic once the source chapters are imported."
        extra={
          <>
            <Button variant="secondary" disabled={!readable} onClick={download}>
              Download manuscript
            </Button>
            <Button
              variant="primary"
              loading={start.isPending}
              disabled={active}
              onClick={() => start.mutate(undefined, { onSuccess: () => toast.success('Rebrand started'), onError: e => toast.danger(e.message) })}
            >
              {active ? 'Running…' : 'Start rebrand'}
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
            emptyDescription="Source chapters arrive through a novel-import bundle. Import a novel to give this pipeline something to convert."
          >
            <div className={styles.table}>
              <div className={styles.headerRow}>
                <span>#</span>
                <span>Title</span>
                <span>Status</span>
                <span className={styles.headerActions}>Actions</span>
              </div>
              {chapters.map(chapter => {
                const conversion = conversions.get(chapter.number);
                const rowStatus: RowStatus = conversion?.status ?? 'pending';
                return (
                  <div key={chapter.number} className={styles.row}>
                    <span className={styles.rowNum}>{String(chapter.number).padStart(2, '0')}</span>
                    <span className={styles.rowTitle}>{conversion?.title ?? chapter.title ?? 'Untitled'}</span>
                    <span className={styles.rowStatus}>
                      <StatusChip intent={STATUS_CHIP[rowStatus]}>{rowStatus}</StatusChip>
                      {(conversion?.issueCount ?? 0) > 0 && <span className={styles.issueCount}>{conversion?.issueCount} issue(s)</span>}
                    </span>
                    <span className={styles.rowActions}>
                      {conversion && conversion.status !== 'failed' && (
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
                        {conversion ? 'Re-run' : 'Convert'}
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
