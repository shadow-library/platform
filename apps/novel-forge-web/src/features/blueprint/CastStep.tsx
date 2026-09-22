import { type ReactElement, useState } from 'react';
import { Alert, Input, Textarea, toast } from '@shadow-library/ui';

import { isRoundLive, useCancelBlueprintRoundMutation, useLedgerEntriesQuery, useLockBlueprintStepMutation, useStartBlueprintRoundMutation } from '@/lib/apis';

import { anchorLine, readAnchoredLine, STALE_LINE_NOTE } from './anchored-line';
import { blueprintStepMeta, type StepScreenProps } from './blueprint-steps';
import {
  buildCastSelection,
  CAST_LADDER_RUNGS_MAX,
  CAST_LADDER_TOPIC,
  CAST_LINE_MAX,
  CAST_MEMBERS_MAX,
  CAST_NAME_MAX,
  CAST_TOPIC,
  CAST_WHY_MAX,
  CAST_WRITER_LINE_MAX,
  type CastDraft,
  castDraftAnchor,
  castDraftFrom,
  castLockIssue,
  DECIDED_BY_LABELS,
  type DecidedBy,
  delegateMember,
  editCastRung,
  editMember,
  LATER_CAST_MAX,
  nextCastDraft,
  parseCastRound,
  restoreCastDraft,
} from './cast-step';
import { passRoundKey, passRunningLabel, sameJson } from './engine-pass';
import { LockBar } from './LockBar';
import { PassSliceAlert } from './PassSliceAlert';
import { buildRoundBody, EMPTY_STEER, roundThread, type SteerDraft, stepPayload } from './round';
import { RoundStatus } from './RoundStatus';
import { SteerBox } from './SteerBox';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Casting volume one…';
const LEDGER_QUERY = { topics: `${CAST_TOPIC},${CAST_LADDER_TOPIC}` };
const DECIDED_BY: DecidedBy[] = ['author', 'system'];

