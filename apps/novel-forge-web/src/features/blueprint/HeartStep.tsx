import { type ReactElement, useState } from 'react';
import { Alert, Button, Input, Textarea, toast } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';
import { isRoundLive, useCancelBlueprintRoundMutation, useLedgerEntriesQuery, useLockBlueprintStepMutation, useStartBlueprintRoundMutation } from '@/lib/apis';

import { blueprintStepMeta, type StepScreenProps } from './blueprint-steps';
import {
  buildHeartSelection,
  chooseHeartOption,
  editHeartAnswer,
  EMPTY_HEART_ANSWER,
  ENDING_TOPIC,
  HEART_TEXT_MAX,
  HEART_WHY_MAX,
  HEART_WRITER_LINE_MAX,
  type HeartAnswer,
  heartAnswerFor,
  type HeartAnswers,
  type HeartOption,
  type HeartPart,
  heartRoundKey,
  mergeHeartAnswers,
  parseHeartRound,
  restoreHeartAnswers,
  THEME_TOPIC,
} from './heart-step';
import { LockBar } from './LockBar';
import { buildRoundBody, EMPTY_STEER, roundThread, type SteerDraft, stepPayload } from './round';
import { RoundStatus } from './RoundStatus';
import { SteerBox } from './SteerBox';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Reading what the premise is arguing about…';
const LEDGER_QUERY = { topics: `${THEME_TOPIC},${ENDING_TOPIC}` };
const STALE_LINE = 'You changed the wording, so this was written about an answer you are no longer locking. Say it again for this one.';

const COPY: Record<HeartPart, { title: string; lede: string; own: string; writerLine: string }> = {
  theme: {
    title: 'Theme: the question under the plot',
    lede: 'What the novel keeps arguing with, scene after scene. Rewriting one in your own words beats picking it.',
    own: 'e.g. what does a life cost when it can be sold?',
    writerLine: 'e.g. every scene weighs what a memory was worth',
  },
  ending: {
    title: 'Ending question: what the reader waits the whole novel to learn',
    lede: 'It has to survive hundreds of chapters, so it is answered by who the protagonist becomes, not by a fact being uncovered.',
    own: 'e.g. will he take his past back, or the person he became without it?',
    writerLine: 'e.g. chapter one already shows both selves',
  },
};

interface PartProps {
  part: HeartPart;
  options: HeartOption[];
  answer: HeartAnswer;
  busy: boolean;
  onChange: (answer: HeartAnswer) => void;
}

function HeartPartCard({ part, options, answer, busy, onChange }: PartProps): ReactElement {
  const copy = COPY[part];
  const chosen = options.find(option => option.id === answer.optionId);
  const own = answer.optionId === undefined && answer.text.trim().length > 0;
  const lines = heartAnswerFor(answer);

  return (
    <section className={styles.card}>
      <div className={styles.pairHead}>
        <h2 className={styles.cardTitle}>{copy.title}</h2>
        <StatusChip intent="accent">You choose</StatusChip>
      </div>
      <p className={styles.cardLede}>{copy.lede}</p>

      <div className={styles.pillRow}>
        {options.map(option => (
          <button
            key={option.id}
            type="button"
            className={styles.pill}
            aria-pressed={answer.optionId === option.id}
            disabled={busy}
            onClick={() => onChange(chooseHeartOption(option))}
          >
            {option.text}
          </button>
        ))}
        <button key="own" type="button" className={styles.pill} aria-pressed={own} disabled={busy} onClick={() => onChange({ ...EMPTY_HEART_ANSWER })}>
          In my words…
        </button>
      </div>

      {options.some(option => option.caution != null) && (
        <div className={styles.chipList}>
          {options
            .filter(option => option.caution != null)
            .map(option => (
              <p key={option.id} className={styles.cardLede}>
                <strong>Coach on “{option.text}”:</strong> {option.caution}
              </p>
            ))}
        </div>
      )}

      <div className={styles.editFields}>
        <Input
          aria-label={answer.optionId ? 'The wording you are locking' : 'Write it in your own words'}
          placeholder={copy.own}
          value={answer.text}
          onValueChange={text => onChange(editHeartAnswer(answer, { text }))}
          maxLength={HEART_TEXT_MAX}
          disabled={busy}
        />
        <Input
          aria-label="Why this one"
          placeholder={chosen?.why ?? 'Why this one — what in the premise points at it'}
          value={lines.why}
          onValueChange={why => onChange(editHeartAnswer(answer, { why }))}
          maxLength={HEART_WHY_MAX}
          disabled={busy}
        />
        {lines.whyStale && <p className={styles.cardLede}>{STALE_LINE}</p>}
        <Textarea
          aria-label="What it means for whoever writes chapter one"
          aria-invalid={lines.writerLine.trim().length === 0}
          placeholder={`What it means for whoever writes chapter one — ${copy.writerLine}`}
          value={lines.writerLine}
          onValueChange={writerLine => onChange(editHeartAnswer(answer, { writerLine }))}
          maxLength={HEART_WRITER_LINE_MAX}
          minRows={2}
          autoGrow
          disabled={busy}
        />
        {lines.writerLineStale && <p className={styles.cardLede}>{STALE_LINE}</p>}
      </div>
    </section>
  );
}

