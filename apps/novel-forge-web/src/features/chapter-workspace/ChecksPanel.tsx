import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, ConfirmDialog, EmptyState, Input, Select, Spinner } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf/StatusChip';
import {
  type ApiError,
  type ChapterReviewKind,
  type ChapterReviewRecordResponse,
  type CostTier,
  type ListChapterReviewsResponse,
  type ReviewFindingResponse,
  type ReviewRemedyAction,
} from '@/lib/apis';
import {
  categoryLabel,
  dispositionView,
  type FindingFormAction,
  findingState,
  groupFindings,
  isModelKind,
  kindDescription,
  kindLabel,
  kindNoun,
  kindStatus,
  kindSubline,
  latestOf,
  type OpenFindingForm,
  remedyNote,
  REVIEW_KINDS,
  type ReviewJobState,
  severityIntent,
  severityLabel,
  staleNotice,
  versionLabel,
} from '@/lib/chapter-checks';
import { tierLabel } from '@/lib/usage';

import styles from './ChecksPanel.module.css';

const COST_TIERS: readonly CostTier[] = ['economy', 'balanced', 'performant'];
const DEFAULT_TIER = 'default';

type TierChoice = CostTier | typeof DEFAULT_TIER;

export interface ChecksPanelProps {
  list?: ListChapterReviewsResponse;
  loading: boolean;
  error?: ApiError | null;
  onRetry: () => void;
  kind: ChapterReviewKind;
  onKindChange: (kind: ChapterReviewKind) => void;
  jobs: ReviewJobState;
  /** Why no review can start now; the run buttons are withdrawn and this is said instead. */
  runBlockedReason?: string;
  starting?: ChapterReviewKind;
  onRun: (kind: ChapterReviewKind, costTier?: CostTier) => void;
  busyFinding?: string;
  /** The one finding whose reason form is open; lifted so the drawer can close it on Escape instead of closing itself. */
  form?: OpenFindingForm;
  onFormChange: (form: OpenFindingForm | undefined) => void;
  /** Set while the chapter is approved: undoing a blocking finding's dismissal or override on the judge review withdraws that approval. */
  approvedRevision?: number;
  /** `onFailed` runs when the server refuses the answer, so the card stops waiting to move focus. */
  onRemedy: (review: ChapterReviewRecordResponse, finding: ReviewFindingResponse, action: ReviewRemedyAction, reason: string | undefined, onFailed: () => void) => void;
  onClearRemedy: (review: ChapterReviewRecordResponse, finding: ReviewFindingResponse, onFailed: () => void) => void;
  heldActions?: ReactNode;
}

export function ChecksPanel(props: ChecksPanelProps): React.JSX.Element {
  const { list, loading, error, onRetry } = props;
  if (loading) return <Spinner size="sm" label="Loading the checks" />;
  if (error && !list)
    return (
      <Alert intent="danger" title="Couldn’t load the checks" action={{ label: 'Try again', onClick: onRetry }}>
        {error.message}
      </Alert>
    );
  return <ChecksContent {...props} />;
}

