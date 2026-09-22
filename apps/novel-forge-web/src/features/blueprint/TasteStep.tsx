import { type ReactElement, useState } from 'react';
import { Alert, Button, Input, Textarea, toast } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';
import { isRoundLive, useCancelBlueprintRoundMutation, useLedgerEntriesQuery, useLockBlueprintStepMutation, useStartBlueprintRoundMutation } from '@/lib/apis';

import { blueprintStepMeta, type StepScreenProps } from './blueprint-steps';
import { LockBar } from './LockBar';
import { buildRoundBody, EMPTY_STEER, roundThread, type SteerDraft, stepPayload } from './round';
import { RoundStatus } from './RoundStatus';
import { SteerBox } from './SteerBox';
import {
  answerPair,
  buildTasteSelection,
  firstUnansweredPair,
  hasTasteAnswer,
  parseTasteRound,
  restoreTasteAnswers,
  TASTE_ASIDE_LABELS,
  TASTE_GAVE_UP_TOPIC,
  TASTE_NOTE_MAX,
  TASTE_OWN_REASON_MAX,
  TASTE_OWN_REASONS_MAX,
  TASTE_PAIR_MAX,
  TASTE_TOPIC,
  type TasteAnswers,
  tasteRoundKey,
  toggleReason,
} from './taste-step';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Looking for the pairs worth asking…';
const ASIDES = ['both', 'neither', 'depends'] as const;
const LEDGER_QUERY = { topics: `${TASTE_TOPIC},${TASTE_GAVE_UP_TOPIC}` };

