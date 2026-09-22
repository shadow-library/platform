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
import { SteerBox } from './SteerBox';
import {
  buildWorldSelection,
  chooseCostRule,
  editCostRule,
  editRule,
  nextWorldDraft,
  parseWorldRound,
  restoreWorldDraft,
  WORLD_COST_TOPIC,
  WORLD_LINE_MAX,
  WORLD_RULES_MAX,
  WORLD_RULES_TOPIC,
  WORLD_TEXT_MAX,
  WORLD_WHY_MAX,
  WORLD_WRITER_LINE_MAX,
  type WorldDraft,
  worldDraftFrom,
} from './world-step';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Working out what power costs…';
const LEDGER_QUERY = { topics: `${WORLD_COST_TOPIC},${WORLD_RULES_TOPIC}` };

/** How the world works: the cost of power first, then the rules each chapter is held to. */
export function WorldStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);
  const parsed = parseWorldRound(round);

  const [draft, setDraft] = useState<WorldDraft>(() => worldDraftFrom(parsed));
  const [offered, setOffered] = useState<WorldDraft>(() => worldDraftFrom(parsed));
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
    const locked = restoreWorldDraft(decidedBefore.data.entries);
    if (locked) setDraft(current => (sameJson(current, offered) ? locked : current));
  }

  if (passRoundKey(round) !== roundKey) {
    setRoundKey(passRoundKey(round));
    setSteer(EMPTY_STEER);
    setDraft(current => nextWorldDraft(current, offered, parsed));
    setOffered(worldDraftFrom(parsed));
  }

  const busy = isRoundLive(round) || startRound.isPending;
  const costWhy = readAnchoredLine(draft.cost.why, draft.cost.rule);
  const costWriterLine = readAnchoredLine(draft.cost.writerLine, draft.cost.rule);
  const why = readAnchoredLine(draft.why, draft.summary);
  const writerLine = readAnchoredLine(draft.writerLine, draft.summary);
  const selection = buildWorldSelection(draft);
  const rules = draft.rules.length < WORLD_RULES_MAX ? [...draft.rules, { rule: '', why: '' }] : draft.rules;

  const patch = (next: Partial<WorldDraft>): void => setDraft(current => ({ ...current, ...next }));

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
          else toast.success('How the world works is locked');
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
                setDraft(worldDraftFrom(parsed));
                setOffered(worldDraftFrom(parsed));
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

      {parsed.honoured.length > 0 && (
        <Alert intent="info" title="Built around what you refused">
          {parsed.honoured.join(' · ')}
        </Alert>
      )}

      {round != null && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>What power costs</h2>
          <p className={styles.cardLede}>The cost rule is the identity decision of this world: a chapter has to be able to pay it on the page.</p>
          <div className={styles.pillRow}>
            {parsed.costRules.map(option => (
              <button
                key={option.id}
                type="button"
                className={styles.pill}
                aria-pressed={draft.cost.optionId === option.id}
                disabled={busy}
                onClick={() => patch({ cost: chooseCostRule(option) })}
              >
                {option.rule}
              </button>
            ))}
          </div>
          <div className={styles.editFields}>
            <Input
              aria-label="The cost rule"
              placeholder="What every use of power costs, concretely"
              value={draft.cost.rule}
              maxLength={WORLD_LINE_MAX}
              disabled={busy}
              onValueChange={rule => patch({ cost: editCostRule(draft.cost, rule) })}
            />
            <Input
              aria-label="Why this cost"
              placeholder="Why this cost and not another"
              value={costWhy.text}
              maxLength={WORLD_WHY_MAX}
              disabled={busy}
              onValueChange={text => patch({ cost: { ...draft.cost, why: anchorLine(text, draft.cost.rule) } })}
            />
            {costWhy.stale && <p className={styles.cardLede}>{STALE_LINE_NOTE}</p>}
            <Textarea
              aria-label="What the cost means for whoever writes chapter one"
              aria-invalid={costWriterLine.text.trim().length === 0}
              placeholder="What the cost means for whoever writes chapter one"
              value={costWriterLine.text}
              maxLength={WORLD_WRITER_LINE_MAX}
              minRows={2}
              autoGrow
              disabled={busy}
              onValueChange={text => patch({ cost: { ...draft.cost, writerLine: anchorLine(text, draft.cost.rule) } })}
            />
            {costWriterLine.stale && <p className={styles.cardLede}>{STALE_LINE_NOTE}</p>}
          </div>
        </section>
      )}

      {round != null && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>The rules it runs on</h2>
          <p className={styles.cardLede}>Each one becomes a canon fact, so write what a chapter can be held to. Empty a rule to drop it.</p>
          <div className={styles.editFields}>
            {rules.map((rule, index) => (
              <div key={index} className={styles.chipRow}>
                <Input
                  aria-label={`Rule ${index + 1}`}
                  placeholder={`Rule ${index + 1}`}
                  value={rule.rule}
                  maxLength={WORLD_LINE_MAX}
                  disabled={busy}
                  onValueChange={value => patch({ rules: editRule(rules, index, { rule: value }) })}
                />
                <Input
                  aria-label={`What rule ${index + 1} buys the story`}
                  placeholder="What it buys the story"
                  value={rule.why}
                  maxLength={WORLD_LINE_MAX}
                  disabled={busy}
                  onValueChange={value => patch({ rules: editRule(rules, index, { why: value }) })}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {draft.society != null && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Society and economy</h2>
          <p className={styles.cardLede}>Asked instead of a power ladder, because progression is not what this novel promises.</p>
          <div className={styles.editFields}>
            <Textarea
              aria-label="Who holds power and how life is ordered"
              placeholder="Who holds power here and how ordinary life is ordered"
              value={draft.society.order}
              maxLength={WORLD_TEXT_MAX}
              minRows={2}
              autoGrow
              disabled={busy}
              onValueChange={order => patch({ society: { order, economy: draft.society?.economy ?? '' } })}
            />
            <Textarea
              aria-label="How people earn, owe and trade"
              placeholder="How people earn, owe and trade"
              value={draft.society.economy}
              maxLength={WORLD_TEXT_MAX}
              minRows={2}
              autoGrow
              disabled={busy}
              onValueChange={economy => patch({ society: { order: draft.society?.order ?? '', economy } })}
            />
          </div>
        </section>
      )}

      {round != null && (
        <section className={styles.card}>
          <div className={styles.editFields}>
            <Input
              aria-label="How this world works, in one line"
              placeholder="How this world works, in one line"
              value={draft.summary}
              maxLength={WORLD_LINE_MAX}
              disabled={busy}
              onValueChange={summary => patch({ summary })}
            />
            <Input
              aria-label="Why these rules"
              placeholder="Why these rules"
              value={why.text}
              maxLength={WORLD_WHY_MAX}
              disabled={busy}
              onValueChange={text => patch({ why: anchorLine(text, draft.summary) })}
            />
            {why.stale && <p className={styles.cardLede}>{STALE_LINE_NOTE}</p>}
            <Textarea
              aria-label="What the rules mean for whoever writes chapter one"
              aria-invalid={writerLine.text.trim().length === 0}
              placeholder="What the rules mean for whoever writes chapter one"
              value={writerLine.text}
              maxLength={WORLD_WRITER_LINE_MAX}
              minRows={2}
              autoGrow
              disabled={busy}
              onValueChange={text => patch({ writerLine: anchorLine(text, draft.summary) })}
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
          submitLabel="Revise"
          running={busy}
          placeholder="Push back on a rule…"
        />
      )}

      {round != null && (
        <LockBar
          label={meta.lockLabel ?? 'Lock world rules'}
          hint={read ? 'Locking writes two decisions, the world and power pages, and a canon fact for every rule.' : 'Reading back what you already decided…'}
          onLock={lock}
          loading={lockStep.isPending}
          disabled={!read || selection == null || busy || lockStep.isPending}
        />
      )}
    </>
  );
}
