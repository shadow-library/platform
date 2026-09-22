import { type ReactElement, useState } from 'react';
import { OPPOSITION_KIND_LABELS, OPPOSITION_KINDS, type OppositionKind } from '@shadow-library/sdk';
import { Alert, Input, Textarea, toast } from '@shadow-library/ui';

import { isRoundLive, useCancelBlueprintRoundMutation, useLedgerEntriesQuery, useLockBlueprintStepMutation, useStartBlueprintRoundMutation } from '@/lib/apis';

import { anchorLine, readAnchoredLine, STALE_LINE_NOTE } from './anchored-line';
import { blueprintStepMeta, type StepScreenProps } from './blueprint-steps';
import { passRoundKey, passRunningLabel, sameJson } from './engine-pass';
import { LockBar } from './LockBar';
import { PassSliceAlert } from './PassSliceAlert';
import {
  buildOppositionSelection,
  editOppositionAnswer,
  EMPTY_OPPOSITION_ANSWER,
  nextOppositionDraft,
  OPPOSITION_FACES_MAX,
  OPPOSITION_GOALS_MAX,
  OPPOSITION_LINE_MAX,
  OPPOSITION_NAME_MAX,
  OPPOSITION_TEXT_MAX,
  OPPOSITION_TOPIC,
  OPPOSITION_WHY_MAX,
  OPPOSITION_WRITER_LINE_MAX,
  oppositionAnchor,
  type OppositionAnswer,
  type OppositionDraft,
  oppositionDraftFrom,
  parseOppositionRound,
  restoreOppositionDraft,
} from './opposition-step';
import { buildRoundBody, EMPTY_STEER, roundThread, type SteerDraft, stepPayload } from './round';
import { RoundStatus } from './RoundStatus';
import { SteerBox } from './SteerBox';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Working out what stands in the way…';
const LEDGER_QUERY = { topics: OPPOSITION_TOPIC };

const SLICE_EFFECTS = [
  'No antagonist is created, here or later.',
  'The Spine becomes seasons of life instead of escalation.',
  'The final check looks for rhythm and small change.',
];

interface FormProps {
  kind: OppositionKind;
  answer: OppositionAnswer;
  busy: boolean;
  onChange: (answer: OppositionAnswer) => void;
}

function listField(values: string[], index: number, value: string): string[] {
  const next = [...values];
  next[index] = value;
  return next.filter((item, at) => item.trim().length > 0 || at === index);
}

function OppositionForm({ kind, answer, busy, onChange }: FormProps): ReactElement {
  const edit = (patch: Partial<Omit<OppositionAnswer, 'optionId'>>): void => onChange(editOppositionAnswer(answer, patch));
  const goals = answer.goals.length < OPPOSITION_GOALS_MAX ? [...answer.goals, ''] : answer.goals;
  const faces = answer.faces.length < OPPOSITION_FACES_MAX ? [...answer.faces, { arc: '', face: '' }] : answer.faces;

  return (
    <div className={styles.editFields}>
      {(kind === 'person' || kind === 'system') && (
        <Input
          aria-label={kind === 'person' ? 'Their name' : 'What the system is called'}
          placeholder={kind === 'person' ? 'Their name' : 'What the system is called'}
          value={answer.name}
          maxLength={OPPOSITION_NAME_MAX}
          disabled={busy}
          onValueChange={name => edit({ name })}
        />
      )}
      <Input
        aria-label="What stands in the way, in one line"
        placeholder="What stands in the way, in one line"
        value={answer.summary}
        maxLength={OPPOSITION_LINE_MAX}
        disabled={busy}
        onValueChange={summary => edit({ summary })}
      />

      {kind === 'person' && (
        <>
          <Textarea
            aria-label="Their case, in their own voice"
            placeholder="Their case, in their own voice — argued so a reader could agree with it"
            value={answer.argument}
            maxLength={OPPOSITION_TEXT_MAX}
            minRows={3}
            autoGrow
            disabled={busy}
            onValueChange={argument => edit({ argument })}
          />
          <Input
            aria-label="What they want"
            placeholder="What they want"
            value={answer.wants}
            maxLength={OPPOSITION_LINE_MAX}
            disabled={busy}
            onValueChange={wants => edit({ wants })}
          />
          <Input
            aria-label="The line they will never cross"
            placeholder="The line they will never cross"
            value={answer.neverWill}
            maxLength={OPPOSITION_LINE_MAX}
            disabled={busy}
            onValueChange={neverWill => edit({ neverWill })}
          />
        </>
      )}

      {kind === 'system' && (
        <>
          <Input
            aria-label="What it wants"
            placeholder="What it wants"
            value={answer.wants}
            maxLength={OPPOSITION_LINE_MAX}
            disabled={busy}
            onValueChange={wants => edit({ wants })}
          />
          {faces.map((face, index) => (
            <div key={index} className={styles.chipRow}>
              <Input
                aria-label={`Face ${index + 1}: where`}
                placeholder="e.g. arc one"
                value={face.arc}
                maxLength={OPPOSITION_NAME_MAX}
                disabled={busy}
                onValueChange={arc => edit({ faces: faces.map((item, at) => (at === index ? { ...item, arc } : item)).filter(item => item.arc.trim() || item.face.trim()) })}
              />
              <Input
                aria-label={`Face ${index + 1}: who`}
                placeholder="Who it speaks through there"
                value={face.face}
                maxLength={OPPOSITION_LINE_MAX}
                disabled={busy}
                onValueChange={next =>
                  edit({ faces: faces.map((item, at) => (at === index ? { ...item, face: next } : item)).filter(item => item.arc.trim() || item.face.trim()) })
                }
              />
            </div>
          ))}
        </>
      )}

      {(kind === 'nature' || kind === 'slice') && (
        <Input
          aria-label="The rhythm it arrives on"
          placeholder="The rhythm it arrives on — seasons, market days, the spring flood"
          value={answer.rhythm}
          maxLength={OPPOSITION_LINE_MAX}
          disabled={busy}
          onValueChange={rhythm => edit({ rhythm })}
        />
      )}

      {kind === 'self' && (
        <Input
          aria-label="What winning the wrong way costs"
          placeholder="What every win that feeds the lie costs them"
          value={answer.costOfWinning}
          maxLength={OPPOSITION_LINE_MAX}
          disabled={busy}
          onValueChange={costOfWinning => edit({ costOfWinning })}
        />
      )}

      {kind === 'slice' && (
        <>
          {goals.map((goal, index) => (
            <Input
              key={index}
              aria-label={`Small goal ${index + 1}`}
              placeholder={`Small goal ${index + 1}`}
              value={goal}
              maxLength={OPPOSITION_LINE_MAX}
              disabled={busy}
              onValueChange={value => edit({ goals: listField(goals, index, value) })}
            />
          ))}
          <Input
            aria-label="Gentle stakes"
            placeholder="Gentle stakes — a friendship strained, a regular who stops coming"
            value={answer.stakes}
            maxLength={OPPOSITION_LINE_MAX}
            disabled={busy}
            onValueChange={stakes => edit({ stakes })}
          />
          <Input
            aria-label="What the reader returns for"
            placeholder="What the reader returns for"
            value={answer.returnsFor}
            maxLength={OPPOSITION_LINE_MAX}
            disabled={busy}
            onValueChange={returnsFor => edit({ returnsFor })}
          />
        </>
      )}
    </div>
  );
}

