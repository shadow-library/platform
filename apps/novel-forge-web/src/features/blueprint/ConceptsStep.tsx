import { type ReactElement, useState } from 'react';
import { Button, Dialog, Input, Textarea, toast } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';
import { type BlueprintFeedbackVerdict, isRoundLive, useCancelBlueprintRoundMutation, useLockBlueprintStepMutation, useStartBlueprintRoundMutation } from '@/lib/apis';

import { blueprintStepMeta, type StepScreenProps } from './blueprint-steps';
import {
  buildConceptsSelection,
  CONCEPT_KEPT_WHY_MAX,
  CONCEPT_LOGLINE_MAX,
  CONCEPT_TITLE_MAX,
  type ConceptEdits,
  conceptsRoundKey,
  conceptTally,
  editedCard,
  parseConceptCards,
} from './concepts-step';
import { LockBar } from './LockBar';
import { OptionCard } from './OptionCard';
import { buildRoundBody, EMPTY_STEER, type OptionVerdicts, roundThread, type SteerDraft, stepPayload } from './round';
import { RoundStatus } from './RoundStatus';
import { SteerBox } from './SteerBox';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Writing four novels you could write…';

/** Four concepts, one of them the author's own. Keeping one and killing the rest with reasons is what the lock writes. */
export function ConceptsStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);
  const cards = parseConceptCards(round);

  const [keptId, setKeptId] = useState<string | null>(null);
  const [edits, setEdits] = useState<ConceptEdits>({});
  const [verdicts, setVerdicts] = useState<OptionVerdicts>({});
  const [why, setWhy] = useState('');
  const [draft, setDraft] = useState<SteerDraft>(EMPTY_STEER);
  const [editing, setEditing] = useState<string | null>(null);
  const [roundKey, setRoundKey] = useState(() => conceptsRoundKey(round));

  const startRound = useStartBlueprintRoundMutation(projectId, step.key);
  const cancelRound = useCancelBlueprintRoundMutation(projectId, step.key);
  const lockStep = useLockBlueprintStepMutation(projectId, step.key);

  if (conceptsRoundKey(round) !== roundKey) {
    setRoundKey(conceptsRoundKey(round));
    setKeptId(null);
    setEdits({});
    setVerdicts({});
    setWhy('');
    setDraft(EMPTY_STEER);
    setEditing(null);
  }

  const running = isRoundLive(round);
  const busy = running || startRound.isPending;
  const tally = conceptTally(cards, keptId, verdicts);
  const selection = buildConceptsSelection(cards, keptId, edits, verdicts, why);
  const editingCard = cards.find(card => card.id === editing);

  const run = (): void => {
    startRound.mutate(buildRoundBody(draft, verdicts), { onSuccess: () => setDraft(EMPTY_STEER), onError: err => toast.danger(err.message) });
  };

  const keep = (cardId: string): void => {
    setKeptId(current => (current === cardId ? null : cardId));
    setVerdicts(current => {
      if (current[cardId]?.verdict !== 'not') return current;
      const next = { ...current };
      delete next[cardId];
      return next;
    });
  };

  const setVerdict = (cardId: string, verdict: BlueprintFeedbackVerdict | null, reason?: string): void => {
    setVerdicts(current => {
      const next = { ...current };
      if (verdict == null) delete next[cardId];
      else next[cardId] = { verdict, ...(reason ? { reason } : {}) };
      return next;
    });
    if (verdict === 'not') setKeptId(current => (current === cardId ? null : current));
  };

  const lock = (): void => {
    if (!selection) return;
    lockStep.mutate(
      { selection: stepPayload(selection) },
      {
        onSuccess: result => {
          if (result.followUp?.ok === false) toast.warning(result.followUp.error ?? 'Saved, but the follow-up work failed.');
          else toast.success('Concept kept');
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
          <p className={styles.cardLede}>Four concepts are built from your starting point and everything in the Notebook. One of them will be your own idea, sharpened.</p>
          <div className={styles.cardActions}>
            <Button variant="primary" loading={busy} disabled={busy} onClick={run}>
              Show me four ideas
            </Button>
          </div>
        </section>
      )}

      <RoundStatus
        round={round}
        runningLabel={RUNNING_LABEL}
        onCancel={() => cancelRound.mutate(undefined, { onError: err => toast.danger(err.message) })}
        cancelling={cancelRound.isPending}
        onRetry={run}
        retrying={startRound.isPending}
      />

      {cards.length > 0 && (
        <>
          <div className={styles.pairHead}>
            <span className={styles.cardLede}>Keep one. Kill the rest with the reason — that reason is what stops the next round offering it again.</span>
            <StatusChip intent={tally.kept > 0 ? 'accent' : 'neutral'}>
              Kept {tally.kept} · Killed {tally.killed}
            </StatusChip>
          </div>
          <div className={styles.conceptGrid}>
            {cards.map(card => {
              const shown = editedCard(card, edits);
              return (
                <OptionCard
                  key={card.id}
                  title={
                    <span className={styles.conceptTitle}>
                      {shown.title}
                      {card.fromAuthor && <StatusChip intent="accent">From your idea</StatusChip>}
                    </span>
                  }
                  description={shown.logline}
                  selected={keptId === card.id}
                  onSelect={() => keep(card.id)}
                  verdict={verdicts[card.id]?.verdict ?? null}
                  verdictReason={verdicts[card.id]?.reason}
                  onVerdict={(verdict, reason) => setVerdict(card.id, verdict, reason)}
                  onEdit={() => setEditing(card.id)}
                  disabled={busy}
                >
                  <dl className={styles.conceptDetail}>
                    <dt>Engine</dt>
                    <dd>{card.engine}</dd>
                    <dt>Hook</dt>
                    <dd>{card.hook}</dd>
                  </dl>
                </OptionCard>
              );
            })}
          </div>
        </>
      )}

      {keptId != null && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>What are you keeping it for?</h2>
          <p className={styles.cardLede}>One line. It is saved beside the concept, and it is what the premise is built to deliver.</p>
          <Input
            value={why}
            onValueChange={setWhy}
            maxLength={CONCEPT_KEPT_WHY_MAX}
            placeholder="e.g. the debt is personal and the magic has a price"
            aria-label="Why you kept it"
          />
        </section>
      )}

      {round != null && (
        <SteerBox
          nudges={step.nudges}
          draft={draft}
          onDraftChange={setDraft}
          messages={roundThread(round)}
          onSubmit={run}
          submitLabel="New round"
          running={busy}
          placeholder="e.g. a city built on debt, where even magic is borrowed"
        />
      )}

      {cards.length > 0 && (
        <LockBar
          label={meta.lockLabel ?? 'Build a premise from what I kept'}
          hint="The kept concept becomes a direction; every card you killed becomes a rejection with your reason."
          onLock={lock}
          loading={lockStep.isPending}
          disabled={selection == null || busy || lockStep.isPending}
        />
      )}

      <Dialog open={editing != null} onOpenChange={next => setEditing(next ? editing : null)}>
        <Dialog.Content size="sm">
          <Dialog.Header title="Say it in your words" description="What you write here is what the premise is built from, not the card the coach wrote." />
          <Dialog.Body>
            <div className={styles.editFields}>
              <Input
                value={edits[editing ?? '']?.title ?? editingCard?.title ?? ''}
                onValueChange={title => setEdits(current => ({ ...current, [editing ?? '']: { ...current[editing ?? ''], title } }))}
                maxLength={CONCEPT_TITLE_MAX}
                aria-label="Title"
              />
              <Textarea
                value={edits[editing ?? '']?.logline ?? editingCard?.logline ?? ''}
                onValueChange={logline => setEdits(current => ({ ...current, [editing ?? '']: { ...current[editing ?? ''], logline } }))}
                maxLength={CONCEPT_LOGLINE_MAX}
                minRows={3}
                autoGrow
                aria-label="Logline"
              />
            </div>
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="primary">Done</Button>
            </Dialog.Close>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </>
  );
}
