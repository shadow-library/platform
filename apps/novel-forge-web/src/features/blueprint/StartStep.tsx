import { type ReactElement, useState } from 'react';
import { Alert, Button, IconButton, Input, Select, Textarea, toast } from '@shadow-library/ui';

import { CloseIcon, PlusIcon } from '@/components/icons';
import { StatusChip } from '@/components/nf';
import { isRoundLive, useCancelBlueprintRoundMutation, useLedgerEntriesQuery, useLockBlueprintStepMutation, useStartBlueprintRoundMutation } from '@/lib/apis';

import { blueprintStepMeta, type StepScreenProps } from './blueprint-steps';
import { LockBar } from './LockBar';
import { buildRoundBody, EMPTY_STEER, roundThread, type SteerDraft, stepPayload } from './round';
import { RoundStatus } from './RoundStatus';
import {
  buildStartSelection,
  mergeStartChips,
  parseStartChips,
  parseStartInput,
  resolveStartInput,
  restoreStartChips,
  START_CHIP_KIND_LABELS,
  START_CHIP_KINDS,
  START_CHIP_LABEL_MAX,
  START_CHIP_MAX,
  START_RULED_OUT_TOPIC,
  START_TEXT_MAX,
  START_TOPIC,
  type StartChip,
  type StartChipKind,
  startChipsKey,
  STARTING_TYPE_LABELS,
  STARTING_TYPES,
  type StartingType,
} from './start-step';
import { SteerBox } from './SteerBox';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Reading your starting point…';
const LEDGER_QUERY = { topics: `${START_TOPIC},${START_RULED_OUT_TOPIC}` };

/**
 * The starting point, read back as chips the author corrects. It is the one step whose lock writes only
 * directions and rejections — nothing here is a decision, so a misunderstanding costs a re-run, not a revisit.
 */
