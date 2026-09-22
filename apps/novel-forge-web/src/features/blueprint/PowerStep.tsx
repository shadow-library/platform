import { type ReactElement, useState } from 'react';
import { Alert, Input, Textarea, toast } from '@shadow-library/ui';

import { isRoundLive, useCancelBlueprintRoundMutation, useLedgerEntriesQuery, useLockBlueprintStepMutation, useStartBlueprintRoundMutation } from '@/lib/apis';

import { anchorLine, readAnchoredLine, STALE_LINE_NOTE } from './anchored-line';
import { blueprintStepMeta, type StepScreenProps } from './blueprint-steps';
import { passRoundKey, passRunningLabel, sameJson } from './engine-pass';
import { LockBar } from './LockBar';
import { PassSliceAlert } from './PassSliceAlert';
import {
  buildPowerSelection,
  editRung,
  LADDER_RUNGS_MAX,
  ladderAnchor,
  nextPowerDraft,
  parsePowerRound,
  POWER_LINE_MAX,
  POWER_NAME_MAX,
  POWER_TOPIC,
  POWER_WHY_MAX,
  POWER_WRITER_LINE_MAX,
  type PowerDraft,
  powerDraftFrom,
  restorePowerDraft,
} from './power-step';
import { buildRoundBody, EMPTY_STEER, roundThread, type SteerDraft, stepPayload } from './round';
import { RoundStatus } from './RoundStatus';
import { SteerBox } from './SteerBox';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Building the ladder…';
const LEDGER_QUERY = { topics: POWER_TOPIC };

/** The ladder of ranks, asked for because progression is part of what this novel promises its readers. */
export function PowerStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);
  const parsed = parsePowerRound(round);

  const [draft, setDraft] = useState<PowerDraft>(() => powerDraftFrom(parsed));
  const [offered, setOffered] = useState<PowerDraft>(() => powerDraftFrom(parsed));
  const [read, setRead] = useState(false);
  const [steer, setSteer] = useState<SteerDraft>(EMPTY_STEER);
  const [roundKey, setRoundKey] = useState(() => passRoundKey(round));

  const startRound = useStartBlueprintRoundMutation(projectId, step.key);
  const cancelRound = useCancelBlueprintRoundMutation(projectId, step.key);
  const lockStep = useLockBlueprintStepMutation(projectId, step.key);
  const decidedBefore = useLedgerEntriesQuery(projectId, LEDGER_QUERY);

  // What is already in the Notebook, unless the author has started answering in this session.
  if (!read && decidedBefore.data != null) {
    setRead(true);
    const locked = restorePowerDraft(decidedBefore.data.entries);
    if (locked) setDraft(current => (sameJson(current, offered) ? locked : current));
  }

  if (passRoundKey(round) !== roundKey) {
    setRoundKey(passRoundKey(round));
    setSteer(EMPTY_STEER);
    setDraft(current => nextPowerDraft(current, offered, parsed));
    setOffered(powerDraftFrom(parsed));
  }

  const busy = isRoundLive(round) || startRound.isPending;
  const anchor = ladderAnchor(draft.rungs);
  const why = readAnchoredLine(draft.why, anchor);
  const writerLine = readAnchoredLine(draft.writerLine, anchor);
  const selection = buildPowerSelection(draft);
  const rungs = draft.rungs.length < LADDER_RUNGS_MAX ? [...draft.rungs, { name: '', buys: '', cost: '' }] : draft.rungs;

  const patch = (next: Partial<PowerDraft>): void => setDraft(current => ({ ...current, ...next }));

  const run = (): void => {
    startRound.mutate(buildRoundBody(steer), { onSuccess: () => setSteer(EMPTY_STEER), onError: err => toast.danger(err.message) });
  };

  const lock = (): void => {
    if (!selection) return;
    lockStep.mutate(
      { selection: stepPayload(selection) },
      {
        onSuccess: result => {
          if (result.followUp?.ok === false) toast.warning(result.followUp.error ?? 'Saved, but the follow-up work failed.');
          else toast.success('The ladder is locked');
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
          <p className={styles.cardLede}>This screen fills itself in when the engine of the novel is generated — start it from the protagonist screen.</p>
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
                setDraft(powerDraftFrom(parsed));
                setOffered(powerDraftFrom(parsed));
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
          <h2 className={styles.cardTitle}>The ladder, cheapest rung first</h2>
          <p className={styles.cardLede}>Every rung says what it buys and what it costs in the currency the cost rule names. Empty a rung’s name to drop it.</p>
          <div className={styles.editFields}>
            {rungs.map((rung, index) => (
              <div key={index} className={styles.ladderRow}>
                <Input
                  aria-label={`Rank ${index + 1}`}
                  placeholder="Rank"
                  value={rung.name}
                  maxLength={POWER_NAME_MAX}
                  disabled={busy}
                  onValueChange={name => patch({ rungs: editRung(rungs, index, { name }) })}
                />
                <Input
                  aria-label={`What rank ${index + 1} buys`}
                  placeholder="What it buys"
                  value={rung.buys}
                  maxLength={POWER_LINE_MAX}
                  disabled={busy}
                  onValueChange={buys => patch({ rungs: editRung(rungs, index, { buys }) })}
                />
                <Input
                  aria-label={`What rank ${index + 1} costs`}
                  placeholder="What it costs"
                  value={rung.cost}
                  maxLength={POWER_LINE_MAX}
                  disabled={busy}
                  onValueChange={cost => patch({ rungs: editRung(rungs, index, { cost }) })}
                />
              </div>
            ))}
            <Input
              aria-label="Where the protagonist stands when the novel opens"
              placeholder="Where the protagonist stands when the novel opens"
              value={draft.note}
              maxLength={POWER_LINE_MAX}
              disabled={busy}
              onValueChange={note => patch({ note })}
            />
          </div>
        </section>
      )}

      {round != null && (
        <section className={styles.card}>
          <div className={styles.editFields}>
            <Input
              aria-label="Why this ladder"
              placeholder="Why this ladder"
              value={why.text}
              maxLength={POWER_WHY_MAX}
              disabled={busy}
              onValueChange={text => patch({ why: anchorLine(text, anchor) })}
            />
            {why.stale && <p className={styles.cardLede}>{STALE_LINE_NOTE}</p>}
            <Textarea
              aria-label="What the ladder means for whoever writes chapter one"
              aria-invalid={writerLine.text.trim().length === 0}
              placeholder="What the ladder means for whoever writes chapter one"
              value={writerLine.text}
              maxLength={POWER_WRITER_LINE_MAX}
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
          submitLabel="Revise the ladder"
          running={busy}
          placeholder="e.g. make the climb slower after the third rung"
        />
      )}

      {round != null && (
        <LockBar
          label={meta.lockLabel ?? 'Lock the ladder'}
          hint={read ? 'Locking writes the decision, a record per rank and a canon fact for each one.' : 'Reading back what you already decided…'}
          onLock={lock}
          loading={lockStep.isPending}
          disabled={!read || selection == null || busy || lockStep.isPending}
        />
      )}
    </>
  );
}