/** Full cards for the characters volume one needs, one-liners for later volumes, and the ladder the key relationship climbs. */
export function CastStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);
  const parsed = parseCastRound(round);

  const [draft, setDraft] = useState<CastDraft>(() => castDraftFrom(parsed));
  const [offered, setOffered] = useState<CastDraft>(() => castDraftFrom(parsed));
  const [read, setRead] = useState(false);
  const [steer, setSteer] = useState<SteerDraft>(EMPTY_STEER);
  const [roundKey, setRoundKey] = useState(() => passRoundKey(round));

  const startRound = useStartBlueprintRoundMutation(projectId, step.key);
  const cancelRound = useCancelBlueprintRoundMutation(projectId, step.key);
  const lockStep = useLockBlueprintStepMutation(projectId, step.key);
  const decidedBefore = useLedgerEntriesQuery(projectId, LEDGER_QUERY);

  if (!read && decidedBefore.data != null) {
    setRead(true);
    const locked = restoreCastDraft(decidedBefore.data.entries);
    if (locked) setDraft(current => (sameJson(current, offered) ? locked : current));
  }

  if (passRoundKey(round) !== roundKey) {
    setRoundKey(passRoundKey(round));
    setSteer(EMPTY_STEER);
    setDraft(current => nextCastDraft(current, offered, parsed));
    setOffered(castDraftFrom(parsed));
  }

  const busy = isRoundLive(round) || startRound.isPending;
  const anchor = castDraftAnchor(draft);
  const why = readAnchoredLine(draft.why, anchor);
  const writerLine = readAnchoredLine(draft.writerLine, anchor);
  const issue = castLockIssue(draft);
  const selection = buildCastSelection(draft);
  const members =
    draft.members.length < CAST_MEMBERS_MAX
      ? [...draft.members, { name: '', descriptor: '', role: '', wants: '', doesInVolumeOne: '', decidedBy: 'author' as const }]
      : draft.members;
  const rungs = draft.ladder.rungs.length < CAST_LADDER_RUNGS_MAX ? [...draft.ladder.rungs, { name: '', meaning: '' }] : draft.ladder.rungs;

  const patch = (next: Partial<CastDraft>): void => setDraft(current => ({ ...current, ...next }));

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
          else toast.success('The cast is locked');
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
          <p className={styles.cardLede}>This screen fills itself in when volume one is designed. Steer below to run it.</p>
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
                setDraft(castDraftFrom(parsed));
                setOffered(castDraftFrom(parsed));
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
            <h2 className={styles.cardTitle}>Volume one’s cast</h2>
            <span className={styles.pairCount}>Full cards</span>
          </div>
          <p className={styles.cardLede}>
            Your protagonist and what opposes them are already designed — these are the others volume one needs. Hand a minor card to the system and you can overrule it later.
          </p>
          <div className={styles.editFields}>
            {members.map((member, index) => (
              <div key={index} className={styles.memberCard}>
                <div className={styles.memberHead}>
                  <Input
                    aria-label={`Character ${index + 1}`}
                    placeholder="Name"
                    value={member.name}
                    maxLength={CAST_NAME_MAX}
                    disabled={busy}
                    onValueChange={name => patch({ members: editMember(members, index, { name }) })}
                  />
                  <div className={styles.pillRow}>
                    {DECIDED_BY.map(who => (
                      <button
                        key={who}
                        type="button"
                        className={styles.pill}
                        aria-pressed={member.decidedBy === who}
                        disabled={busy}
                        onClick={() => patch({ members: delegateMember(members, index, who) })}
                      >
                        {DECIDED_BY_LABELS[who]}
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  aria-label={`Who character ${index + 1} is`}
                  placeholder="Who they are to the protagonist"
                  value={member.descriptor}
                  maxLength={CAST_LINE_MAX}
                  disabled={busy}
                  onValueChange={descriptor => patch({ members: editMember(members, index, { descriptor }) })}
                />
                <div className={styles.memberFields}>
                  <Input
                    aria-label={`What character ${index + 1} is to the story`}
                    placeholder="Role"
                    value={member.role}
                    maxLength={CAST_NAME_MAX}
                    disabled={busy}
                    onValueChange={role => patch({ members: editMember(members, index, { role }) })}
                  />
                  <Input
                    aria-label={`What character ${index + 1} wants`}
                    placeholder="What they want of their own"
                    value={member.wants}
                    maxLength={CAST_LINE_MAX}
                    disabled={busy}
                    onValueChange={wants => patch({ members: editMember(members, index, { wants }) })}
                  />
                  <Input
                    aria-label={`What character ${index + 1} does in volume one`}
                    placeholder="What they do in volume one"
                    value={member.doesInVolumeOne}
                    maxLength={CAST_LINE_MAX}
                    disabled={busy}
                    onValueChange={doesInVolumeOne => patch({ members: editMember(members, index, { doesInVolumeOne }) })}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {round != null && (
        <section className={styles.card}>
          <div className={styles.pairHead}>
            <h2 className={styles.cardTitle}>Later volumes</h2>
            <span className={styles.pairCount}>One line each</span>
          </div>
          <p className={styles.cardLede}>A character designed before the volume that needs them is a character designed twice.</p>
          <ul className={styles.chipList}>
            {draft.later.slice(0, LATER_CAST_MAX).map((member, index) => (
              <li key={index}>
                <b>{member.name}</b>{' '}
                <span className={styles.cardLede}>
                  · volume {member.volume} — {member.line}
                </span>
              </li>
            ))}
            {draft.later.length === 0 && <li className={styles.cardLede}>Nobody is waiting for a later volume yet.</li>}
          </ul>
        </section>
      )}

      {round != null && (
        <section className={styles.card}>
          <div className={styles.pairHead}>
            <h2 className={styles.cardTitle}>The relationship ladder</h2>
            <span className={styles.pairCount}>Placed onto arcs on the next screen</span>
          </div>
          <div className={styles.memberFields}>
            <Input
              aria-label="One half of the key pair"
              placeholder="Who"
              value={draft.ladder.first}
              maxLength={CAST_NAME_MAX}
              disabled={busy}
              onValueChange={first => patch({ ladder: { ...draft.ladder, first } })}
            />
            <Input
              aria-label="The other half of the key pair"
              placeholder="And who"
              value={draft.ladder.second}
              maxLength={CAST_NAME_MAX}
              disabled={busy}
              onValueChange={second => patch({ ladder: { ...draft.ladder, second } })}
            />
          </div>
          <div className={styles.editFields}>
            {rungs.map((rung, index) => (
              <div key={index} className={styles.ladderRow}>
                <Input
                  aria-label={`Rung ${index + 1}`}
                  placeholder="Rung"
                  value={rung.name}
                  maxLength={CAST_NAME_MAX}
                  disabled={busy}
                  onValueChange={name => patch({ ladder: { ...draft.ladder, rungs: editCastRung(rungs, index, { name }) } })}
                />
                <Input
                  aria-label={`What has changed by rung ${index + 1}`}
                  placeholder="What has changed between them by then"
                  value={rung.meaning}
                  maxLength={CAST_LINE_MAX}
                  disabled={busy}
                  onValueChange={meaning => patch({ ladder: { ...draft.ladder, rungs: editCastRung(rungs, index, { meaning }) } })}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {round != null && (
        <section className={styles.card}>
          <div className={styles.editFields}>
            <Input
              aria-label="Why this cast"
              placeholder="Why this cast"
              value={why.text}
              maxLength={CAST_WHY_MAX}
              disabled={busy}
              onValueChange={text => patch({ why: anchorLine(text, anchor) })}
            />
            {why.stale && <p className={styles.cardLede}>{STALE_LINE_NOTE}</p>}
            <Textarea
              aria-label="What this cast means for whoever writes chapter one"
              aria-invalid={writerLine.text.trim().length === 0}
              placeholder="What this cast means for whoever writes chapter one"
              value={writerLine.text}
              maxLength={CAST_WRITER_LINE_MAX}
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
        submitLabel={round == null ? 'Design volume one' : 'Suggest characters'}
        running={busy}
        placeholder="e.g. a rival his own age who is better than him"
      />

      {round != null && (
        <LockBar
          label={meta.lockLabel ?? 'Lock the cast'}
          hint={
            read
              ? (issue ?? 'Locking writes a character record and page section for each card, and a system entry for the ones you delegated.')
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
