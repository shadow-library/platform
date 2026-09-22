import { type ReactElement, useState } from 'react';
import { Alert, Input, Textarea, toast } from '@shadow-library/ui';

import { isRoundLive, useCancelBlueprintRoundMutation, useLedgerEntriesQuery, useLockBlueprintStepMutation, useStartBlueprintRoundMutation } from '@/lib/apis';

import { anchorLine, readAnchoredLine, STALE_LINE_NOTE } from './anchored-line';
import { blueprintStepMeta, type StepScreenProps } from './blueprint-steps';
import { passRoundKey, passRunningLabel, sameJson } from './engine-pass';
import { LockBar } from './LockBar';
import { PassSliceAlert } from './PassSliceAlert';
import { buildRoundBody, EMPTY_STEER, roundThread, type SteerDraft, stepPayload } from './round';
import { RoundStatus } from './RoundStatus';
import {
  buildSpineSelection,
  editMovement,
  editReveal,
  MOVEMENT_CHAPTERS_MAX,
  MOVEMENT_CHAPTERS_MIN,
  MOVEMENTS_MAX,
  nextSpineDraft,
  parseSpineRound,
  restoreSpineDraft,
  REVEALS_MAX,
  SPINE_LABELS,
  SPINE_LINE_MAX,
  SPINE_NAME_MAX,
  SPINE_REVEALS_TOPIC,
  SPINE_TEXT_MAX,
  SPINE_TOPIC,
  SPINE_WRITER_LINE_MAX,
  type SpineDraft,
  spineDraftAnchor,
  spineDraftFrom,
  spineLockIssue,
  spineRevealsDraftAnchor,
} from './spine-step';
import { SteerBox } from './SteerBox';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Drawing the shape of the novel…';
const LEDGER_QUERY = { topics: `${SPINE_TOPIC},${SPINE_REVEALS_TOPIC}` };

