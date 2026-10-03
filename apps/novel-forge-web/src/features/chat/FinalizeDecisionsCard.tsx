import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, Spinner, toast } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';
import { SkipForm } from '@/features/chapter-workspace';
import {
  type FinalizeReviewDecision,
  type FinalizeReviewItemResponse,
  type FinalizeReviewResponse,
  useDecideFinalizeReviewItemMutation,
  useFinalizeReadinessQuery,
  useFinalizeReviewedChapterMutation,
  usePrepareFinalizeReviewMutation,
} from '@/lib/apis';
import {
  askedItems,
  decisionLabel,
  decisionsCaption,
  decisionsPhase,
  decisionsTitle,
  decisionTag,
  evidenceLine,
  finalizeBlockers,
  fixChapterNote,
  isCanonConflict,
  itemStakes,
} from '@/lib/finalize-review';

import styles from './Chat.module.css';

export interface FinalizeDecisionsCardProps {
  novelId: string;
  review: FinalizeReviewResponse;
  /** Its reading job still runs, so a review that asks nothing may be finalizing on its own. */
  settling: boolean;
  /** "Keep canon, fix the chapter": starts a revision request for the chapter instead of recording anything. */
  onFixChapter: (chapter: number, note: string) => void;
}

interface Problem {
  itemId?: string;
  message: string;
}

/**
 * The Story Bible updates of an approved chapter that approval could not keep on its own: an unsure one is added or skipped, and a conflict
 * either lets canon follow the chapter or sends the chapter back for a fix. Done finalizes once every one is answered.
 */
export function FinalizeDecisionsCard({ novelId, review, settling, onFixChapter }: FinalizeDecisionsCardProps): React.JSX.Element {
  const { chapter } = review;
  const decide = useDecideFinalizeReviewItemMutation(novelId, chapter);
  const finalize = useFinalizeReviewedChapterMutation(novelId, chapter);
  const prepare = usePrepareFinalizeReviewMutation(novelId, chapter);
  const phase = decisionsPhase(review, settling);
  const answered = phase === 'answered';
  const readiness = useFinalizeReadinessQuery(novelId, chapter, answered);
  const [skipping, setSkipping] = useState<string>();
  const [problem, setProblem] = useState<Problem>();
  const blockers = answered ? finalizeBlockers(readiness.data) : [];
  const busy = decide.isPending || finalize.isPending;

  const submit = (item: FinalizeReviewItemResponse, decision: FinalizeReviewDecision, reason?: string): void => {
    setProblem(undefined);
    decide.mutate(
      { itemId: item.id, body: { decision, ...(reason ? { reason } : {}) } },
      {
        onSuccess: () => setSkipping(undefined),
        onError: error => setProblem({ itemId: item.id, message: error.message }),
      },
    );
  };

  const done = (): void => {
    setProblem(undefined);
    finalize.mutate(undefined, {
      onSuccess: result => {
        if (result.status === 'failed') toast.danger(`Chapter ${chapter} could not be finalized — the run is listed under Runs`);
        else toast.success(`Chapter ${chapter} is final`);
      },
      onError: error => setProblem({ message: error.message }),
    });
  };

  const readAgain = (): void => prepare.mutate(undefined, { onError: error => toast.danger(error.message) });

  if (phase === 'reading' || phase === 'settling') {
    return (
      <section className={styles.turnCard} aria-label={`Chapter ${chapter} Story Bible updates`}>
        <div className={styles.cardHead} role="status">
          <Spinner size="sm" />
          <span className={styles.cardTitle}>
            {phase === 'reading' ? `Chapter ${chapter}: reading what it adds to the Story Bible…` : `Chapter ${chapter}: adding it to the Story Bible…`}
          </span>
        </div>
      </section>
    );
  }

  if (phase === 'failed') {
    return (
      <section className={styles.turnCard} data-status="conflicted" aria-label={`Chapter ${chapter} Story Bible updates`}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>Chapter {chapter}: reading its Story Bible updates failed</span>
          <Button size="sm" variant="secondary" className={styles.pushEnd} loading={prepare.isPending} onClick={readAgain}>
            Read it again
          </Button>
        </div>
        {review.error && <div className={styles.turnCardNote}>{review.error}</div>}
      </section>
    );
  }

  return (
    <section className={styles.turnCard} aria-label={`Story Bible decisions from chapter ${chapter}`}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>{decisionsTitle(review)}</span>
        <StatusChip intent="warning" dot>
          waiting on you
        </StatusChip>
        <Button size="sm" variant="ghost" className={styles.pushEnd} asChild>
          <Link to="/novels/$novelId/chapters" params={{ novelId }} search={{ chapter }}>
            Open in Chapters
          </Link>
        </Button>
      </div>
      <div className={styles.turnOps}>
        {askedItems(review).map(item => (
          <DecisionItem
            key={item.id}
            item={item}
            chapter={chapter}
            busy={busy}
            skipping={skipping === item.id}
            problem={problem?.itemId === item.id ? problem.message : undefined}
            onKeep={() => submit(item, 'kept')}
            onSkip={reason => submit(item, 'skipped', reason)}
            onSkipping={open => setSkipping(open ? item.id : undefined)}
            onFixChapter={() => onFixChapter(chapter, fixChapterNote(item))}
          />
        ))}
      </div>
      {blockers.map(blocker => (
        <div key={blocker} className={styles.turnCardWarning}>
          {blocker}
        </div>
      ))}
      {problem && !problem.itemId && (
        <div className={styles.turnCardNote} role="alert">
          {problem.message}
        </div>
      )}
      <div className={styles.cardActions}>
        <Button size="sm" variant="primary" loading={finalize.isPending} disabled={!answered || busy || blockers.length > 0} onClick={done}>
          Done
        </Button>
        <span className={`${styles.caption} ${styles.pushEnd}`}>{answered ? decisionsCaption(review) : 'Answer each one; Done then makes the chapter final.'}</span>
      </div>
    </section>
  );
}