/** The theme and the ending question: two identity decisions, locked together, with the coach saying which option is weaker. */
export function HeartStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);
  const parsed = parseHeartRound(round);

  const [touched, setTouched] = useState<Partial<HeartAnswers>>({});
  const [restored, setRestored] = useState<Partial<HeartAnswers> | null>(null);
  const [draft, setDraft] = useState<SteerDraft>(EMPTY_STEER);
  const [roundKey, setRoundKey] = useState(() => heartRoundKey(round));

  const startRound = useStartBlueprintRoundMutation(projectId, step.key);
  const cancelRound = useCancelBlueprintRoundMutation(projectId, step.key);
  const lockStep = useLockBlueprintStepMutation(projectId, step.key);
  const decidedBefore = useLedgerEntriesQuery(projectId, LEDGER_QUERY);

  // One lock writes both answers, so the ones already in the Notebook are read back before it can be pressed;
  // whatever the author has touched in this session wins over them.
  if (restored == null && decidedBefore.data != null) setRestored(restoreHeartAnswers(decidedBefore.data.entries));

  if (heartRoundKey(round) !== roundKey) {
    setRoundKey(heartRoundKey(round));
    setDraft(EMPTY_STEER);
  }

  const running = isRoundLive(round);
  const busy = running || startRound.isPending;
  const answers = mergeHeartAnswers(restored ?? {}, touched);
  const selection = buildHeartSelection(answers);
  const answered = restored != null;

  const run = (): void => {
    startRound.mutate(buildRoundBody(draft), { onSuccess: () => setDraft(EMPTY_STEER), onError: err => toast.danger(err.message) });
  };

  const lock = (): void => {
    if (!selection) return;
    lockStep.mutate(
      { selection: stepPayload(selection) },
      {
        onSuccess: result => {
          if (result.followUp?.ok === false) toast.warning(result.followUp.error ?? 'Saved, but the follow-up work failed.');
          else toast.success('The theme and the ending question are locked');
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
          <p className={styles.cardLede}>Both are built from the premise you locked, so there is nothing to choose between until the first options are written.</p>
          <div className={styles.cardActions}>
            <Button variant="primary" loading={busy} disabled={busy} onClick={run}>
              Show me what this book is about
            </Button>
          </div>
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

      <RoundStatus
        round={round}
        runningLabel={RUNNING_LABEL}
        onCancel={() => cancelRound.mutate(undefined, { onError: err => toast.danger(err.message) })}
        cancelling={cancelRound.isPending}
        onRetry={run}
        retrying={startRound.isPending}
      />

      {(parsed.themes.length > 0 || answered) && (
        <HeartPartCard part="theme" options={parsed.themes} answer={answers.theme} busy={busy} onChange={answer => setTouched(current => ({ ...current, theme: answer }))} />
      )}
      {(parsed.endings.length > 0 || answered) && (
        <HeartPartCard part="ending" options={parsed.endings} answer={answers.ending} busy={busy} onChange={answer => setTouched(current => ({ ...current, ending: answer }))} />
      )}

      {round != null && (
        <SteerBox
          nudges={step.nudges}
          draft={draft}
          onDraftChange={setDraft}
          messages={roundThread(round)}
          onSubmit={run}
          submitLabel="More options"
          running={busy}
          placeholder="e.g. I want the ending to be bittersweet"
        />
      )}

      {(parsed.themes.length > 0 || answered) && (
        <LockBar
          label={meta.lockLabel ?? 'Lock theme and ending'}
          hint={answered ? 'Two decisions, both yours. They ride every chapter pack and the premise page carries them.' : 'Reading back what you already decided…'}
          onLock={lock}
          loading={lockStep.isPending}
          disabled={!answered || selection == null || busy || lockStep.isPending}
        />
      )}
    </>
  );
}
