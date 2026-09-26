import { type ReactElement, useRef, useState } from 'react';
import { Alert, Button, Checkbox, ConfirmDialog, Dialog, Spinner, toast } from '@shadow-library/ui';

import {
  type ApiError,
  type FinalizeReviewCategory,
  type FinalizeReviewDecision,
  type FinalizeReviewItemResponse,
  type FinalizeReviewResponse,
  useDecideFinalizeReviewItemMutation,
  useDraftQuery,
  useFinalizeReadinessQuery,
  useFinalizeReviewedChapterMutation,
  useFinalizeReviewQuery,
  useFinalizeReviewSettingsMutation,
  useFinalizeUnreviewedChapterMutation,
  useKeepRoutineMutation,
  usePrepareBridgeMutation,
  usePrepareFinalizeReviewMutation,
  useRevertFinalizeReviewMutation,
  type WorkflowRunResponse,
} from '@/lib/apis';
import {
  autoKeepChoices,
  autoKeepLabel,
  bridgeSubtitle,
  categoryLabel,
  decisionAnnouncement,
  decisionLabel,
  type DecisionMode,
  finalizeAction,
  finalizeBlockers,
  finalizeLabel,
  finalizeReviewPhase,
  keepAllLabel,
  keptCount,
  nextOpenItemId,
  reviewSubtitle,
  reviewTitle,
  toggledAutoKeep,
  undoBehindBridge,
} from '@/lib/finalize-review';
import { useElapsed } from '@/lib/use-elapsed';

import { FinalizeReviewItemCard, type ItemProblem, SkipForm } from './FinalizeReviewItemCard';
import styles from './FinalizeReviewDialog.module.css';
import { IsolationBridgePanel } from './IsolationBridgePanel';

const STUCK_PREPARING_MS = 60_000;

export interface FinalizeReviewDialogProps {
  novelId: string;
  chapter: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Undo is offered only when this chapter is the latest final one; the server refuses it for any other. */
  canRevert: boolean;
}