/** Either-or pairs the author taps their way through: what they choose becomes taste directions, what stopped them becomes rejections. */
export function TasteStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);
  const parsed = parseTasteRound(round);

  const [answers, setAnswers] = useState<TasteAnswers>({});
  const [reasonIds, setReasonIds] = useState<string[]>([]);
  const [ownReasons, setOwnReasons] = useState<string[]>([]);
  const [ownDraft, setOwnDraft] = useState('');
  const [draft, setDraft] = useState<SteerDraft>(EMPTY_STEER);
  const [index, setIndex] = useState(0);
  const [roundKey, setRoundKey] = useState(() => tasteRoundKey(round));

  const [restored, setRestored] = useState(false);

  const startRound = useStartBlueprintRoundMutation(projectId, step.key);
  const cancelRound = useCancelBlueprintRoundMutation(projectId, step.key);
  const lockStep = useLockBlueprintStepMutation(projectId, step.key);
  const answeredBefore = useLedgerEntriesQuery(projectId, LEDGER_QUERY);

  // A revisit must lock the whole answer, not the part still on screen, so the answers already in the Notebook are read back
  // once — and whatever the author has touched in this session wins over them.
  if (!restored && answeredBefore.data != null) {
    const earlier = restoreTasteAnswers(answeredBefore.data.entries);
    setRestored(true);
    setAnswers(current => ({ ...earlier.answers, ...current }));
    setReasonIds(current => [...new Set([...earlier.reasonIds, ...current])]);
    setOwnReasons(current => [...new Set([...earlier.ownReasons, ...current])]);
    setIndex(firstUnansweredPair(parsed.pairs, { ...earlier.answers, ...answers }));
  }

  if (tasteRoundKey(round) !== roundKey) {
    setRoundKey(tasteRoundKey(round));
    setDraft(EMPTY_STEER);
    setIndex(firstUnansweredPair(parsed.pairs, answers));
  }

  const running = isRoundLive(round);
  const busy = running || startRound.isPending;
  const selection = buildTasteSelection(parsed, answers, reasonIds, ownReasons);
  const canLock = hasTasteAnswer(selection);
  const position = Math.min(index, Math.max(0, parsed.pairs.length - 1));
  const pair = parsed.pairs[position];
  const pairsFull = parsed.pairs.length >= TASTE_PAIR_MAX;

  const run = (): void => {
    startRound.mutate(buildRoundBody(draft), { onSuccess: () => setDraft(EMPTY_STEER), onError: err => toast.danger(err.message) });
  };

  const answer = (verdict: 'a' | 'b' | 'both' | 'neither' | 'depends'): void => {
    if (!pair) return;
    const current = answers[pair.id];
    const next = current?.verdict === verdict && verdict !== 'depends' ? null : { verdict, note: verdict === 'depends' ? (current?.note ?? '') : undefined };
    const updated = answerPair(answers, pair.id, next);
    setAnswers(updated);
    if (next != null && verdict !== 'depends') setIndex(Math.min(position + 1, parsed.pairs.length - 1));
  };

  const addOwnReason = (): void => {
    const trimmed = ownDraft.trim();
    if (!trimmed || ownReasons.length >= TASTE_OWN_REASONS_MAX) return;
    setOwnReasons(current => [...current, trimmed]);
    setOwnDraft('');
  };

  const lock = (): void => {
    lockStep.mutate(
      { selection: stepPayload(selection) },
      {
        onSuccess: result => {
          if (result.followUp?.ok === false) toast.warning(result.followUp.error ?? 'Saved, but the follow-up work failed.');
          else toast.success('Your taste is in the Notebook');
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
          <p className={styles.cardLede}>Pairs are built from your starting point, so there is nothing to answer until the first ones are written.</p>
          <div className={styles.cardActions}>
            <Button variant="primary" loading={busy} disabled={busy} onClick={run}>
              Show me some pairs
            </Button>
          </div>
        </section>
      )}

      {answeredBefore.isError && (
        <Alert
          intent="danger"
          title="Couldn’t read back what you already answered"
          action={{ label: answeredBefore.isFetching ? 'Retrying…' : 'Try again', onClick: () => void answeredBefore.refetch() }}
        >
          Locking now would retire the answers this screen cannot see, so it stays disabled until the Notebook loads. {answeredBefore.error?.message}
        </Alert>
      )}

      <RoundStatus
        round={round}
        runningLabel={RUNNING_LABEL}
        onCancel={() => cancelRound.mutate(undefined, { onError: err => toast.danger(err.message) })}
        cancelling={cancelRound.isPending}
        onRetry={run}
        retrying={startRound.isPending}
      />

      {pair != null && (
        <section className={styles.card}>
          <div className={styles.pairHead}>
            <span className={styles.cardLede}>Which would you rather read next?</span>
            <span className={styles.pairCount}>
              Pair {position + 1} of {parsed.pairs.length}
            </span>
          </div>
          <div className={styles.progress} role="presentation">
            <i style={{ width: `${(Object.keys(answers).length / parsed.pairs.length) * 100}%` }} />
          </div>

          <div className={styles.pair}>
            {(['a', 'b'] as const).map(side => (
              <button key={side} type="button" className={styles.pairSide} aria-pressed={answers[pair.id]?.verdict === side} disabled={busy} onClick={() => answer(side)}>
                <span className={styles.optionTitle}>{pair[side].text}</span>
                <span className={styles.optionDescription}>{pair[side].label}</span>
              </button>
            ))}
          </div>

          <div className={styles.cardActions}>
            {ASIDES.map(aside => (
              <button key={aside} type="button" className={styles.nudge} aria-pressed={answers[pair.id]?.verdict === aside} disabled={busy} onClick={() => answer(aside)}>
                {TASTE_ASIDE_LABELS[aside]}
              </button>
            ))}
            <span className={styles.spacer} />
            <Button size="sm" variant="ghost" disabled={position === 0} onClick={() => setIndex(position - 1)}>
              Back
            </Button>
            <Button size="sm" variant="ghost" disabled={position >= parsed.pairs.length - 1} onClick={() => setIndex(position + 1)}>
              Skip
            </Button>
          </div>

          {answers[pair.id]?.verdict === 'depends' && (
            <Textarea
              placeholder="e.g. depends on whether the loss is his fault"
              value={answers[pair.id]?.note ?? ''}
              onValueChange={note => setAnswers(current => answerPair(current, pair.id, { verdict: 'depends', note }))}
              maxLength={TASTE_NOTE_MAX}
              minRows={2}
              autoGrow
              aria-label="What it depends on"
            />
          )}
        </section>
      )}

      {parsed.giveUpReasons.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>A book you gave up on: why did you stop?</h2>
          <p className={styles.cardLede}>Each one you pick becomes a line the coach never proposes again.</p>
          <div className={styles.pillRow}>
            {parsed.giveUpReasons.map(reason => (
              <button
                key={reason.id}
                type="button"
                className={styles.pill}
                aria-pressed={reasonIds.includes(reason.id)}
                disabled={busy}
                onClick={() => setReasonIds(current => toggleReason(current, reason.id))}
              >
                {reason.label}
              </button>
            ))}
            {ownReasons.map(reason => (
              <button key={reason} type="button" className={styles.pill} aria-pressed onClick={() => setOwnReasons(current => current.filter(item => item !== reason))}>
                {reason}
              </button>
            ))}
          </div>
          <div className={styles.cardActions}>
            <Input
              className={styles.growField}
              placeholder="Something else that made you stop…"
              value={ownDraft}
              onValueChange={setOwnDraft}
              maxLength={TASTE_OWN_REASON_MAX}
              disabled={ownReasons.length >= TASTE_OWN_REASONS_MAX}
              aria-label="Another reason you gave up on a book"
              onKeyDown={event => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                addOwnReason();
              }}
            />
            <Button size="sm" variant="ghost" disabled={!ownDraft.trim() || ownReasons.length >= TASTE_OWN_REASONS_MAX} onClick={addOwnReason}>
              Add
            </Button>
            <StatusChip intent="neutral">{reasonIds.length + ownReasons.length} chosen</StatusChip>
          </div>
        </section>
      )}

      {round != null && (
        <SteerBox
          nudges={step.nudges}
          draft={draft}
          onDraftChange={setDraft}
          messages={roundThread(round)}
          onSubmit={run}
          submitLabel={pairsFull ? 'That’s every pair' : 'Add pairs'}
          running={busy}
          disabled={pairsFull}
          placeholder={
            pairsFull
              ? 'There are as many pairs as this step asks for — answer them and move on.'
              : 'e.g. I want the mentor to matter a lot, like a father figure who is hard on him'
          }
        />
      )}

      {parsed.pairs.length > 0 && (
        <LockBar
          label={meta.lockLabel ?? 'Show me story ideas'}
          hint={
            restored
              ? 'Your answers become taste directions; what you gave up on becomes rejections. Neither is a decision, and both steer every later step.'
              : 'Reading back what you already answered…'
          }
          onLock={lock}
          loading={lockStep.isPending}
          disabled={!restored || !canLock || busy || lockStep.isPending}
        />
      )}
    </>
  );
}
