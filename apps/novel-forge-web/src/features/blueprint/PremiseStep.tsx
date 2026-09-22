import { type ReactElement, useState } from 'react';
import { Button, Input, Textarea, toast } from '@shadow-library/ui';

import { isRoundLive, useCancelBlueprintRoundMutation, useLockBlueprintStepMutation, usePremisePreviewMutation, useStartBlueprintRoundMutation } from '@/lib/apis';

import { blueprintStepMeta, type StepScreenProps } from './blueprint-steps';
import { DecisionCard } from './DecisionCard';
import { LockBar } from './LockBar';
import {
  assemblePremise,
  buildPremiseSelection,
  canPreviewPremise,
  choosePremisePart,
  initialPremiseDraft,
  initialPremiseLines,
  isFocusedPremiseRound,
  nextPremiseLines,
  parsePremiseRound,
  passedOverAlternatives,
  PREMISE_PART_KIND_LABELS,
  PREMISE_PART_TEXT_MAX,
  PREMISE_WHY_MAX,
  PREMISE_WRITER_LINE_MAX,
  type PremiseDraftPart,
  type PremiseLinesDraft,
  premiseLinesFor,
  premiseRoundKey,
  previewPremiseText,
  resolvePremiseInput,
} from './premise-step';
import { buildRoundBody, EMPTY_STEER, roundThread, type SteerDraft, stepPayload } from './round';
import { RoundStatus } from './RoundStatus';
import { SteerBox } from './SteerBox';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Writing the sentence your novel is about…';
const WRITER_LINE_STALE = 'The sentence changed — say what it means for whoever writes chapter one.';
const WRITER_LINE_HINT = 'This line rides every chapter pack, so it has to describe the sentence you are locking.';

