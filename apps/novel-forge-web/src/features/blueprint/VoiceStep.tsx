import { type ReactElement, useState } from 'react';
import { Alert, Input, Textarea, toast } from '@shadow-library/ui';

import { isRoundLive, useCancelBlueprintRoundMutation, useLedgerEntriesQuery, useLockBlueprintStepMutation, useStartBlueprintRoundMutation } from '@/lib/apis';

import { blueprintStepMeta, type StepScreenProps } from './blueprint-steps';
import { passRoundKey, sameJson } from './engine-pass';
import { LockBar } from './LockBar';
import { buildRoundBody, EMPTY_STEER, roundThread, type SteerDraft, stepPayload } from './round';
import { RoundStatus } from './RoundStatus';
import { SteerBox } from './SteerBox';
import {
  buildVoiceSelection,
  nextVoiceDraft,
  parseVoiceRound,
  pickVoice,
  restoreVoiceDraft,
  VOICE_LABEL_MAX,
  VOICE_LINE_MAX,
  VOICE_NOTES_MAX,
  VOICE_SAMPLE_MAX,
  VOICE_TOPIC,
  type VoiceDraft,
  voiceDraftFrom,
  voiceLockIssue,
} from './voice-step';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Writing three openings…';
const LEDGER_QUERY = { topics: VOICE_TOPIC };

/** Three openings of chapter one in different voices. The samples are written to be thrown away; only the notes and one paragraph are kept. */
export function VoiceStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);
  const parsed = parseVoiceRound(round);

  const [draft, setDraft] = useState<VoiceDraft>(() => voiceDraftFrom(parsed));
  const [offered, setOffered] = useState<VoiceDraft>(() => voiceDraftFrom(parsed));
  const [read, setRead] = useState(false);
  const [steer, setSteer] = useState<SteerDraft>(EMPTY_STEER);
  const [roundKey, setRoundKey] = useState(() => passRoundKey(round));

  const startRound = useStartBlueprintRoundMutation(projectId, step.key);
  const cancelRound = useCancelBlueprintRoundMutation(projectId, step.key);
  const lockStep = useLockBlueprintStepMutation(projectId, step.key);
  const decidedBefore = useLedgerEntriesQuery(projectId, LEDGER_QUERY);

  if (!read && decidedBefore.data != null) {
    setRead(true);
    const locked = restoreVoiceDraft(decidedBefore.data.entries);
    if (locked) setDraft(current => (sameJson(current, offered) ? locked : current));
  }

  if (passRoundKey(round) !== roundKey) {
    setRoundKey(passRoundKey(round));
    setSteer(EMPTY_STEER);
    setDraft(current => nextVoiceDraft(current, offered, parsed));
    setOffered(voiceDraftFrom(parsed));
  }

  const busy = isRoundLive(round) || startRound.isPending;
  const issue = voiceLockIssue(draft);
  const selection = buildVoiceSelection(draft, parsed);

  const patch = (next: Partial<VoiceDraft>): void => setDraft(current => ({ ...current, ...next }));

  const run = (): void => {
    startRound.mutate(buildRoundBody(steer), { onSuccess: () => setSteer(EMPTY_STEER), onError: err => toast.danger(err.message) });
  };

  const lock = (): void => {
    if (!selection) return;
    lockStep.mutate(
      { selection: stepPayload(selection) },
      {
        onSuccess: () => {
          toast.success('The voice is chosen');
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
          <p className={styles.cardLede}>Brief arc one first: these samples open your real chapter one, which is what makes them worth listening to.</p>
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

      {round != null && parsed.samples.length > 0 && (
        <section className={styles.card}>
          <div className={styles.pairHead}>
            <h2 className={styles.cardTitle}>Three openings of chapter one</h2>
            <span className={styles.pairCount}>Samples, not your chapter</span>
          </div>
          <Alert intent="info" title="These are throwaway samples">
            Nothing here is saved as chapter one, and no draft is written. Pick the voice you want to write in; only the notes and the paragraph you keep are stored.
          </Alert>
          <div className={styles.versionGrid}>
            {parsed.samples.map(sample => (
              <button
                key={sample.id}
                type="button"
                className={styles.optionPick}
                aria-pressed={draft.optionId === sample.id}
                disabled={busy}
                onClick={() => setDraft(current => pickVoice(current, sample))}
              >
                <span className={styles.optionTitle}>{sample.label}</span>
                <span className={styles.optionDescription}>{sample.tradeoff}</span>
                <span className={styles.voiceSample}>{sample.opening}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {round != null && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Your voice</h2>
          <p className={styles.cardLede}>Edit the paragraph until it sounds like the book. What you leave here is the example every chapter is written against.</p>
          <div className={styles.editFields}>
            <Input
              aria-label="The voice, in a few words"
              aria-invalid={draft.label.trim().length === 0}
              placeholder="The voice, in a few words"
              value={draft.label}
              maxLength={VOICE_LABEL_MAX}
              disabled={busy}
              onValueChange={label => patch({ label })}
            />
            <Textarea
              aria-label="A paragraph in that voice"
              aria-invalid={draft.paragraph.trim().length === 0}
              placeholder="A paragraph in that voice"
              value={draft.paragraph}
              maxLength={VOICE_SAMPLE_MAX}
              minRows={4}
              autoGrow
              disabled={busy}
              onValueChange={paragraph => patch({ paragraph })}
            />
            <Textarea
              aria-label="What this voice means for whoever writes the chapters"
              aria-invalid={draft.notes.trim().length === 0}
              placeholder="What this voice means for whoever writes the chapters"
              value={draft.notes}
              maxLength={VOICE_NOTES_MAX}
              minRows={2}
              autoGrow
              disabled={busy}
              onValueChange={notes => patch({ notes })}
            />
            <Input aria-label="Why this voice" placeholder="Why this voice" value={draft.why} maxLength={VOICE_LINE_MAX} disabled={busy} onValueChange={why => patch({ why })} />
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
          submitLabel="Three more"
          running={busy}
          placeholder="e.g. like the first, but warmer when he is with the collector"
        />
      )}

      {round != null && (
        <LockBar
          label={meta.lockLabel ?? 'Lock the voice'}
          hint={read ? (issue ?? 'Locking writes the voice notes, which ride every chapter pack, and the Pacing and tone page.') : 'Reading back what you already decided…'}
          onLock={lock}
          loading={lockStep.isPending}
          disabled={!read || selection == null || busy || lockStep.isPending}
        />
      )}
    </>
  );
}
