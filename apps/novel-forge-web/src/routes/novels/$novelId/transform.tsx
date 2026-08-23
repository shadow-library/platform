import { createFileRoute, Link } from '@tanstack/react-router';
import { Fragment, useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Drawer, FormField, Input, Select, Spinner, Tabs, Textarea, toast } from '@shadow-library/ui';

import { type ChipIntent, Markdown, PageHeader, QueryState, StatusChip } from '@/components/nf';
import {
  type FindingType,
  type OutputStatus,
  type PlanSpan,
  type ReforgeOverview,
  type SpanAction,
  useAnalysisFindingsQuery,
  useAnalysisReportQuery,
  useApprovePlanMutation,
  useChapterQuery,
  useDraftPlanMutation,
  usePromoteReforgeMutation,
  useReforgeAnalysisQuery,
  useReforgeCutsQuery,
  useReforgeOutputQuery,
  useReforgeOutputsQuery,
  useReforgePlanQuery,
  useReforgeStatusQuery,
  useReplacePlanSpansMutation,
  useRerunOutputMutation,
  useStartAnalysisMutation,
  useStartTransformMutation,
  useUpdateReforgeConfigMutation,
} from '@/lib/apis';

import styles from './transform.module.css';

// No loader by design (category D): a live pipeline dashboard that polls analysis, plan, and output
// progress while the transform runs — there is nothing stable to prefetch for the first server paint.
export const Route = createFileRoute('/novels/$novelId/transform')({
  component: TransformScreen,
});

type EditableSpan = Omit<PlanSpan, 'spanKey' | 'firstOutputChapter' | 'lastOutputChapter'>;

const OUTPUT_CHIP: Record<OutputStatus, ChipIntent> = { written: 'success', attention: 'warning', failed: 'danger' };
const SPAN_ACTIONS: SpanAction[] = ['keep', 'condense', 'merge', 'drop'];
const FINDING_TYPES: FindingType[] = ['filler', 'repetition', 'pacing_stall', 'dead_subplot', 'dropped_thread', 'arc_boundary', 'quality_outlier', 'window_failed'];
const ALL_TYPES = 'all';

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

/**
 * The same partition invariants the server enforces, run on every keystroke: the author sees why Approve
 * is blocked while they edit rather than after a round trip. The server re-validates regardless.
 */
function validateSpans(spans: EditableSpan[], sourceChapterCount: number): string[] {
  if (spans.length === 0) return ['a plan must contain at least one span'];
  const issues: string[] = [];
  const ordered = [...spans].sort((a, b) => a.ordinal - b.ordinal);

  if (ordered[0]?.fromChapter !== 1) issues.push('the first span must start at source chapter 1');
  if (ordered[0]?.action === 'drop') issues.push('the first span cannot be dropped — a novel needs an opening');
  if (sourceChapterCount > 0 && ordered[ordered.length - 1]?.toChapter !== sourceChapterCount) issues.push(`the last span must end at source chapter ${sourceChapterCount}`);

  ordered.forEach((span, index) => {
    const previous = ordered[index - 1];
    const length = span.toChapter - span.fromChapter + 1;
    if (span.toChapter < span.fromChapter) issues.push(`span ${span.ordinal} ends before it starts`);
    if (previous && span.fromChapter !== previous.toChapter + 1) issues.push(`span ${span.ordinal} must start where span ${previous.ordinal} ends`);
    if (span.action === 'keep' && span.targetChapters !== length) issues.push(`keep span ${span.ordinal} must produce exactly its ${length} source chapters`);
    if (span.action === 'merge' && span.targetChapters !== 1) issues.push(`merge span ${span.ordinal} must produce exactly 1 output chapter`);
    if (span.action === 'drop' && span.targetChapters !== 0) issues.push(`drop span ${span.ordinal} must produce no output chapters`);
    if (span.action === 'condense' && (span.targetChapters < 1 || span.targetChapters >= length)) {
      issues.push(`condense span ${span.ordinal} must produce between 1 and ${length - 1} output chapters`);
    }
    if (previous?.action === 'drop' && !span.continuityNotes?.trim()) issues.push(`span ${span.ordinal} follows a dropped span and needs continuity notes`);
    if (span.action !== 'drop' && (span.keptBeats?.length ?? 0) === 0) issues.push(`span ${span.ordinal} must name the beats it keeps`);
  });

  return [...new Set(issues)];
}

