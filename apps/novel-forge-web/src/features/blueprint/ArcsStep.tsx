import { type ReactElement, useState } from 'react';
import { Alert, Input, Textarea, toast } from '@shadow-library/ui';

import { isRoundLive, useCancelBlueprintRoundMutation, useLedgerEntriesQuery, useLockBlueprintStepMutation, useStartBlueprintRoundMutation } from '@/lib/apis';

import { anchorLine, readAnchoredLine, STALE_LINE_NOTE } from './anchored-line';
import {
  ARC_CHAPTERS_MAX,
  ARC_CHAPTERS_MIN,
  ARCS_LINE_MAX,
  ARCS_MAX,
  ARCS_NAME_MAX,
  ARCS_TOPIC,
  ARCS_WHY_MAX,
  ARCS_WRITER_LINE_MAX,
  type ArcsDraft,
  arcsDraftAnchor,
  arcsDraftFrom,
  arcsLockIssue,
  buildArcsSelection,
  editArc,
  ladderRungs,
  nextArcsDraft,
  parseArcsRound,
  placeRung,
  restoreArcsDraft,
} from './arcs-step';
import { blueprintStepMeta, type StepScreenProps } from './blueprint-steps';
import { CAST_LADDER_TOPIC } from './cast-step';
import { passRoundKey, passRunningLabel, sameJson } from './engine-pass';
import { LockBar } from './LockBar';
import { PassSliceAlert } from './PassSliceAlert';
import { buildRoundBody, EMPTY_STEER, roundThread, type SteerDraft, stepPayload } from './round';
import { RoundStatus } from './RoundStatus';
import { SteerBox } from './SteerBox';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Breaking volume one into arcs…';
const LEDGER_QUERY = { topics: `${ARCS_TOPIC},${CAST_LADDER_TOPIC}` };