export function FinalizeReviewDialog({ novelId, chapter, open, onOpenChange, canRevert }: FinalizeReviewDialogProps): ReactElement {
  const review = useFinalizeReviewQuery(novelId, chapter, open);
  const draft = useDraftQuery(novelId, chapter, open);
  const data = review.data;
  const final = draft.data?.status === 'final';
  const unreviewed = review.error?.code === 'FRV_001';
  const needsReadiness = open && !final && !data?.bridgeOnly && ((data?.status === 'ready' && data.current) || unreviewed);
  const readiness = useFinalizeReadinessQuery(novelId, chapter, needsReadiness);
  const phase = finalizeReviewPhase(data, review.error, needsReadiness ? readiness.data : undefined);
  const action = !draft.data || final ? null : finalizeAction(phase, needsReadiness ? readiness.data : undefined);

  const prepareReview = usePrepareFinalizeReviewMutation(novelId, chapter);
  const prepareBridge = usePrepareBridgeMutation(novelId, chapter);
  const prepare = data?.bridgeOnly ? prepareBridge : prepareReview;
  const decide = useDecideFinalizeReviewItemMutation(novelId, chapter);
  const keepRoutine = useKeepRoutineMutation(novelId, chapter);
  const settings = useFinalizeReviewSettingsMutation(novelId, chapter);
  const finalizeReviewed = useFinalizeReviewedChapterMutation(novelId, chapter);
  const finalizeUnreviewed = useFinalizeUnreviewedChapterMutation(novelId, chapter);
  const revert = useRevertFinalizeReviewMutation(novelId, chapter);

  const [pending, setPending] = useState<Record<string, DecisionMode>>({});
  const [problems, setProblems] = useState<Record<string, ItemProblem>>({});
  const [routineOpen, setRoutineOpen] = useState(false);
  const [routineSkip, setRoutineSkip] = useState<string>();
  const [checkedOpen, setCheckedOpen] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [refusal, setRefusal] = useState<ItemProblem>();
  const [announcement, setAnnouncement] = useState('');
  const [preparingSince, setPreparingSince] = useState<string>();
  const cards = useRef(new Map<string, HTMLDivElement>());
  const rows = useRef(new Map<string, HTMLLIElement>());
  const keepAllRef = useRef<HTMLButtonElement>(null);
  const finalizeRef = useRef<HTMLButtonElement>(null);

  const preparing = phase.kind === 'preparing';
  if (preparing && !preparingSince) setPreparingSince(new Date().toISOString());
  if (!preparing && preparingSince) setPreparingSince(undefined);
  const stuck = useElapsed(preparingSince) > STUCK_PREPARING_MS;

  const deciding = decide.isPending || keepRoutine.isPending;
  const formOpen = Object.keys(pending).length > 0 || routineSkip !== undefined;
  const finalizing = finalizeReviewed.isPending || finalizeUnreviewed.isPending;

  // Cleared first so the same sentence twice in a row is still read out.
  const announce = (message: string): void => {
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(message));
  };

  const focusLater = (target: HTMLElement | null | undefined): void => {
    requestAnimationFrame(() => target?.focus());
  };

  const setMode = (id: string, mode: DecisionMode | undefined): void => {
    setPending(prev => withoutKey(prev, id, mode));
    setProblems(prev => withoutKey(prev, id, undefined));
  };

  const focusNextCall = (next: FinalizeReviewResponse, afterId: string | undefined): void => {
    const nextId = afterId === undefined ? next.consequential.find(item => !item.decision)?.id : nextOpenItemId(next.consequential, afterId);
    focusLater(nextId ? cards.current.get(nextId) : finalizeRef.current);
  };

  const submit = (item: FinalizeReviewItemResponse, decision: FinalizeReviewDecision, extra: { edited?: Record<string, unknown>; reason?: string } = {}): void => {
    decide.mutate(
      { itemId: item.id, body: { decision, ...extra } },
      {
        onSuccess: next => {
          setMode(item.id, undefined);
          if (routineSkip === item.id) setRoutineSkip(undefined);
          announce(decisionAnnouncement(decision, item.claim, next.open.consequential + next.open.routine));
          if (item.triage === 'consequential') focusNextCall(next, item.id);
          else focusLater(rows.current.get(item.id));
        },
        onError: error => {
          setProblems(prev => ({ ...prev, [item.id]: { code: error.code, message: error.message } }));
          announce(error.message);
        },
      },
    );
  };

  const keepAll = (): void => {
    keepRoutine.mutate(undefined, {
      onSuccess: next => {
        announce(`Routine updates kept. ${next.open.consequential === 0 ? 'Every update is answered.' : `${next.open.consequential} still need your call.`}`);
        focusNextCall(next, undefined);
      },
      onError: error => {
        toast.danger(error.message);
        focusLater(keepAllRef.current);
      },
    });
  };

  const setAutoKeep = (category: FinalizeReviewCategory, on: boolean): void => {
    if (!data) return;
    settings.mutate(toggledAutoKeep(data.autoKeep, category, on), {
      onSuccess: () => announce(`${autoKeepLabel(category)} ${on ? 'will be kept automatically from the next chapter on' : 'will be asked again'}.`),
      onError: error => toast.danger(error.message),
    });
  };

  const failWith = (error: ApiError): void => {
    setRefusal({ code: error.code, message: error.message });
    announce(error.message);
  };

  const onFinalized = (result: WorkflowRunResponse): void => {
    if (result.status === 'failed') {
      toast.danger(`Chapter ${chapter} could not be finalized — the run is listed under Runs`);
      return;
    }
    toast.success(`Chapter ${chapter} is final`);
    onOpenChange(false);
  };

  const runFinalize = (): void => {
    setRefusal(undefined);
    const mutation = action?.kind === 'unreviewed' ? finalizeUnreviewed : finalizeReviewed;
    mutation.mutate(undefined, { onSuccess: onFinalized, onError: failWith });
  };

  const runRevert = (): void => {
    setRefusal(undefined);
    revert.mutate(undefined, {
      onSuccess: () => {
        setConfirmRevert(false);
        announce(`Chapter ${chapter}’s Story Bible updates were undone.`);
        toast.success(`Chapter ${chapter}’s Story Bible updates were undone`);
      },
      onError: error => {
        setConfirmRevert(false);
        failWith(error);
      },
    });
  };

  const closeForms = (): void => {
    setPending({});
    setProblems({});
    setRoutineSkip(undefined);
  };

  const closeAnd = (next: boolean): void => {
    if (!next) {
      closeForms();
      setRefusal(undefined);
    }
    onOpenChange(next);
  };

  const onEscapeKeyDown = (event: KeyboardEvent): void => {
    if (!formOpen) return;
    event.preventDefault();
    closeForms();
  };

  const reviewing = phase.kind === 'answering' || phase.kind === 'answered' || phase.kind === 'finalizable' || phase.kind === 'bridging' || phase.kind === 'bridged';
  const settled = phase.kind === 'applied' || phase.kind === 'reverted';
  const blockers = needsReadiness && (reviewing || unreviewed) ? finalizeBlockers(readiness.data) : [];
  const appliedBehind = undoBehindBridge(data, canRevert);
  const loading = phase.kind === 'loading' || (phase.kind === 'missing' && !draft.data);
  const readinessFailed = needsReadiness && Boolean(readiness.error) && !readiness.data;
  const kept = data ? keptCount(data) : 0;

  return (
    <Dialog open={open} onOpenChange={closeAnd}>
      <Dialog.Content size="lg" onEscapeKeyDown={onEscapeKeyDown}>
        <Dialog.Header
          title={reviewTitle(chapter, data)}
          description={reviewing && data ? (data.bridgeOnly ? bridgeSubtitle(data) : reviewSubtitle(data)) : undefined}
          showClose={false}
        />
        <Dialog.Body className={styles.body}>
          <div className="sr-only" role="status" aria-live="polite">
            {announcement}
          </div>

          {loading && (
            <div className={styles.loading}>
              <Spinner size="lg" label="Loading the review" />
            </div>
          )}
          {phase.kind === 'missing' && draft.data && final && (
            <p className={styles.note}>Chapter {chapter} was finalized before Story Bible reviews existed, so there are no updates to show.</p>
          )}
          {phase.kind === 'missing' && draft.data && !final && (
            <Alert intent="info" title="This chapter has no Story Bible review">
              It was approved before finalize reviews existed, so it finalizes as it always did: its Story Bible updates wait in the Review Queue afterwards.
            </Alert>
          )}
          {phase.kind === 'error' && (
            <Alert intent="danger" title="Couldn’t load the review" action={{ label: 'Retry', onClick: () => void review.refetch() }}>
              {phase.message}
            </Alert>
          )}
          {phase.kind === 'preparing' && data && (
            <div className={styles.preparing} role="status">
              <Spinner size="sm" />
              <span>{data.bridgeOnly ? `Reading the bridge from revision ${data.draftRevision}…` : `Reading the Story Bible updates from revision ${data.draftRevision}…`}</span>
              {stuck && (
                <Button variant="ghost" size="sm" loading={prepare.isPending} onClick={() => prepare.mutate(undefined, { onError: error => toast.danger(error.message) })}>
                  Prepare again
                </Button>
              )}
            </div>
          )}
          {phase.kind === 'failed' && (
            <Alert
              intent="danger"
              title="Reading the updates from this chapter failed"
              action={{ label: 'Prepare again', onClick: () => prepare.mutate(undefined, { onError: error => toast.danger(error.message) }) }}
            >
              {phase.error ?? 'The reader stopped before it finished.'}
            </Alert>
          )}
          {phase.kind === 'invalidated' && data?.bridgeOnly && (
            <Alert intent="warning" title="The text changed after this bridge was read">
              This bridge was read from revision {data.draftRevision}. Read it again to answer for the current text.
            </Alert>
          )}
          {phase.kind === 'invalidated' && data && !data.bridgeOnly && (
            <Alert intent="warning" title="The prose changed since you approved it">
              This review was read from revision {data.draftRevision}. Approve the chapter again to review what the new revision changes.
            </Alert>
          )}
          {phase.kind === 'applied' && (
            <Alert intent="success" title="These updates are in the Story Bible">
              They were applied when chapter {chapter} was finalized.
              {canRevert ? ' You can undo them as one set while it is the latest final chapter.' : ' Only the latest final chapter’s updates can be undone.'}
            </Alert>
          )}
          {phase.kind === 'reverted' && (
            <Alert intent="info" title="These updates were undone">
              Nothing below is in the Story Bible any more.
            </Alert>
          )}

          {data?.isolated && (reviewing || settled) && <p className={styles.note}>This chapter is isolated, so the lines each update was read from are withheld here.</p>}

          {appliedBehind !== null && (
            <div className={styles.disclosure} data-tone="success">
              <span>Story Bible updates for revision {appliedBehind}: applied</span>
              <button type="button" className={`${styles.link} ${styles.disclosureLink}`} disabled={revert.isPending} onClick={() => setConfirmRevert(true)}>
                Undo
              </button>
            </div>
          )}

          {draft.data?.isolated && <IsolationBridgePanel novelId={novelId} chapter={chapter} final={final} review={data} onPrepared={announce} />}

          {data && (reviewing || settled) && (
            <>
              {data.consequential.length > 0 && (
                <section className={styles.section} aria-label="Needs your call">
                  <span className="nf-eyebrow">
                    Needs your call · {data.open.consequential} of {data.consequential.length}
                  </span>
                  {data.consequential.map(item => (
                    <FinalizeReviewItemCard
                      key={item.id}
                      item={item}
                      pending={pending[item.id]}
                      busy={deciding}
                      readOnly={settled}
                      problem={problems[item.id]}
                      cardRef={node => {
                        if (node) cards.current.set(item.id, node);
                        else cards.current.delete(item.id);
                      }}
                      onModeChange={mode => setMode(item.id, mode)}
                      onKeep={() => submit(item, 'kept')}
                      onEdit={edited => submit(item, 'edited', { edited })}
                      onSkip={reason => submit(item, 'skipped', { reason })}
                    />
                  ))}
                </section>
              )}

              {data.routine.length > 0 && (
                <section className={styles.routine} aria-label="Routine updates">
                  <div className={styles.routineHead}>
                    <button type="button" className={styles.routineToggle} aria-expanded={routineOpen} onClick={() => setRoutineOpen(value => !value)}>
                      {routineOpen ? '▾' : '▸'} Routine · {data.routine.length}
                    </button>
                    <span className={styles.routineHint}>Where people are, who appeared, small world details, promises that moved</span>
                    {!settled && (
                      <Button
                        ref={keepAllRef}
                        className={styles.keepAll}
                        variant="secondary"
                        size="sm"
                        loading={keepRoutine.isPending}
                        disabled={deciding || data.open.routine === 0}
                        onClick={keepAll}
                      >
                        {keepAllLabel(data)}
                      </Button>
                    )}
                  </div>
                  {routineOpen && (
                    <ul className={styles.routineList}>
                      {data.routine.map(item => (
                        <li
                          key={item.id}
                          ref={node => {
                            if (node) rows.current.set(item.id, node);
                            else rows.current.delete(item.id);
                          }}
                          tabIndex={-1}
                          className={styles.routineRow}
                          data-decision={item.decision ?? undefined}
                        >
                          <span className={styles.routineKind}>{categoryLabel(item.category)}</span>
                          <span className={styles.routineText}>{item.claim}</span>
                          <span className={styles.routineActions}>
                            {(settled || item.decision) && <span className={styles.routineState}>{decisionLabel(item)}</span>}
                            {!settled && item.decision !== 'kept' && (
                              <button type="button" className={styles.link} disabled={deciding} onClick={() => submit(item, 'kept')} aria-label={`Keep: ${item.claim}`}>
                                Keep
                              </button>
                            )}
                            {!settled && item.decision !== 'skipped' && (
                              <button type="button" className={styles.link} disabled={deciding} onClick={() => setRoutineSkip(item.id)} aria-label={`Skip: ${item.claim}`}>
                                Skip
                              </button>
                            )}
                          </span>
                          {routineSkip === item.id && (
                            <SkipForm
                              label={item.claim}
                              initial={item.reason ?? ''}
                              busy={deciding}
                              onCancel={() => {
                                setRoutineSkip(undefined);
                                focusLater(rows.current.get(item.id));
                              }}
                              onSkip={reason => submit(item, 'skipped', { reason })}
                            />
                          )}
                          {problems[item.id] && (
                            <p className={styles.problem} role="alert">
                              {problems[item.id]?.message}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {data.consequential.length === 0 && data.routine.length === 0 && (
                <p className={styles.note}>{data.bridgeOnly ? 'No summary was read from this text, so nothing crosses.' : 'This chapter changes nothing in the Story Bible.'}</p>
              )}

              {!data.bridgeOnly && (
                <div className={styles.disclosure} data-tone={data.disclosure.clear ? 'success' : 'warning'}>
                  <span>{data.disclosure.copy}</span>
                  <button type="button" className={`${styles.link} ${styles.disclosureLink}`} aria-expanded={checkedOpen} onClick={() => setCheckedOpen(value => !value)}>
                    What was checked
                  </button>
                </div>
              )}
              {!data.bridgeOnly && !data.disclosure.clear && (
                <ul className={styles.reasons}>
                  {data.disclosure.findings.map(finding => (
                    <li key={finding}>{finding}</li>
                  ))}
                </ul>
              )}
              {!data.bridgeOnly && checkedOpen && (
                <span className={styles.checked}>
                  The updates read from revision {data.draftRevision} were checked against what the plan still keeps locked at this chapter. It’s a model reading, so “nothing
                  detected” is not a guarantee.
                </span>
              )}
            </>
          )}

          {readinessFailed && (
            <Alert intent="danger" title="Couldn’t check whether this chapter can be finalized" action={{ label: 'Retry', onClick: () => void readiness.refetch() }}>
              {readiness.error?.message}
            </Alert>
          )}
          {blockers.length > 0 && (
            <Alert intent="warning" title={`Chapter ${chapter} can’t be finalized yet`}>
              <ul className={styles.reasons}>
                {blockers.map(reason => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </Alert>
          )}
          {refusal && (
            <Alert intent="danger" title={phase.kind === 'applied' || appliedBehind !== null ? 'Couldn’t undo the updates' : 'Couldn’t finalize'} role="alert">
              {refusal.message}
            </Alert>
          )}
        </Dialog.Body>

        <Dialog.Footer className={styles.footer}>
          {data && reviewing && !data.bridgeOnly && autoKeepChoices(data).length > 0 && (
            <span className={styles.autoKeep} role="group" aria-label="Keep automatically from now on">
              <span>Keep automatically from now on:</span>
              {autoKeepChoices(data).map(category => (
                <Checkbox
                  key={category}
                  label={autoKeepLabel(category)}
                  checked={data.autoKeep.includes(category)}
                  disabled={settings.isPending}
                  onCheckedChange={checked => setAutoKeep(category, checked === true)}
                />
              ))}
            </span>
          )}
          <Dialog.Close asChild>
            <Button className={styles.back} variant="ghost">
              Back to the chapter
            </Button>
          </Dialog.Close>
          {action && (
            <Button ref={finalizeRef} variant="primary" loading={finalizing} disabled={!action.enabled || deciding} onClick={runFinalize}>
              {action.kind === 'unreviewed' ? 'Finalize' : finalizeLabel(kept)}
            </Button>
          )}
          {phase.kind === 'applied' && canRevert && (
            <Button variant="secondary" loading={revert.isPending} onClick={() => setConfirmRevert(true)}>
              Undo these updates
            </Button>
          )}
        </Dialog.Footer>
      </Dialog.Content>
      <ConfirmDialog
        open={confirmRevert}
        onOpenChange={setConfirmRevert}
        intent="danger"
        title={`Undo chapter ${chapter}’s Story Bible updates?`}
        description="Puts back everything finalize changed in the Story Bible, as one set. The chapter’s text stays final, and later drafts are marked out of date."
        confirmLabel="Undo updates"
        loading={revert.isPending}
        onConfirm={runRevert}
      />
    </Dialog>
  );
}

function withoutKey<T>(record: Record<string, T>, key: string, value: T | undefined): Record<string, T> {
  if (value !== undefined) return { ...record, [key]: value };
  const { [key]: _removed, ...rest } = record;
  return rest;
}