function outputCount(spans: EditableSpan[]): number {
  return spans.reduce((sum, span) => sum + span.targetChapters, 0);
}

interface TabProps {
  novelId: string;
  status: ReforgeOverview | undefined;
}

function ProgressBar({ progress }: { progress: JobProgress | null }): React.JSX.Element | null {
  if (!progress?.total) return null;
  const pct = Math.round(((progress.done ?? 0) / progress.total) * 100);
  return (
    <div>
      <p className={styles.hint}>
        {progress.phase ?? 'working'} — {progress.done ?? 0} of {progress.total} {progress.current ? `(${progress.current})` : ''}
      </p>
      <div className={styles.progressTrack}>
        <div className={styles.progressBar} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AnalysisTab({ novelId, status }: TabProps): React.JSX.Element {
  const active = jobIsActive(status);
  const analysisQuery = useReforgeAnalysisQuery(novelId, active);
  const reportQuery = useAnalysisReportQuery(novelId);
  const [type, setType] = useState<string>(ALL_TYPES);
  const findingsQuery = useAnalysisFindingsQuery(novelId, type === ALL_TYPES ? {} : { type: type as FindingType });
  const start = useStartAnalysisMutation(novelId);

  const analysis = analysisQuery.data?.analysis;
  const metrics = analysis?.metrics;

  return (
    <div className={styles.tabPanel}>
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Source analysis</h3>
          <Button
            variant="primary"
            size="sm"
            disabled={active}
            loading={start.isPending}
            onClick={() => start.mutate(undefined, { onSuccess: () => toast.success('Analysis started'), onError: e => toast.danger(e.message) })}
          >
            {analysis ? 'Re-run analysis' : 'Run analysis'}
          </Button>
        </div>
        <p className={styles.hint}>
          One windowed reading pass over the whole source: what each chapter does, where it repeats itself, where it stalls, and which threads the original author abandoned.
        </p>
        {active && <ProgressBar progress={(status?.job?.progress ?? null) as JobProgress | null} />}
        {analysis && (
          <div className={styles.chips}>
            <StatusChip intent={analysis.status === 'done' ? 'success' : analysis.status === 'failed' ? 'danger' : 'info'}>
              {analysis.status === 'done' ? 'analysed' : analysis.status}
              {active && <Spinner size="sm" />}
            </StatusChip>
            <StatusChip intent="neutral">{analysis.chaptersAnalyzed} chapters read</StatusChip>
            <StatusChip intent={analysis.windowsFailed > 0 ? 'warning' : 'neutral'}>{analysis.windowsFailed} windows failed</StatusChip>
            {metrics && <StatusChip intent="neutral">{Math.round(metrics.repetitionRatio * 100)}% repetition</StatusChip>}
            {metrics && <StatusChip intent="neutral">{Math.round(metrics.stallRatio * 100)}% stalled</StatusChip>}
            {metrics && <StatusChip intent="neutral">{metrics.arcCount} arcs</StatusChip>}
            {metrics && <StatusChip intent="neutral">{metrics.deadThreadCount} dead threads</StatusChip>}
          </div>
        )}
        {analysis?.lastError && <p className={styles.error}>{analysis.lastError}</p>}
      </div>

      <QueryState
        isLoading={analysisQuery.isLoading}
        error={null}
        isEmpty={!analysis}
        emptyTitle="No analysis yet"
        emptyDescription="Run the analysis to see what the source is made of."
      >
        <div className={styles.tabPanel}>
          <div className={styles.report}>
            <Markdown content={reportQuery.data?.markdown ?? ''} />
          </div>

          <div className={styles.filters}>
            <FormField label="Finding type" className={styles.filterField}>
              <Select value={type} onValueChange={setType} aria-label="Finding type">
                <Select.Item value={ALL_TYPES}>All types</Select.Item>
                {FINDING_TYPES.map(t => (
                  <Select.Item key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </Select.Item>
                ))}
              </Select>
            </FormField>
            <StatusChip intent="neutral">{findingsQuery.data?.total ?? 0} findings</StatusChip>
          </div>

          <div className={styles.table}>
            <div className={styles.findingHead}>
              <span>Type</span>
              <span>Chapters</span>
              <span>What it is</span>
              <span>Severity</span>
              <span>Detected by</span>
            </div>
            {(findingsQuery.data?.items ?? []).map(finding => (
              <div key={finding.id} className={styles.findingRow}>
                <span className={styles.mono}>{finding.type}</span>
                <span className={styles.mono}>
                  {finding.fromChapter}–{finding.toChapter}
                </span>
                <span>
                  <strong>{finding.label}</strong>
                  {finding.detail ? ` — ${finding.detail}` : ''}
                </span>
                <StatusChip intent={finding.severity >= 4 ? 'danger' : finding.severity >= 3 ? 'warning' : 'neutral'}>{finding.severity}/5</StatusChip>
                <StatusChip intent={finding.detectedBy === 'both' ? 'success' : 'neutral'}>{finding.detectedBy}</StatusChip>
              </div>
            ))}
          </div>
        </div>
      </QueryState>
    </div>
  );
}

function SpanEditor({ span, onChange }: { span: EditableSpan; onChange: (next: EditableSpan) => void }): React.JSX.Element {
  return (
    <div className={styles.spanEditor}>
      <FormField label="Rationale" helper="Why this span is shaped this way — quoted into the plan the writer obeys.">
        <Textarea value={span.rationale ?? ''} onValueChange={v => onChange({ ...span, rationale: v })} minRows={2} autoGrow />
      </FormField>
      <FormField label="Kept beats (one per line)" helper="The contract every output chapter of this span owes the reader — and the only thing the judge measures.">
        <Textarea value={(span.keptBeats ?? []).join('\n')} onValueChange={v => onChange({ ...span, keptBeats: v.split('\n').filter(line => line.trim()) })} minRows={3} autoGrow />
      </FormField>
      <FormField label="Cut threads (one per line)" helper="Each becomes a cut-ledger entry at approval, and never resurfaces after it.">
        <Textarea
          value={(span.cutThreads ?? []).join('\n')}
          onValueChange={v => onChange({ ...span, cutThreads: v.split('\n').filter(line => line.trim()) })}
          minRows={2}
          autoGrow
        />
      </FormField>
      <FormField label="Continuity notes" helper="Required on a span that follows a dropped one — what must be true when this chapter opens.">
        <Textarea value={span.continuityNotes ?? ''} onValueChange={v => onChange({ ...span, continuityNotes: v })} minRows={2} autoGrow />
      </FormField>
    </div>
  );
}

function PlanTab({ novelId, status }: TabProps): React.JSX.Element {
  const active = jobIsActive(status);
  const planQuery = useReforgePlanQuery(novelId, active);
  const draft = useDraftPlanMutation(novelId);
  const save = useReplacePlanSpansMutation(novelId);
  const approve = useApprovePlanMutation(novelId);
  const [spans, setSpans] = useState<EditableSpan[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null);

  const plan = planQuery.data?.plan;
  const sourceChapterCount = plan?.sourceChapterCount ?? status?.sourceChapters ?? 0;

  useEffect(() => {
    if (!planQuery.data || planQuery.data.plan.revision === loadedRevision) return;
    setSpans(planQuery.data.spans.map(({ spanKey: _key, firstOutputChapter: _first, lastOutputChapter: _last, ...rest }) => rest));
    setLoadedRevision(planQuery.data.plan.revision);
  }, [planQuery.data, loadedRevision]);

  const issues = validateSpans(spans, sourceChapterCount);
  const approved = plan?.status === 'approved';
  const update = (ordinal: number, next: EditableSpan): void => setSpans(current => current.map(span => (span.ordinal === ordinal ? next : span)));

  return (
    <div className={styles.tabPanel}>
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Transformation plan</h3>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              size="sm"
              disabled={active}
              loading={draft.isPending}
              onClick={() => draft.mutate(undefined, { onSuccess: () => toast.success('Plan drafting started'), onError: e => toast.danger(e.message) })}
            >
              {plan ? 'Re-draft from analysis' : 'Draft plan'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={spans.length === 0 || issues.length > 0}
              loading={save.isPending}
              onClick={() => save.mutate({ spans, baseRevision: plan?.revision }, { onSuccess: () => toast.success('Plan revision saved'), onError: e => toast.danger(e.message) })}
            >
              Save as new revision
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!plan || approved || issues.length > 0}
              loading={approve.isPending}
              onClick={() => approve.mutate({ baseRevision: plan?.revision }, { onSuccess: () => toast.success('Plan approved'), onError: e => toast.danger(e.message) })}
            >
              {approved ? 'Approved' : 'Approve plan'}
            </Button>
          </div>
        </div>
        <p className={styles.hint}>
          Every source chapter belongs to exactly one span. Approving freezes the plan, seeds the cut ledger, and is the only thing that lets the writer run — nothing is ever
          approved automatically.
        </p>
        <div className={styles.chips}>
          {plan && <StatusChip intent={approved ? 'success' : 'info'}>{plan.status}</StatusChip>}
          {plan && <StatusChip intent="neutral">revision {plan.revision}</StatusChip>}
          <StatusChip intent="neutral">{sourceChapterCount} source chapters</StatusChip>
          <StatusChip intent="neutral">{outputCount(spans)} output chapters</StatusChip>
        </div>
        {issues.length > 0 && spans.length > 0 && (
          <Alert intent="warning" title="The plan does not partition the source yet">
            <ul>
              {issues.slice(0, 8).map(issue => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </Alert>
        )}
      </div>

      <QueryState
        isLoading={planQuery.isLoading}
        error={null}
        isEmpty={spans.length === 0}
        emptyTitle="No plan yet"
        emptyDescription="Draft one from the analysis, then edit the spans until they say what this novel should become."
      >
        <div className={styles.table}>
          <div className={styles.spanHead}>
            <span>#</span>
            <span>Source</span>
            <span>Action</span>
            <span>Outputs</span>
            <span>Arc</span>
            <span>Rationale</span>
          </div>
          {spans.map(span => (
            <Fragment key={span.ordinal}>
              <div className={styles.spanRow}>
                <span className={styles.mono}>{span.ordinal}</span>
                <span className={styles.mono}>
                  {span.fromChapter}–{span.toChapter}
                </span>
                <Select value={span.action} onValueChange={v => update(span.ordinal, { ...span, action: v as SpanAction })} aria-label="Span action" disabled={approved}>
                  {SPAN_ACTIONS.map(action => (
                    <Select.Item key={action} value={action}>
                      {action}
                    </Select.Item>
                  ))}
                </Select>
                <Input
                  type="number"
                  value={String(span.targetChapters)}
                  onChange={e => update(span.ordinal, { ...span, targetChapters: Number.parseInt(e.target.value, 10) || 0 })}
                  aria-label="Target chapters"
                  disabled={approved}
                />
                <span>{span.arcLabel ?? '—'}</span>
                <span className={styles.rowActions}>
                  <Button variant="text" size="sm" onClick={() => setEditing(editing === span.ordinal ? null : span.ordinal)}>
                    {editing === span.ordinal ? 'Close' : 'Edit'}
                  </Button>
                </span>
              </div>
              {editing === span.ordinal && (
                <div className={styles.spanEditorRow}>
                  <SpanEditor span={span} onChange={next => update(span.ordinal, next)} />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </QueryState>
    </div>
  );
}

function OutputReader({ novelId, outputChapter, onClose }: { novelId: string; outputChapter: number | null; onClose: () => void }): React.JSX.Element {
  const outputQuery = useReforgeOutputQuery(novelId, outputChapter);
  const output = outputQuery.data;
  const [sourceChapter, setSourceChapter] = useState<number | null>(null);
  const sourceQuery = useChapterQuery(novelId, sourceChapter ?? 0, sourceChapter !== null);

  useEffect(() => setSourceChapter(output?.fromChapter ?? null), [output?.fromChapter]);

  return (
    <Drawer open={outputChapter !== null} onOpenChange={open => !open && onClose()} placement="right" size="lg">
      <Drawer.Header title={`Output chapter ${outputChapter ?? ''}`} meta={output?.title ?? undefined} />
      <Drawer.Body>
        <QueryState isLoading={outputQuery.isLoading} error={outputQuery.error} isEmpty={!output} emptyTitle="Not written yet">
          <div className={styles.reader}>
            <div>
              <p className={styles.paneTitle}>Output</p>
              {(output?.issues?.length ?? 0) > 0 && (
                <div className={styles.issueBox}>
                  {output?.issues?.map((issue, i) => (
                    <div key={i}>
                      <span className={styles.mono}>{issue.type}</span> {issue.detail}
                    </div>
                  ))}
                </div>
              )}
              {(output?.planBeats?.length ?? 0) > 0 && (
                <ul className={styles.beats}>
                  {output?.planBeats?.map(beat => (
                    <li key={beat}>{beat}</li>
                  ))}
                </ul>
              )}
              <div className={styles.prose}>{output?.body}</div>
            </div>
            <div>
              <p className={styles.paneTitle}>Source span</p>
              <div className={styles.chips}>
                {Array.from({ length: (output?.toChapter ?? 0) - (output?.fromChapter ?? 0) + 1 }, (_, i) => (output?.fromChapter ?? 0) + i).map(number => (
                  <Button key={number} variant={number === sourceChapter ? 'secondary' : 'text'} size="sm" onClick={() => setSourceChapter(number)}>
                    {number}
                  </Button>
                ))}
              </div>
              <div className={styles.prose}>{sourceQuery.data?.content}</div>
            </div>
          </div>
        </QueryState>
      </Drawer.Body>
    </Drawer>
  );
}

function OutputsTab({ novelId, status }: TabProps): React.JSX.Element {
  const active = jobIsActive(status);
  const outputsQuery = useReforgeOutputsQuery(novelId, active);
  const start = useStartTransformMutation(novelId);
  const rerun = useRerunOutputMutation(novelId);
  const [limit, setLimit] = useState('');
  const [reading, setReading] = useState<number | null>(null);

  const counts = status?.transform?.counts;
  const planApproved = status?.transform?.plan?.status === 'approved';
  const parsedLimit = Number.parseInt(limit, 10);

  return (
    <div className={styles.tabPanel}>
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Write the output chapters</h3>
          <div className={styles.actions}>
            <Input type="number" value={limit} onChange={e => setLimit(e.target.value)} placeholder="limit, e.g. 10" aria-label="Output limit" />
            <Button
              variant="primary"
              size="sm"
              disabled={active || !planApproved}
              loading={start.isPending}
              onClick={() =>
                start.mutate(
                  { ...(Number.isFinite(parsedLimit) && parsedLimit > 0 ? { limit: parsedLimit } : {}) },
                  { onSuccess: () => toast.success('Transform started'), onError: e => toast.danger(e.message) },
                )
              }
            >
              {active ? 'Running…' : 'Start transform'}
            </Button>
          </div>
        </div>
        {!planApproved && <p className={styles.hint}>The writer only runs against an approved plan — approve one on the Plan tab first.</p>}
        <p className={styles.hint}>A limit writes a trial run before the whole book is committed; re-running picks up wherever the last run left off.</p>
        {active && <ProgressBar progress={(status?.job?.progress ?? null) as JobProgress | null} />}
        <div className={styles.chips}>
          <StatusChip intent="success">{counts?.written ?? 0} written</StatusChip>
          <StatusChip intent="warning">{counts?.attention ?? 0} attention</StatusChip>
          <StatusChip intent="danger">{counts?.failed ?? 0} failed</StatusChip>
          <StatusChip intent="neutral">{status?.transform?.plan?.outputChapterCount ?? 0} planned</StatusChip>
        </div>
      </div>

      <QueryState
        isLoading={outputsQuery.isLoading}
        error={outputsQuery.error}
        isEmpty={(outputsQuery.data?.items.length ?? 0) === 0}
        emptyTitle="Nothing written yet"
        emptyDescription="Start the transform to write the output chapters the approved plan derives."
      >
        <div className={styles.table}>
          <div className={styles.outputHead}>
            <span>#</span>
            <span>Title</span>
            <span>Source span</span>
            <span>Status</span>
            <span className={styles.rowActions}>Actions</span>
          </div>
          {(outputsQuery.data?.items ?? []).map(output => (
            <div key={output.outputChapter} className={styles.outputRow}>
              <span className={styles.mono}>{String(output.outputChapter).padStart(2, '0')}</span>
              <span>{output.title ?? 'Untitled'}</span>
              <span className={styles.mono}>
                {output.fromChapter}–{output.toChapter}
              </span>
              <span>
                <StatusChip intent={OUTPUT_CHIP[output.status]}>{output.status}</StatusChip>
                {output.issueCount > 0 && <span className={styles.mono}> {output.issueCount} issue(s)</span>}
              </span>
              <span className={styles.rowActions}>
                {output.status !== 'failed' && (
                  <Button variant="text" size="sm" onClick={() => setReading(output.outputChapter)}>
                    Read
                  </Button>
                )}
                <Button
                  variant="text"
                  size="sm"
                  disabled={active}
                  onClick={() =>
                    rerun.mutate(output.outputChapter, { onSuccess: () => toast.success(`Output ${output.outputChapter} queued`), onError: e => toast.danger(e.message) })
                  }
                >
                  Re-run
                </Button>
              </span>
            </div>
          ))}
        </div>
      </QueryState>

      <OutputReader novelId={novelId} outputChapter={reading} onClose={() => setReading(null)} />
    </div>
  );
}

function CutsTab({ novelId }: { novelId: string }): React.JSX.Element {
  const cutsQuery = useReforgeCutsQuery(novelId);

  return (
    <div className={styles.tabPanel}>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Cut ledger</h3>
        <p className={styles.hint}>
          Everything the plan removed, plus anything the writer discovered it had to cut. The ledger rides in the context of every later chapter, and the judge scans for anything
          that resurfaces.
        </p>
      </div>
      <QueryState
        isLoading={cutsQuery.isLoading}
        error={cutsQuery.error}
        isEmpty={(cutsQuery.data?.items.length ?? 0) === 0}
        emptyTitle="Nothing cut yet"
        emptyDescription="The ledger fills when a plan is approved."
      >
        <div className={styles.table}>
          <div className={styles.cutHead}>
            <span>Kind</span>
            <span>What went away</span>
            <span>Source</span>
            <span>Gone from</span>
          </div>
          {(cutsQuery.data?.items ?? []).map(cut => (
            <div key={cut.cutKey} className={styles.cutRow}>
              <StatusChip intent={cut.disposition === 'cut' ? 'danger' : 'warning'}>{cut.kind.replace(/_/g, ' ')}</StatusChip>
              <span>
                <strong>{cut.label}</strong>
                {cut.detail ? ` — ${cut.detail}` : ''}
                {cut.replacementNote ? ` (${cut.replacementNote})` : ''}
              </span>
              <span className={styles.mono}>
                {cut.firstSourceChapter}–{cut.lastSourceChapter}
              </span>
              <span className={styles.mono}>output {cut.effectiveFromOutput}</span>
            </div>
          ))}
        </div>
      </QueryState>
    </div>
  );
}

function PromoteTab({ novelId, status }: TabProps): React.JSX.Element {
  const promote = usePromoteReforgeMutation(novelId);
  const [title, setTitle] = useState('');
  const [seedVolumes, setSeedVolumes] = useState(true);

  const plan = status?.transform?.plan;
  const counts = status?.transform?.counts;
  const complete = Boolean(plan) && (counts?.failed ?? 0) === 0 && (counts?.written ?? 0) + (counts?.attention ?? 0) === (plan?.outputChapterCount ?? -1);

  return (
    <div className={styles.tabPanel}>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Promote into a novel</h3>
        <p className={styles.hint}>
          Lands the output chapters as a new publishable project — numbered from 1, locked, and human-authored, exactly like a finished novel import. The source project stays
          untouched.
        </p>
        {plan?.promotedProjectId ? (
          <Alert intent="success" title="Already promoted">
            <Link to="/novels/$novelId/overview" params={{ novelId: plan.promotedProjectId }}>
              Open the promoted novel
            </Link>
          </Alert>
        ) : (
          <div className={styles.promoteForm}>
            <FormField label="Title (optional)" helper="Defaults to the source project's title.">
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Ashes of Veldram" />
            </FormField>
            <label className={styles.checkRow}>
              <Checkbox checked={seedVolumes} onCheckedChange={v => setSeedVolumes(Boolean(v))} aria-label="Seed volumes from the plan's arcs" />
              <span>Seed volumes from the plan’s arc boundaries so the promoted novel is immediately plannable</span>
            </label>
            {!complete && <p className={styles.hint}>Every planned output chapter must be written, with none failed, before the transform can be promoted.</p>}
            <div className={styles.actions}>
              <Button
                variant="primary"
                disabled={!complete}
                loading={promote.isPending}
                onClick={() =>
                  promote.mutate({ title: title.trim() || undefined, seedVolumes }, { onSuccess: () => toast.success('Promotion started'), onError: e => toast.danger(e.message) })
                }
              >
                Promote
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TransformScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const statusQuery = useReforgeStatusQuery(novelId);
  const updateConfig = useUpdateReforgeConfigMutation(novelId);
  const status = statusQuery.data;
  const isTransform = status?.reforge.mode === 'transform';

  return (
    <div className={`nf-page ${styles.page}`}>
      <PageHeader
        title="Transform"
        subtitle="Structural re-authoring: read the whole source once, approve a plan that says what this novel should become, write the output chapters under it, and promote the result into a publishable novel."
      />

      <QueryState isLoading={statusQuery.isLoading} error={statusQuery.error}>
        {isTransform ? (
          <Tabs defaultValue="analysis">
            <Tabs.List>
              <Tabs.Tab value="analysis">Analysis</Tabs.Tab>
              <Tabs.Tab value="plan">Plan</Tabs.Tab>
              <Tabs.Tab value="transform">Transform</Tabs.Tab>
              <Tabs.Tab value="cuts">Cuts</Tabs.Tab>
              <Tabs.Tab value="promote">Promote</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="analysis">
              <AnalysisTab novelId={novelId} status={status} />
            </Tabs.Panel>
            <Tabs.Panel value="plan">
              <PlanTab novelId={novelId} status={status} />
            </Tabs.Panel>
            <Tabs.Panel value="transform">
              <OutputsTab novelId={novelId} status={status} />
            </Tabs.Panel>
            <Tabs.Panel value="cuts">
              <CutsTab novelId={novelId} />
            </Tabs.Panel>
            <Tabs.Panel value="promote">
              <PromoteTab novelId={novelId} status={status} />
            </Tabs.Panel>
          </Tabs>
        ) : (
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>This project is in chapter mode</h3>
            <p className={styles.hint}>
              Chapter mode re-authors the source one chapter at a time and cannot change the novel’s shape. Transform mode reads the whole book, takes a plan you approve, and can
              cut and condense — it forces the loose fidelity setting, and the 1:1 reforge results already on this project are left untouched.
            </p>
            <div className={styles.actions}>
              <Button
                variant="primary"
                loading={updateConfig.isPending}
                onClick={() => updateConfig.mutate({ mode: 'transform' }, { onSuccess: () => toast.success('Transform mode enabled'), onError: e => toast.danger(e.message) })}
              >
                Switch to transform mode
              </Button>
            </div>
          </div>
        )}
      </QueryState>
    </div>
  );
}