interface DecisionItemProps {
  item: FinalizeReviewItemResponse;
  chapter: number;
  busy: boolean;
  skipping: boolean;
  problem: string | undefined;
  onKeep: () => void;
  onSkip: (reason: string) => void;
  onSkipping: (open: boolean) => void;
  onFixChapter: () => void;
}

function DecisionItem({ item, chapter, busy, skipping, problem, onKeep, onSkip, onSkipping, onFixChapter }: DecisionItemProps): React.JSX.Element {
  const conflict = isCanonConflict(item);
  const tag = decisionTag(item);
  const evidence = evidenceLine(item.evidence);
  const stakes = itemStakes(item);
  const kept = item.decision === 'kept' || item.decision === 'edited';

  return (
    <div className={styles.turnOp} data-declined={item.decision === 'skipped' || undefined}>
      <div className={styles.turnOpRow}>
        <StatusChip intent={tag.intent}>{tag.label}</StatusChip>
        <span>{item.claim}</span>
        {item.decision && (
          <span className={styles.pushEnd}>
            <StatusChip intent="neutral">{decisionLabel(item)}</StatusChip>
          </span>
        )}
      </div>
      {evidence && (
        <div className={styles.turnOpNote}>
          {evidence.label && `${evidence.label} `}
          {evidence.text}
        </div>
      )}
      {stakes && <div className={styles.turnOpNote}>{stakes}</div>}
      {item.decision === 'skipped' && item.reason && <div className={styles.turnOpNote}>Skipped because: {item.reason}</div>}
      {skipping ? (
        <SkipForm label={item.claim} initial={item.reason ?? ''} busy={busy} onCancel={() => onSkipping(false)} onSkip={onSkip} />
      ) : (
        <div className={styles.turnOpActions} role="group" aria-label={`Decision for ${item.claim}`}>
          {conflict ? (
            <>
              <Button size="sm" variant="secondary" disabled={busy} onClick={onFixChapter}>
                Keep canon, fix chapter {chapter}
              </Button>
              <Button size="sm" variant={kept ? 'primary' : 'secondary'} aria-pressed={kept} disabled={busy} onClick={onKeep}>
                Update canon
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant={kept ? 'primary' : 'secondary'} aria-pressed={kept} disabled={busy} onClick={onKeep}>
                Add
              </Button>
              <Button size="sm" variant="ghost" aria-pressed={item.decision === 'skipped'} disabled={busy} onClick={() => onSkipping(true)}>
                Skip
              </Button>
            </>
          )}
        </div>
      )}
      {problem && (
        <div className={styles.turnOpError} role="alert">
          {problem}
        </div>
      )}
    </div>
  );
}