/** Volume one broken into arcs, each with a purpose and a turn, and the relationship rungs placed onto the arcs that land them. */
export function ArcsStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);
  const parsed = parseArcsRound(round);

  const [draft, setDraft] = useState<ArcsDraft>(() => arcsDraftFrom(parsed));
  const [offered, setOffered] = useState<ArcsDraft>(() => arcsDraftFrom(parsed));
  const [read, setRead] = useState(false);
  const [steer, setSteer] = useState<SteerDraft>(EMPTY_STEER);
  const [roundKey, setRoundKey] = useState(() => passRoundKey(round));

  const startRound = useStartBlueprintRoundMutation(projectId, step.key);
  const cancelRound = useCancelBlueprintRoundMutation(projectId, step.key);
  const lockStep = useLockBlueprintStepMutation(projectId, step.key);
  const decidedBefore = useLedgerEntriesQuery(projectId, LEDGER_QUERY);

  if (!read && decidedBefore.data != null) {
    setRead(true);
    const locked = restoreArcsDraft(decidedBefore.data.entries);
    if (locked) setDraft(current => (sameJson(current, offered) ? locked : current));
  }

  if (passRoundKey(round) !== roundKey) {
    setRoundKey(passRoundKey(round));
    setSteer(EMPTY_STEER);
    setDraft(current => nextArcsDraft(current, offered, parsed));
    setOffered(arcsDraftFrom(parsed));
  }

  const busy = isRoundLive(round) || startRound.isPending;
  const rungs = ladderRungs(decidedBefore.data?.entries ?? []);
  const anchor = arcsDraftAnchor(draft);
  const why = readAnchoredLine(draft.why, anchor);
  const writerLine = readAnchoredLine(draft.writerLine, anchor);
  const issue = arcsLockIssue(draft, parsed.volumeChapters);
  const selection = buildArcsSelection(draft, parsed.volumeChapters);
  const room = parsed.volumeChapters > 0 ? Math.min(ARCS_MAX, parsed.volumeChapters) : ARCS_MAX;
  const arcs = draft.arcs.length < room ? [...draft.arcs, { title: '', purpose: '', turn: '', chapters: 0, rung: '' }] : draft.arcs;

  const patch = (next: Partial<ArcsDraft>): void => setDraft(current => ({ ...current, ...next }));

  const run = (): void => {
    startRound.mutate(buildRoundBody(steer), { onSuccess: () => setSteer(EMPTY_STEER), onError: err => toast.danger(err.message) });
  };

  const lock = (): void => {
    if (!selection) return;
    lockStep.mutate(
      { selection: stepPayload(selection) },
      {
        onSuccess: result => {
          if (result.followUp?.ok === false) toast.warning(result.followUp.error ?? 'The arcs were saved, but approving them failed.');
          else toast.success('Volume one is broken into arcs');
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
          <p className={styles.cardLede}>This screen fills itself in when volume one is designed — start it from the cast screen.</p>
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
                setDraft(arcsDraftFrom(parsed));
                setOffered(arcsDraftFrom(parsed));
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

      {round != null && (
        <section className={styles.card}>
          <div className={styles.pairHead}>
            <h2 className={styles.cardTitle}>{parsed.volumeTitle ? `Volume one · ${parsed.volumeTitle}` : 'Volume one'}</h2>
            <span className={styles.pairCount}>
              {parsed.volumeChapters > 0 ? `${parsed.volumeChapters} chapters · at most ${room} arcs · ` : ''}only arc one gets chapter briefs, in the next phase
            </span>
          </div>
          <p className={styles.cardLede}>Every arc needs a purpose and a turn. Lengths are proportions: the volume’s own chapter range is what they are finally laid across.</p>
          <div className={styles.editFields}>
            {arcs.map((arc, index) => (
              <div key={index} className={styles.arcCard}>
                <div className={styles.memberHead}>
                  <Input
                    aria-label={`Arc ${index + 1}`}
                    placeholder="Arc"
                    value={arc.title}
                    maxLength={ARCS_NAME_MAX}
                    disabled={busy}
                    onValueChange={title => patch({ arcs: editArc(arcs, index, { title }) })}
                  />
                  <Input
                    aria-label={`How many chapters arc ${index + 1} runs for`}
                    placeholder="Chapters"
                    type="number"
                    min={ARC_CHAPTERS_MIN}
                    max={ARC_CHAPTERS_MAX}
                    value={arc.chapters > 0 ? String(arc.chapters) : ''}
                    disabled={busy}
                    onValueChange={chapters => patch({ arcs: editArc(arcs, index, { chapters: Math.min(Number(chapters) || 0, ARC_CHAPTERS_MAX) }) })}
                  />
                </div>
                <Input
                  aria-label={`What arc ${index + 1} is for`}
                  placeholder="What it is for"
                  value={arc.purpose}
                  maxLength={ARCS_LINE_MAX}
                  disabled={busy}
                  onValueChange={purpose => patch({ arcs: editArc(arcs, index, { purpose }) })}
                />
                <Input
                  aria-label={`The turn arc ${index + 1} ends on`}
                  placeholder="The turn it ends on"
                  value={arc.turn}
                  maxLength={ARCS_LINE_MAX}
                  disabled={busy}
                  onValueChange={turn => patch({ arcs: editArc(arcs, index, { turn }) })}
                />
                {rungs.length > 0 && (
                  <div className={styles.pillRow}>
                    {rungs.map(rung => (
                      <button
                        key={rung}
                        type="button"
                        className={styles.pill}
                        aria-pressed={arc.rung === rung}
                        disabled={busy}
                        onClick={() => patch({ arcs: placeRung(arcs, index, rung) })}
                      >
                        Rung: {rung}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {rungs.length === 0 && <p className={styles.cardLede}>Lock the relationship ladder on the cast screen and its rungs appear here to place.</p>}
        </section>
      )}

      {round != null && (
        <section className={styles.card}>
          <div className={styles.editFields}>
            <Input
              aria-label="Why these arcs"
              placeholder="Why these arcs"
              value={why.text}
              maxLength={ARCS_WHY_MAX}
              disabled={busy}
              onValueChange={text => patch({ why: anchorLine(text, anchor) })}
            />
            {why.stale && <p className={styles.cardLede}>{STALE_LINE_NOTE}</p>}
            <Textarea
              aria-label="What the shape of volume one means for whoever writes chapter one"
              aria-invalid={writerLine.text.trim().length === 0}
              placeholder="What the shape of volume one means for whoever writes chapter one"
              value={writerLine.text}
              maxLength={ARCS_WRITER_LINE_MAX}
              minRows={2}
              autoGrow
              disabled={busy}
              onValueChange={text => patch({ writerLine: anchorLine(text, anchor) })}
            />
            {writerLine.stale && <p className={styles.cardLede}>{STALE_LINE_NOTE}</p>}
          </div>
        </section>
      )}

      {round != null && (
        <SteerBox
          nudges={step.nudges}
          draft={steer}
          onDraftChange={setSteer}
          messages={roundThread(round)}
          onSubmit={run}
          submitLabel="Redraft the arcs"
          running={busy}
          placeholder="e.g. arc two is too long; merge three and four"
        />
      )}

      {round != null && (
        <LockBar
          label={meta.lockLabel ?? 'Lock volume one’s arcs'}
          hint={
            read
              ? (issue ?? 'Locking writes the arc rows, the volume-one plan page, and approves the arcs so chapter briefs can be written.')
              : 'Reading back what you already decided…'
          }
          onLock={lock}
          loading={lockStep.isPending}
          disabled={!read || selection == null || busy || lockStep.isPending}
        />
      )}
    </>
  );
}
