import { type ReactElement, useState } from 'react';
import { Alert, Button, Input, Textarea, toast } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';
import { isRoundLive, useCancelBlueprintRoundMutation, useLedgerEntriesQuery, useLockBlueprintStepMutation, useStartBlueprintRoundMutation } from '@/lib/apis';

import { blueprintStepMeta, type StepScreenProps } from './blueprint-steps';
import { LockBar } from './LockBar';
import {
  addPromiseText,
  buildPromiseSelection,
  driverAtCap,
  editPromiseText,
  initialPromiseDraft,
  nextPromiseDraft,
  parsePromiseRound,
  PROMISE_DRIVERS_MAX,
  PROMISE_TEXT_MAX,
  PROMISE_TONE_MAX,
  PROMISE_TOPIC,
  PROMISE_WHY_MAX,
  PROMISE_WRITER_LINE_MAX,
  type PromiseDraft,
  promiseEffects,
  promiseRoundKey,
  PROMISES_MAX,
  PROMISES_MIN,
  removePromiseText,
  restorePromiseDraft,
  toggleDriver,
} from './promise-step';
import { buildRoundBody, EMPTY_STEER, roundThread, type SteerDraft, stepPayload } from './round';
import { RoundStatus } from './RoundStatus';
import { SteerBox } from './SteerBox';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Working out what kind of story this is…';
const LEDGER_QUERY = { topics: PROMISE_TOPIC };