export function StartStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);

  const [text, setText] = useState(() => parseStartInput(round).text ?? '');
  const [startingType, setStartingType] = useState<StartingType | null>(() => parseStartInput(round).startingType ?? null);
  const [draft, setDraft] = useState<SteerDraft>(EMPTY_STEER);
  const [chips, setChips] = useState<StartChip[]>(() => parseStartChips(round));
  const [chipsKey, setChipsKey] = useState(() => startChipsKey(round));
  const [saved, setSaved] = useState<StartChip[] | null>(null);

  const startRound = useStartBlueprintRoundMutation(projectId, step.key);
  const cancelRound = useCancelBlueprintRoundMutation(projectId, step.key);
  const lockStep = useLockBlueprintStepMutation(projectId, step.key);
  const savedChips = useLedgerEntriesQuery(projectId, LEDGER_QUERY);

  // Chips the author typed themselves are in no round's options, so a revisit has to read them back or the next lock retires them.
  if (saved == null && savedChips.data != null) {
    const restored = restoreStartChips(savedChips.data.entries);
    setSaved(restored);
    setChips(current => mergeStartChips(current, restored, true));
  }

  // Options arriving on the round already on screen is the same id with a different key, so the chips have
  // to follow the key, not the id. Adjusted during render rather than in an effect: a round that has just
  // become ready must never paint once with the old chips.
  if (startChipsKey(round) !== chipsKey) {
    setChipsKey(startChipsKey(round));
    setChips(mergeStartChips(parseStartChips(round), saved ?? [], false));
    setDraft(EMPTY_STEER);
  }

  const running = isRoundLive(round);
  const busy = running || startRound.isPending;
  const hasChips = chips.some(chip => chip.label.trim().length > 0);

  const run = (): void => {
    startRound.mutate(buildRoundBody(draft, {}, stepPayload(resolveStartInput(text, startingType, round))), {
      onSuccess: () => setDraft(EMPTY_STEER),
      onError: err => toast.danger(err.message),
    });
  };

  const lock = (): void => {
    lockStep.mutate(
      { selection: stepPayload(buildStartSelection(chips)) },
      {
        onSuccess: result => {
          if (result.followUp?.ok === false) toast.warning(result.followUp.error ?? 'Saved, but the follow-up work failed.');
          else toast.success('Starting point saved');
          onLocked();
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  const editChip = (index: number, patch: Partial<StartChip>): void => setChips(current => current.map((chip, at) => (at === index ? { ...chip, ...patch } : chip)));

  return (
    <>
      <section className={styles.card}>
        <Textarea
          placeholder="e.g. a kid who collects debts for the city and finds something in a jar that belongs to him. I like when magic costs something real. Not a chosen one."
          value={text}
          onValueChange={setText}
          maxLength={START_TEXT_MAX}
          minRows={4}
          maxRows={12}
          autoGrow
          aria-label="Your starting point"
        />
        <div className={styles.startTypes}>
          <span className={styles.startTypesLabel}>Or start from:</span>
          {STARTING_TYPES.map(type => (
            <button
              key={type}
              type="button"
              className={styles.nudge}
              aria-pressed={startingType === type}
              onClick={() => setStartingType(current => (current === type ? null : type))}
            >
              {STARTING_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
        <div className={styles.cardActions}>
          <Button variant="primary" loading={busy} disabled={busy || (!text.trim() && startingType == null)} onClick={run}>
            {round == null ? 'Read it back to me' : 'Read it again'}
          </Button>
        </div>
      </section>

      {savedChips.isError && (
        <Alert
          intent="danger"
          title="Couldn’t read back the chips you saved"
          action={{ label: savedChips.isFetching ? 'Retrying…' : 'Try again', onClick: () => void savedChips.refetch() }}
        >
          Saving now would retire the chips this screen cannot see, so it stays disabled until the Notebook loads. {savedChips.error?.message}
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

      {chips.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Understood as</h2>
          <p className={styles.cardLede}>Correct anything that isn’t what you meant. What you keep here steers every later step.</p>
          <ul className={styles.chipList}>
            {chips.map((chip, index) => (
              <li key={chip.optionId ?? `added-${index}`} className={styles.chipRow}>
                <Select value={chip.kind} onValueChange={kind => editChip(index, { kind: kind as StartChipKind })} aria-label={`What chip ${index + 1} says`}>
                  {START_CHIP_KINDS.map(kind => (
                    <Select.Item key={kind} value={kind}>
                      {START_CHIP_KIND_LABELS[kind]}
                    </Select.Item>
                  ))}
                </Select>
                <Input value={chip.label} onValueChange={label => editChip(index, { label })} maxLength={START_CHIP_LABEL_MAX} aria-label={`Chip ${index + 1}`} />
                <IconButton
                  size="sm"
                  variant="ghost"
                  aria-label={chip.label.trim() ? `Remove “${chip.label.trim()}”` : `Remove chip ${index + 1}`}
                  icon={<CloseIcon size={14} />}
                  onClick={() => setChips(current => current.filter((_, at) => at !== index))}
                />
              </li>
            ))}
          </ul>
          <div className={styles.cardActions}>
            <Button
              size="sm"
              variant="ghost"
              prefix={<PlusIcon size={14} />}
              disabled={chips.length >= START_CHIP_MAX}
              onClick={() => setChips(current => [...current, { label: '', kind: 'element' }])}
            >
              Add one it missed
            </Button>
            <StatusChip intent="neutral">
              {chips.length} of {START_CHIP_MAX}
            </StatusChip>
          </div>
        </section>
      )}

      {round != null && (
        <SteerBox nudges={step.nudges} draft={draft} onDraftChange={setDraft} messages={roundThread(round)} onSubmit={run} submitLabel="Read it again" running={busy} />
      )}

      {chips.length > 0 && (
        <LockBar
          label={meta.lockLabel ?? 'Save the starting point'}
          hint={saved == null ? 'Reading back the chips you saved…' : 'Saved as directions and rejections every later step reads. Nothing here is a decision yet.'}
          onLock={lock}
          loading={lockStep.isPending}
          disabled={saved == null || !hasChips || busy || lockStep.isPending}
        />
      )}
    </>
  );
}