/** One sentence with its load-bearing parts open to swap. Locking it writes the premise decision and the project's premise page. */
export function PremiseStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);
  const parsed = parsePremiseRound(round);

  const [draft, setDraft] = useState<PremiseDraftPart[]>(() => initialPremiseDraft(parsed));
  const [openPart, setOpenPart] = useState<string | null>(null);
  const [ownText, setOwnText] = useState('');
  const [lines, setLines] = useState<PremiseLinesDraft>(() => initialPremiseLines(parsed, initialPremiseDraft(parsed)));
  const [steer, setSteer] = useState<SteerDraft>(EMPTY_STEER);
  const [preview, setPreview] = useState<string | null>(null);
  const [roundKey, setRoundKey] = useState(() => premiseRoundKey(round));

  const startRound = useStartBlueprintRoundMutation(projectId, step.key);
  const cancelRound = useCancelBlueprintRoundMutation(projectId, step.key);
  const lockStep = useLockBlueprintStepMutation(projectId, step.key);
  const previewParagraph = usePremisePreviewMutation(projectId);

  if (premiseRoundKey(round) !== roundKey) {
    const next = initialPremiseDraft(parsed, draft);
    setRoundKey(premiseRoundKey(round));
    setDraft(next);
    setLines(current => nextPremiseLines(current, parsed, next, isFocusedPremiseRound(round)));
    setSteer(EMPTY_STEER);
    setOwnText('');
    setPreview(null);
  }

  const running = isRoundLive(round);
  const busy = running || startRound.isPending;
  const sentence = assemblePremise(draft);
  const shown = premiseLinesFor(lines, sentence);
  const selection = buildPremiseSelection(draft, shown);
  const opened = parsed?.parts.find(part => part.id === openPart);
  const openedDraft = draft.find(part => part.id === openPart);

  const run = (partId: string | null): void => {
    startRound.mutate(buildRoundBody(steer, {}, stepPayload(resolvePremiseInput(draft, partId, round))), {
      onSuccess: () => setSteer(EMPTY_STEER),
      onError: err => toast.danger(err.message),
    });
  };

  const choose = (partId: string, choice: { optionId?: string; text: string }): void => {
    setDraft(current => choosePremisePart(current, partId, choice));
    setOwnText('');
  };

  const editLines = (patch: Partial<{ why: string; writerLine: string }>): void => setLines({ why: shown.why, writerLine: shown.writerLine, forSentence: sentence, ...patch });

  const openAlternatives = (partId: string): void => {
    setOpenPart(current => (current === partId ? null : partId));
    setOwnText('');
  };

  const lock = (): void => {
    if (!selection) return;
    lockStep.mutate(
      { selection: stepPayload(selection) },
      {
        onSuccess: result => {
          if (result.followUp?.ok === false) toast.warning(result.followUp.error ?? 'Saved, but the follow-up work failed.');
          else toast.success('Premise locked');
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
          <p className={styles.cardLede}>The premise is built from what you have kept so far. Nothing new is invented here — it is the Notebook, said in one sentence.</p>
          <div className={styles.cardActions}>
            <Button variant="primary" loading={busy} disabled={busy} onClick={() => run(null)}>
              Write the sentence
            </Button>
          </div>
        </section>
      )}

      <RoundStatus
        round={round}
        runningLabel={RUNNING_LABEL}
        onCancel={() => cancelRound.mutate(undefined, { onError: err => toast.danger(err.message) })}
        cancelling={cancelRound.isPending}
        onRetry={() => run(openPart)}
        retrying={startRound.isPending}
      />

      {draft.length > 0 && (
        <>
          <p className={styles.premise}>
            {draft.map(part => (
              <button
                key={part.id}
                type="button"
                className={styles.premiseMark}
                aria-pressed={openPart === part.id}
                aria-label={`${PREMISE_PART_KIND_LABELS[part.kind]}: ${part.text}`}
                disabled={busy}
                onClick={() => openAlternatives(part.id)}
              >
                {part.text}
              </button>
            ))}
          </p>

          {opened != null && openedDraft != null && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>{PREMISE_PART_KIND_LABELS[opened.kind]}</h2>
              <p className={styles.cardLede}>Swapping this part changes the novel. Everything else in the sentence stays exactly as it is.</p>
              <div className={styles.pillRow}>
                {[{ id: opened.id, text: opened.text }, ...opened.alternatives].map(choice => (
                  <button
                    key={choice.id}
                    type="button"
                    className={styles.pill}
                    aria-pressed={openedDraft.optionId === choice.id}
                    disabled={busy}
                    onClick={() => choose(opened.id, { optionId: choice.id, text: choice.text })}
                  >
                    {choice.text}
                  </button>
                ))}
              </div>
              <div className={styles.cardActions}>
                <Input
                  className={styles.growField}
                  placeholder="Write my own…"
                  value={ownText || (openedDraft.optionId == null ? openedDraft.text : '')}
                  onValueChange={setOwnText}
                  maxLength={PREMISE_PART_TEXT_MAX}
                  disabled={busy}
                  aria-label="Write this part yourself"
                  onKeyDown={event => {
                    if (event.key !== 'Enter' || !ownText.trim()) return;
                    event.preventDefault();
                    choose(opened.id, { text: ownText });
                  }}
                />
                <Button size="sm" variant="ghost" disabled={!ownText.trim() || busy} onClick={() => choose(opened.id, { text: ownText })}>
                  Use mine
                </Button>
                <Button size="sm" variant="ghost" loading={busy} disabled={busy} onClick={() => run(opened.id)}>
                  Other options for this part
                </Button>
              </div>
            </section>
          )}

          <DecisionCard
            title="Decision · Premise"
            decision={sentence}
            why={shown.why || undefined}
            rejected={passedOverAlternatives(parsed, draft)}
            writerLine={shown.writerLine || undefined}
            cost={meta.costToChange}
            identity
          />

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>What it means for the writer</h2>
            <p className={styles.cardLede}>{shown.stale ? WRITER_LINE_STALE : WRITER_LINE_HINT}</p>
            <Textarea
              placeholder="e.g. the mystery is personal from chapter 1: every clue is also about who he was"
              value={shown.writerLine}
              onValueChange={writerLine => editLines({ writerLine })}
              maxLength={PREMISE_WRITER_LINE_MAX}
              minRows={2}
              autoGrow
              aria-label="What the premise means for the writer"
              aria-invalid={shown.writerLine.trim().length === 0}
            />
            <Input
              placeholder="Why this premise — the decisions it is built from"
              value={shown.why}
              onValueChange={why => editLines({ why })}
              maxLength={PREMISE_WHY_MAX}
              aria-label="Why this premise"
            />
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Want to feel it first?</h2>
            <p className={styles.cardLede}>
              A sample opening paragraph, written from the sentence above. It is thrown away: never saved, never a decision, never the novel’s voice.
            </p>
            {preview != null && <p className={styles.previewProse}>{preview}</p>}
            <div className={styles.cardActions}>
              <Button
                size="sm"
                variant="ghost"
                loading={previewParagraph.isPending}
                disabled={previewParagraph.isPending || busy || !canPreviewPremise(sentence)}
                onClick={() =>
                  previewParagraph.mutate(
                    { premise: previewPremiseText(sentence) },
                    { onSuccess: result => setPreview(result.paragraph), onError: err => toast.danger(err.message) },
                  )
                }
              >
                {preview == null ? 'Preview an opening paragraph' : 'Write another one'}
              </Button>
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
          onSubmit={() => run(null)}
          submitLabel="Rephrase"
          running={busy}
          placeholder="e.g. keep the mystery, but make it more about him and his master"
        />
      )}

      {draft.length > 0 && (
        <LockBar
          label={meta.lockLabel ?? 'Lock premise'}
          hint="Locking writes the premise decision, the project’s premise and its Story Bible page. It is expensive to change later."
          onLock={lock}
          loading={lockStep.isPending}
          disabled={selection == null || busy || lockStep.isPending}
        />
      )}
    </>
  );
}