/** The last whole-novel decision: drivers, length, tone and the promises every chapter owes the reader. */
export function PromiseStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);
  const parsed = parsePromiseRound(round);

  const [draft, setDraft] = useState<PromiseDraft | null>(null);
  const [restored, setRestored] = useState(false);
  const [steer, setSteer] = useState<SteerDraft>(EMPTY_STEER);
  const [roundKey, setRoundKey] = useState(() => promiseRoundKey(round));

  const startRound = useStartBlueprintRoundMutation(projectId, step.key);
  const cancelRound = useCancelBlueprintRoundMutation(projectId, step.key);
  const lockStep = useLockBlueprintStepMutation(projectId, step.key);
  const lockedBefore = useLedgerEntriesQuery(projectId, LEDGER_QUERY);

  // The lock carries drivers, length, tone and every promise at once, so the screen starts from what the
  // Notebook already holds rather than from the coach's recommendation a second time.
  if (!restored && lockedBefore.data != null) {
    setRestored(true);
    setDraft(current => current ?? initialPromiseDraft(parsed, restorePromiseDraft(lockedBefore.data.entries) ?? {}));
  }

  // A re-roll reworks the wording, not the author's answers: what they chose and any line they wrote themselves ride across it.
  if (promiseRoundKey(round) !== roundKey) {
    setRoundKey(promiseRoundKey(round));
    setSteer(EMPTY_STEER);
    setDraft(current => (current ? nextPromiseDraft(current, parsed) : current));
  }

  const running = isRoundLive(round);
  const busy = running || startRound.isPending;
  const selection = draft ? buildPromiseSelection(draft, parsed) : null;
  const effects = draft ? promiseEffects(parsed.tailoring, draft.drivers) : [];
  const edit = (patch: Partial<PromiseDraft>): void => setDraft(current => (current ? { ...current, ...patch } : current));

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
          else toast.success('The reader promise is locked — the phases below are tailored to it');
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
          <p className={styles.cardLede}>What each driver would mean for this novel is written from your premise, so there is nothing to weigh until the first round runs.</p>
          <div className={styles.cardActions}>
            <Button variant="primary" loading={busy} disabled={busy} onClick={run}>
              Work out what kind of story this is
            </Button>
          </div>
        </section>
      )}

      {lockedBefore.isError && (
        <Alert
          intent="danger"
          title="Couldn’t read back the promise you locked"
          action={{ label: lockedBefore.isFetching ? 'Retrying…' : 'Try again', onClick: () => void lockedBefore.refetch() }}
        >
          Locking now would replace it with a screen that never saw it, so it stays disabled until the Notebook loads. {lockedBefore.error?.message}
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

      {draft != null && parsed.drivers.length > 0 && (
        <>
          <section className={styles.card}>
            <div className={styles.pairHead}>
              <h2 className={styles.cardTitle}>What drives this story? Pick up to {PROMISE_DRIVERS_MAX}.</h2>
              <StatusChip intent="accent">You choose</StatusChip>
            </div>
            <div className={styles.pillRow}>
              {parsed.drivers.map(driver => (
                <button
                  key={driver.id}
                  type="button"
                  className={styles.pill}
                  aria-pressed={draft.drivers.includes(driver.id)}
                  disabled={busy || driverAtCap(draft.drivers, driver.id)}
                  title={driver.fit}
                  onClick={() => edit({ drivers: toggleDriver(draft.drivers, driver.id) })}
                >
                  {driver.label}
                  {driver.recommended === true && ' ★'}
                </button>
              ))}
            </div>
            <ul className={styles.chipList}>
              {parsed.drivers
                .filter(driver => draft.drivers.includes(driver.id))
                .map(driver => (
                  <li key={driver.id} className={styles.cardLede}>
                    <strong>{driver.label}:</strong> {driver.fit}
                  </li>
                ))}
            </ul>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>How long?</h2>
            <div className={styles.pillRow}>
              {parsed.lengths.map(length => (
                <button key={length.id} type="button" className={styles.pill} aria-pressed={draft.length === length.id} disabled={busy} onClick={() => edit({ length: length.id })}>
                  {length.label}
                </button>
              ))}
            </div>
            <p className={styles.cardLede}>
              {parsed.lengths.find(length => length.id === draft.length)?.note ?? 'Sets the volume count and the pacing. You can change it later; the spine rescales.'}
            </p>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Tone</h2>
            <div className={styles.pillRow}>
              {parsed.tones.map(tone => (
                <button
                  key={tone.id}
                  type="button"
                  className={styles.pill}
                  aria-pressed={draft.tone.trim() === tone.label.trim()}
                  disabled={busy}
                  title={tone.note}
                  onClick={() => edit({ tone: tone.label })}
                >
                  {tone.label}
                </button>
              ))}
            </div>
            <Input
              aria-label="Say the tone in your own words"
              value={draft.tone}
              onValueChange={tone => edit({ tone })}
              maxLength={PROMISE_TONE_MAX}
              disabled={busy}
              placeholder="e.g. hopeful but costly"
            />
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Promises to the reader</h2>
            <p className={styles.cardLede}>
              {PROMISES_MIN} to {PROMISES_MAX} things every chapter owes them, concrete enough that a reader would notice one being broken. Edit them into your own words.
            </p>
            <ul className={styles.chipList}>
              {draft.promises.map((promise, index) => (
                <li key={promise.key} className={styles.cardActions}>
                  <Input
                    className={styles.growField}
                    aria-label={`Promise ${index + 1}`}
                    value={promise.text}
                    onValueChange={value => edit({ promises: editPromiseText(draft.promises, promise.key, value) })}
                    maxLength={PROMISE_TEXT_MAX}
                    disabled={busy}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || draft.promises.length <= PROMISES_MIN}
                    onClick={() => edit({ promises: removePromiseText(draft.promises, promise.key) })}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
            <div className={styles.cardActions}>
              <Button size="sm" variant="ghost" disabled={busy || draft.promises.length >= PROMISES_MAX} onClick={() => edit({ promises: addPromiseText(draft.promises) })}>
                Add a promise
              </Button>
            </div>
          </section>

          {effects.length > 0 && (
            <Alert intent="info" title="This shapes what comes next">
              <ul className={styles.chipList}>
                {effects.map(rule => (
                  <li key={rule.id}>{rule.effect}</li>
                ))}
              </ul>
            </Alert>
          )}

          <section className={styles.card}>
            <div className={styles.editFields}>
              <Input
                aria-label="Why this promise"
                value={draft.why}
                onValueChange={why => edit({ why })}
                maxLength={PROMISE_WHY_MAX}
                disabled={busy}
                placeholder="Why this promise — the decisions it is built from (optional)"
              />
              <Textarea
                aria-label="What it means for whoever writes chapter one"
                aria-invalid={draft.writerLine.trim().length === 0}
                placeholder="What it means for whoever writes chapter one — e.g. never resolve a debt off the page"
                value={draft.writerLine}
                onValueChange={writerLine => edit({ writerLine })}
                maxLength={PROMISE_WRITER_LINE_MAX}
                minRows={2}
                autoGrow
                disabled={busy}
              />
            </div>
          </section>
        </>
      )}

      {round != null && (
        <SteerBox
          nudges={step.nudges}
          draft={steer}
          onDraftChange={setSteer}
          messages={roundThread(round)}
          onSubmit={run}
          submitLabel="Rework the promise"
          running={busy}
          placeholder="e.g. I want the stakes gentler than this"
        />
      )}

      {draft != null && parsed.drivers.length > 0 && (
        <LockBar
          label={meta.lockLabel ?? 'Lock reader promise'}
          hint={restored ? 'Every later phase reads this: which questions it asks, which pages it creates and what the checks look for.' : 'Reading back what you already locked…'}
          onLock={lock}
          loading={lockStep.isPending}
          disabled={!restored || selection == null || busy || lockStep.isPending}
        />
      )}
    </>
  );
}