function ChecksContent({ list, kind, onKindChange, jobs, ...rest }: ChecksPanelProps): React.JSX.Element {
  const baseId = useId();
  const tabs = useRef(new Map<ChapterReviewKind, HTMLButtonElement>());
  const tabId = (k: ChapterReviewKind): string => `${baseId}-tab-${k}`;
  const panelId = `${baseId}-panel`;

  const move = (event: KeyboardEvent, index: number): void => {
    const last = REVIEW_KINDS.length - 1;
    const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = REVIEW_KINDS[(next + REVIEW_KINDS.length) % REVIEW_KINDS.length] ?? kind;
    onKindChange(target);
    tabs.current.get(target)?.focus();
  };

  return (
    <div className={styles.panel}>
      <div role="tablist" aria-label="Checks" aria-orientation="vertical" className={styles.kinds}>
        {REVIEW_KINDS.map((k, index) => {
          const review = latestOf(list, k);
          const status = kindStatus(review, jobs.active[k]);
          const selected = k === kind;
          return (
            <button
              key={k}
              ref={el => void (el ? tabs.current.set(k, el) : tabs.current.delete(k))}
              id={tabId(k)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              className="nf-selrow nf-selrow-flat"
              data-active={selected || undefined}
              onClick={() => onKindChange(k)}
              onKeyDown={event => move(event, index)}
            >
              <span className={styles.kindLine}>
                <span className={styles.kindName}>{kindLabel(k)}</span>
                <StatusChip intent={status.intent}>{status.label}</StatusChip>
              </span>
              <span className={styles.kindSub}>{kindSubline(review, list?.currentRevision)}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={tabId(kind)} className={styles.detail}>
        <KindDetail key={kind} kind={kind} list={list} jobs={jobs} {...rest} />
      </div>
    </div>
  );
}

type KindDetailProps = Omit<ChecksPanelProps, 'loading' | 'error' | 'onRetry' | 'onKindChange'>;

function KindDetail(props: KindDetailProps): React.JSX.Element {
  const { kind, list, jobs, runBlockedReason, starting, onRun, busyFinding, form, onFormChange, approvedRevision, onRemedy, onClearRemedy, heldActions } = props;
  const review = latestOf(list, kind);
  const [tier, setTier] = useState<TierChoice>(DEFAULT_TIER);
  const job = jobs.active[kind];
  const failedJob = jobs.failed[kind];
  const run = (): void => onRun(kind, tier === DEFAULT_TIER ? undefined : tier);

  const runner = job ? (
    <div role="status" className={styles.running}>
      <Spinner size="sm" />
      <span>{job === 'queued' ? `${kindLabel(kind)} queued — it starts in a moment.` : `${kindLabel(kind)} is reading the chapter — this can take a minute.`}</span>
    </div>
  ) : runBlockedReason ? (
    <p className={styles.hint}>{runBlockedReason}</p>
  ) : (
    <div className={styles.runRow}>
      <Button variant="secondary" size="sm" loading={starting === kind} onClick={run}>
        {review ? 'Run a new review' : `Run the ${kindNoun(kind)}`}
      </Button>
      {isModelKind(kind) && (
        <Select size="sm" value={tier} onValueChange={value => setTier(value as TierChoice)} aria-label="Cost tier for this review">
          <Select.Item value={DEFAULT_TIER}>Novel’s tier</Select.Item>
          {COST_TIERS.map(option => (
            <Select.Item key={option} value={option}>
              {tierLabel(option)}
            </Select.Item>
          ))}
        </Select>
      )}
      <span className={styles.hint}>Works on chapters you wrote yourself too</span>
    </div>
  );

  const failure = failedJob && (
    <Alert intent="danger" title={`The last ${kindNoun(kind)} didn’t finish`}>
      {failedJob}
    </Alert>
  );

  if (!review)
    return (
      <>
        {failure}
        <EmptyState size="inline" title={`No ${kindNoun(kind)} yet`} description={kindDescription(kind)} />
        {runner}
      </>
    );

  const disposition = dispositionView(review);
  const stale = staleNotice(review, list?.currentRevision);
  const groups = groupFindings(review.findings);
  const answerable = !review.stale;

  return (
    <>
      <div className={styles.head}>
        <span className={styles.title}>
          {kindLabel(kind)} · {versionLabel(review.draftRevision)}
        </span>
        <StatusChip intent={disposition.intent}>{disposition.label}</StatusChip>
      </div>
      <span className={styles.meta}>{reviewMeta(review)}</span>
      {failure}
      {stale && (
        <div role="status" className={styles.notice} data-tone="warning">
          <span>{stale}</span>
          {!job && !runBlockedReason && (
            <Button variant="secondary" size="sm" loading={starting === kind} onClick={run} className={styles.noticeAction}>
              {list?.currentRevision == null ? 'Review the current text' : `Review version ${list.currentRevision}`}
            </Button>
          )}
        </div>
      )}
      {review.disposition === 'failed' ? (
        <div className={styles.notice} data-tone="neutral">
          Not assessed — this review couldn’t be read, so it checked nothing. Run it again.
        </div>
      ) : (
        review.openFindings === 0 && (
          <div className={`${styles.notice} ${styles.clean}`} data-tone="success">
            No issue detected · {versionLabel(review.draftRevision)}
          </div>
        )
      )}
      {review.note && <p className={styles.note}>{review.note}</p>}
      {groups.length > 0 && (
        <section aria-label="Findings" className={styles.section}>
          <span className={styles.cap}>Findings · {review.openFindings} open</span>
          {groups.map(group => (
            <div key={group.severity} className={styles.section}>
              <span className={styles.cap}>
                {group.label} · {group.findings.length}
              </span>
              {group.findings.map(finding => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  answerable={answerable}
                  busy={busyFinding === finding.id}
                  form={form?.findingId === finding.id ? form.action : undefined}
                  onFormChange={action => onFormChange(action ? { kind, findingId: finding.id, action } : undefined)}
                  undoWithdraws={kind === 'judge' && finding.severity === 'blocking' ? approvedRevision : undefined}
                  onRemedy={(action, reason, onFailed) => onRemedy(review, finding, action, reason, onFailed)}
                  onClear={onFailed => onClearRemedy(review, finding, onFailed)}
                />
              ))}
            </div>
          ))}
        </section>
      )}
      {kind === 'judge' && answerable && review.openBlocking > 0 && heldActions}
      {review.checked.length > 0 && (
        <section className={styles.checked}>
          <span className={styles.cap}>What was checked</span>
          {review.checked.map(item => (
            <span key={item}>✓ {item}</span>
          ))}
          {isModelKind(kind) && <span className={styles.disclaimer}>A model does these checks. “No issue detected” means it found nothing, not that nothing is there.</span>}
        </section>
      )}
      {runner}
    </>
  );
}

function reviewMeta(review: ChapterReviewRecordResponse): string {
  const parts = ['Saved with the chapter'];
  if (review.model) parts.push(`read by ${review.model}`);
  else if (!isModelKind(review.kind)) parts.push('measured, no model call');
  if (review.costTier) parts.push(tierLabel(review.costTier));
  if (review.isolated) parts.push('isolated chapter');
  parts.push('reviews never edit your text');
  return parts.join(' · ');
}

interface FindingCardProps {
  finding: ReviewFindingResponse;
  answerable: boolean;
  busy: boolean;
  form?: FindingFormAction;
  onFormChange: (form: FindingFormAction | undefined) => void;
  /** The approved version an undo would withdraw the approval of; asked before undoing. */
  undoWithdraws?: number;
  onRemedy: (action: ReviewRemedyAction, reason: string | undefined, onFailed: () => void) => void;
  onClear: (onFailed: () => void) => void;
}

export function FindingCard({ finding, answerable, busy, form, onFormChange, undoWithdraws, onRemedy, onClear }: FindingCardProps): React.JSX.Element {
  const [reason, setReason] = useState('');
  const [confirmUndo, setConfirmUndo] = useState(false);
  const reasonId = useId();
  const undoRef = useRef<HTMLButtonElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const acted = useRef(false);
  const state = findingState(finding);
  const blocking = finding.severity === 'blocking';
  const remedyAction = finding.remedy?.action;

  useEffect(() => {
    if (!acted.current) return;
    acted.current = false;
    (remedyAction ? undoRef : firstActionRef).current?.focus();
  }, [remedyAction]);

  const stopWaiting = (): void => {
    acted.current = false;
  };

  const answer = (action: ReviewRemedyAction, text?: string): void => {
    acted.current = true;
    onRemedy(action, text, stopWaiting);
  };

  const clear = (): void => {
    setConfirmUndo(false);
    acted.current = true;
    onClear(stopWaiting);
  };

  const openForm = (action: FindingFormAction): void => {
    setReason('');
    onFormChange(action);
  };

  return (
    <div className={styles.finding} data-settled={state === 'settled' || undefined}>
      <span className={styles.findingHead}>
        <StatusChip intent={severityIntent(finding.severity)}>{severityLabel(finding.severity)}</StatusChip>
        <span className={styles.findingTitle}>{categoryLabel(finding.category)}</span>
      </span>
      <span>{finding.text}</span>
      {finding.evidence && <q className={styles.evidence}>{finding.evidence}</q>}

      {finding.remedy && (
        <span className={styles.remedy}>
          {remedyNote(finding.remedy, finding.severity)}
          {answerable && (
            <>
              {' · '}
              <button
                ref={undoRef}
                type="button"
                className={styles.undo}
                disabled={busy}
                onClick={() => (undoWithdraws !== undefined && state === 'settled' ? setConfirmUndo(true) : clear())}
              >
                Undo
              </button>
            </>
          )}
        </span>
      )}

      {answerable && state === 'open' && !form && (
        <span className={styles.actions}>
          <Button ref={firstActionRef} variant="secondary" size="sm" disabled={busy} onClick={() => answer('fixing_myself')}>
            I’ll fix it myself
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => openForm('dismissed')}>
            Dismiss…
          </Button>
          {blocking && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => openForm('overridden')}>
              Override…
            </Button>
          )}
        </span>
      )}

      {answerable && state === 'open' && form && (
        <form
          className={styles.form}
          onSubmit={event => {
            event.preventDefault();
            if (form === 'dismissed' && !reason.trim()) return;
            answer(form, reason);
          }}
        >
          <label htmlFor={reasonId} className="sr-only">
            {form === 'dismissed' ? 'Why dismiss this finding?' : 'Why is it intended?'}
          </label>
          <Input
            id={reasonId}
            size="sm"
            autoFocus
            value={reason}
            onValueChange={setReason}
            placeholder={form === 'dismissed' ? 'Why? e.g. the repetition is deliberate' : 'Why is it intended? (optional)'}
          />
          <span className={styles.actions}>
            <Button type="submit" variant="secondary" size="sm" loading={busy} disabled={form === 'dismissed' && !reason.trim()}>
              {form === 'dismissed' ? 'Dismiss' : 'Override'}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onFormChange(undefined)}>
              Cancel
            </Button>
          </span>
        </form>
      )}

      {undoWithdraws !== undefined && (
        <ConfirmDialog
          open={confirmUndo}
          onOpenChange={setConfirmUndo}
          intent="danger"
          title="Undo and reopen this blocking finding?"
          description={`This will withdraw your approval of version ${undoWithdraws}. The finding holds the next chapter again until you answer it.`}
          confirmLabel="Undo and withdraw approval"
          onConfirm={clear}
        />
      )}
    </div>
  );
}