/** Opposition is chosen, never assumed: five kinds, each already answered for this novel, and "nothing" is one of them. */
export function OppositionStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);
  const parsed = parseOppositionRound(round);

  const [draft, setDraft] = useState<OppositionDraft>(() => oppositionDraftFrom(parsed));
  const [offered, setOffered] = useState<OppositionDraft>(() => oppositionDraftFrom(parsed));
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
    const locked = restoreOppositionDraft(decidedBefore.data.entries);
    if (locked) setDraft(current => (sameJson(current, offered) ? locked : current));
  }

  if (passRoundKey(round) !== roundKey) {
    setRoundKey(passRoundKey(round));
    setSteer(EMPTY_STEER);
    setDraft(current => nextOppositionDraft(current, offered, parsed));
    setOffered(oppositionDraftFrom(parsed));
  }

  const busy = isRoundLive(round) || startRound.isPending;
  const kind = draft.kind;
  const answer = kind ? (draft.answers[kind] ?? EMPTY_OPPOSITION_ANSWER) : EMPTY_OPPOSITION_ANSWER;
  const anchor = oppositionAnchor(kind, answer);
  const why = readAnchoredLine(draft.why, anchor);
  const writerLine = readAnchoredLine(draft.writerLine, anchor);
  const selection = buildOppositionSelection(draft);

  const patch = (next: Partial<OppositionDraft>): void => setDraft(current => ({ ...current, ...next }));

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
          else toast.success('What stands in the way is locked');
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
                setDraft(oppositionDraftFrom(parsed));
                setOffered(oppositionDraftFrom(parsed));
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
            <h2 className={styles.cardTitle}>What stands in their way?</h2>
            {parsed.preselected != null && <span className={styles.pairCount}>Pre-selected from your reader promise</span>}
          </div>
          {parsed.why && <p className={styles.cardLede}>{parsed.why}</p>}
          <div className={styles.pillRow}>
            {OPPOSITION_KINDS.map(candidate => (
              <button key={candidate} type="button" className={styles.pill} aria-pressed={kind === candidate} disabled={busy} onClick={() => patch({ kind: candidate })}>
                {OPPOSITION_KIND_LABELS[candidate]}
              </button>
            ))}
          </div>

          {kind === 'slice' && (
            <Alert intent="info" title="No opposition. The engine becomes desire, rhythm and relationships.">
              <ul className={styles.chipList}>
                {SLICE_EFFECTS.map(effect => (
                  <li key={effect}>{effect}</li>
                ))}
              </ul>
            </Alert>
          )}

          {kind != null && <OppositionForm kind={kind} answer={answer} busy={busy} onChange={next => patch({ answers: { ...draft.answers, [kind]: next } })} />}
        </section>
      )}

      {kind != null && (
        <section className={styles.card}>
          <div className={styles.editFields}>
            <Input
              aria-label="Why this one"
              placeholder="Why this one — what in the premise points at it"
              value={why.text}
              maxLength={OPPOSITION_WHY_MAX}
              disabled={busy}
              onValueChange={text => patch({ why: anchorLine(text, anchor) })}
            />
            {why.stale && <p className={styles.cardLede}>{STALE_LINE_NOTE}</p>}
            <Textarea
              aria-label="What it means for whoever writes chapter one"
              aria-invalid={writerLine.text.trim().length === 0}
              placeholder="What it means for whoever writes chapter one"
              value={writerLine.text}
              maxLength={OPPOSITION_WRITER_LINE_MAX}
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
          submitLabel="Rewrite"
          running={busy}
          placeholder="e.g. she should have a personal link to the protagonist"
        />
      )}

      {round != null && (
        <LockBar
          label={meta.lockLabel ?? 'Lock opposition'}
          hint={
            read
              ? kind === 'slice'
                ? 'Locking writes the decision and the page — and no antagonist.'
                : 'Locking writes the decision, the entity and the page.'
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