/** The whole novel as movements, with the ending question pinned above them and the big truths placed under them. */
export function SpineStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);
  const parsed = parseSpineRound(round);
  const labels = SPINE_LABELS[parsed.mode];

  const [draft, setDraft] = useState<SpineDraft>(() => spineDraftFrom(parsed));
  const [offered, setOffered] = useState<SpineDraft>(() => spineDraftFrom(parsed));
  const [read, setRead] = useState(false);
  const [steer, setSteer] = useState<SteerDraft>(EMPTY_STEER);
  const [roundKey, setRoundKey] = useState(() => passRoundKey(round));

  const startRound = useStartBlueprintRoundMutation(projectId, step.key);
  const cancelRound = useCancelBlueprintRoundMutation(projectId, step.key);
  const lockStep = useLockBlueprintStepMutation(projectId, step.key);
  const decidedBefore = useLedgerEntriesQuery(projectId, LEDGER_QUERY);

  if (!read && decidedBefore.data != null) {
    setRead(true);
    const locked = restoreSpineDraft(decidedBefore.data.entries);
    if (locked) setDraft(current => (sameJson(current, offered) ? locked : current));
  }

  if (passRoundKey(round) !== roundKey) {
    setRoundKey(passRoundKey(round));
    setSteer(EMPTY_STEER);
    setDraft(current => nextSpineDraft(current, offered, parsed));
    setOffered(spineDraftFrom(parsed));
  }

  const busy = isRoundLive(round) || startRound.isPending;
  const anchor = spineDraftAnchor(draft);
  const revealsAnchorText = spineRevealsDraftAnchor(draft);
  const why = readAnchoredLine(draft.why, anchor);
  const writerLine = readAnchoredLine(draft.writerLine, anchor);
  const revealsLine = readAnchoredLine(draft.revealsWriterLine, revealsAnchorText);
  const issue = spineLockIssue(draft, parsed);
  const selection = buildSpineSelection(draft, parsed);
  const movements = draft.movements.length < MOVEMENTS_MAX ? [...draft.movements, { title: '', summary: '', change: '', chapters: 0 }] : draft.movements;
  const reveals = draft.reveals.length < REVEALS_MAX ? [...draft.reveals, { movement: 1, when: '', truth: '', writerNote: '', terms: '' }] : draft.reveals;
  const named = draft.movements.filter(movement => movement.title.trim());

  const patch = (next: Partial<SpineDraft>): void => setDraft(current => ({ ...current, ...next }));

  const run = (): void => {
    startRound.mutate(buildRoundBody(steer), { onSuccess: () => setSteer(EMPTY_STEER), onError: err => toast.danger(err.message) });
  };

  const lock = (): void => {
    if (!selection) return;
    lockStep.mutate(
      { selection: stepPayload(selection) },
      {
        onSuccess: result => {
          if (result.followUp?.ok === false) toast.warning(result.followUp.error ?? 'The volumes were saved, but approving the plan failed.');
          else toast.success('The spine is locked');
          onLocked();
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  return (
    <>
      {round == null && (
        <section className={styles.card}>
          <p className={styles.cardLede}>This screen fills itself in when the shape of the novel is drawn. Steer below to run it.</p>
        </section>
      )}

      {decidedBefore.isError && (
        <Alert
          intent="danger"
          title="Couldn’t read back what you already decided"
          action={{ label: decidedBefore.isFetching ? 'Retrying…' : 'Try again', onClick: () => void decidedBefore.refetch() }}
        >
          Locking now would retire the answer this screen cannot see, so it stays disabled until the Notebook loads. {decidedBefore.error?.message}
        </Alert>
      )}

      <PassSliceAlert
        moved={step.sliceMoved}
        onAdopt={
          busy || sameJson(draft, offered)
            ? undefined
            : () => {
                setDraft(spineDraftFrom(parsed));
                setOffered(spineDraftFrom(parsed));
              }
        }
      />

      <RoundStatus
        round={round}
        runningLabel={passRunningLabel(round, step.key, RUNNING_LABEL)}
        onCancel={() => cancelRound.mutate(undefined, { onError: err => toast.danger(err.message) })}
        cancelling={cancelRound.isPending}
        onRetry={run}
        retrying={startRound.isPending}
      />

      {parsed.endingQuestion && (
        <section className={styles.card}>
          <div className={styles.pairHead}>
            <h2 className={styles.cardTitle}>The ending question</h2>
            <span className={styles.pairCount}>Pinned in the Heart phase</span>
          </div>
          <p className={styles.cardLede}>{parsed.endingQuestion}</p>
        </section>
      )}

      {round != null && (
        <section className={styles.card}>
          <div className={styles.pairHead}>
            <h2 className={styles.cardTitle}>{labels.movements}</h2>
            <span className={styles.pairCount}>One per volume · sketches only</span>
          </div>
          <p className={styles.cardLede}>Each one says what happens and what changes in the protagonist. Empty a name to drop it.</p>
          <div className={styles.movementStrip}>
            {movements.map((movement, index) => (
              <div key={index} className={styles.movementCard}>
                <Input
                  aria-label={`${labels.movement} ${index + 1}`}
                  placeholder={labels.movement}
                  value={movement.title}
                  maxLength={SPINE_NAME_MAX}
                  disabled={busy}
                  onValueChange={title => patch({ movements: editMovement(movements, index, { title }) })}
                />
                <Textarea
                  aria-label={`What happens in ${labels.movement.toLowerCase()} ${index + 1}`}
                  placeholder="What happens"
                  value={movement.summary}
                  maxLength={SPINE_LINE_MAX}
                  minRows={2}
                  autoGrow
                  disabled={busy}
                  onValueChange={summary => patch({ movements: editMovement(movements, index, { summary }) })}
                />
                <Input
                  aria-label={`What changes in the protagonist in ${labels.movement.toLowerCase()} ${index + 1}`}
                  placeholder="The protagonist ends it…"
                  value={movement.change}
                  maxLength={SPINE_LINE_MAX}
                  disabled={busy}
                  onValueChange={change => patch({ movements: editMovement(movements, index, { change }) })}
                />
                <Input
                  aria-label={`How many chapters ${labels.movement.toLowerCase()} ${index + 1} runs for`}
                  placeholder="Chapters"
                  type="number"
                  min={MOVEMENT_CHAPTERS_MIN}
                  max={MOVEMENT_CHAPTERS_MAX}
                  value={movement.chapters > 0 ? String(movement.chapters) : ''}
                  disabled={busy}
                  onValueChange={chapters => patch({ movements: editMovement(movements, index, { chapters: Math.min(Number(chapters) || 0, MOVEMENT_CHAPTERS_MAX) }) })}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {round != null && (
        <section className={styles.card}>
          <div className={styles.pairHead}>
            <h2 className={styles.cardTitle}>{labels.reveals}</h2>
            <span className={styles.pairCount}>{parsed.revealsRequired ? 'Required by your reader promise' : 'Optional'}</span>
          </div>
          <p className={styles.cardLede}>
            Each one becomes a canon fact scheduled to the movement you place it in. Only the note and the give-away phrases reach whoever writes the chapters before it — the truth
            itself never goes on a page.
          </p>
          <div className={styles.editFields}>
            {reveals.map((reveal, index) => (
              <div key={index} className={styles.placeCard}>
                <div className={styles.revealRow}>
                  <span className={styles.revealMark}>{index === 0 ? 'Pinned' : 'Sketch'}</span>
                  <Input
                    aria-label={`Where ${labels.reveal.toLowerCase()} ${index + 1} comes out`}
                    placeholder="Where it comes out"
                    value={reveal.when}
                    maxLength={SPINE_NAME_MAX}
                    disabled={busy}
                    onValueChange={when => patch({ reveals: editReveal(reveals, index, { when }) })}
                  />
                  <Input
                    aria-label={`What ${labels.reveal.toLowerCase()} ${index + 1} tells the reader`}
                    placeholder="What the reader learns"
                    value={reveal.truth}
                    maxLength={SPINE_LINE_MAX}
                    disabled={busy}
                    onValueChange={truth => patch({ reveals: editReveal(reveals, index, { truth }) })}
                  />
                </div>
                {named.length > 0 && (
                  <div className={styles.pillRow}>
                    {named.map((movement, at) => (
                      <button
                        key={at}
                        type="button"
                        className={styles.pill}
                        aria-pressed={reveal.movement === at + 1}
                        disabled={busy}
                        onClick={() => patch({ reveals: editReveal(reveals, index, { movement: at + 1 }) })}
                      >
                        {movement.title.trim()}
                      </button>
                    ))}
                  </div>
                )}
                <Input
                  aria-label={`What earlier chapters must do about ${labels.reveal.toLowerCase()} ${index + 1} without stating it`}
                  aria-invalid={reveal.truth.trim().length > 0 && reveal.writerNote.trim().length === 0}
                  placeholder="What earlier chapters do about it — without saying it"
                  value={reveal.writerNote}
                  maxLength={SPINE_LINE_MAX}
                  disabled={busy}
                  onValueChange={writerNote => patch({ reveals: editReveal(reveals, index, { writerNote }) })}
                />
                <Input
                  aria-label={`Phrases no chapter before ${labels.reveal.toLowerCase()} ${index + 1} may use`}
                  placeholder="Give-away phrases, comma separated"
                  value={reveal.terms}
                  maxLength={SPINE_LINE_MAX}
                  disabled={busy}
                  onValueChange={terms => patch({ reveals: editReveal(reveals, index, { terms }) })}
                />
              </div>
            ))}
            <Input
              aria-label={`What the ${labels.reveals.toLowerCase()} mean for whoever writes chapter one`}
              placeholder={`What the ${labels.reveals.toLowerCase()} mean for chapter one — how to hold them, never what they are`}
              value={revealsLine.text}
              maxLength={SPINE_WRITER_LINE_MAX}
              disabled={busy}
              onValueChange={text => patch({ revealsWriterLine: anchorLine(text, revealsAnchorText) })}
            />
            {revealsLine.stale && <p className={styles.cardLede}>{STALE_LINE_NOTE}</p>}
          </div>
        </section>
      )}

      {round != null && (
        <section className={styles.card}>
          <div className={styles.editFields}>
            <Input
              aria-label="How the last movement answers the ending question"
              placeholder="How the last one answers the ending question"
              value={draft.note}
              maxLength={SPINE_LINE_MAX}
              disabled={busy}
              onValueChange={note => patch({ note })}
            />
            <Input
              aria-label="Why this shape"
              placeholder="Why this shape"
              value={why.text}
              maxLength={SPINE_TEXT_MAX}
              disabled={busy}
              onValueChange={text => patch({ why: anchorLine(text, anchor) })}
            />
            {why.stale && <p className={styles.cardLede}>{STALE_LINE_NOTE}</p>}
            <Textarea
              aria-label="What the shape of the novel means for whoever writes chapter one"
              aria-invalid={writerLine.text.trim().length === 0}
              placeholder="What the shape means for whoever writes chapter one"
              value={writerLine.text}
              maxLength={SPINE_WRITER_LINE_MAX}
              minRows={2}
              autoGrow
              disabled={busy}
              onValueChange={text => patch({ writerLine: anchorLine(text, anchor) })}
            />
            {writerLine.stale && <p className={styles.cardLede}>{STALE_LINE_NOTE}</p>}
          </div>
        </section>
      )}

      <SteerBox
        nudges={step.nudges}
        draft={steer}
        onDraftChange={setSteer}
        messages={roundThread(round)}
        onSubmit={run}
        submitLabel={round == null ? 'Draw the spine' : 'Redraft the spine'}
        running={busy}
        placeholder="e.g. volume two should leave the city"
      />

      {round != null && (
        <LockBar
          label={meta.lockLabel ?? 'Lock the spine'}
          hint={read ? (issue ?? 'Locking writes the decision, a scheduled canon fact per reveal and one volume sketch per movement.') : 'Reading back what you already decided…'}
          onLock={lock}
          loading={lockStep.isPending}
          disabled={!read || selection == null || busy || lockStep.isPending}
        />
      )}
    </>
  );
}
