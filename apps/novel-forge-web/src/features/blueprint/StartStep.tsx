import { type ReactElement, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  START_LATER_TOPIC,
  START_RULED_OUT_TOPIC,
  START_TOPIC,
  START_WORD_MAX,
  type StartChip,
  type StartChipKind,
  startChipsKey,
  STARTING_TYPE_LABELS,
  STARTING_TYPES,
  type StartingType,
  startTextMeter,
  startTextStatus,
} from './start-step';
import { SteerBox } from './SteerBox';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Reading your starting point…';
const LEDGER_QUERY = { topics: `${START_TOPIC},${START_RULED_OUT_TOPIC},${START_LATER_TOPIC}` };
const LATER_GROUP_LABEL = 'Later in the story';
const ADD_CHIP_BUTTON_ID = 'start-chip-add';
const START_TEXT_ID = 'start-text';
const ANNOUNCEMENT_CLEAR_MS = 1_000;

/** A chip carries its own identity from the moment it exists, so removing an earlier one never shifts what a later one refers to. */
interface DraftChip extends StartChip {
  localId: string;
}

function chipTriggerId(identity: string): string {
  return `start-chip-kind-${identity}`;
}

function chipInputId(identity: string): string {
  return `start-chip-label-${identity}`;
}

function chipLabelText(chip: Pick<StartChip, 'label'>): string {
  return chip.label.trim() || 'Untitled chip';
}

/** Every chip already has an id by the time it reaches here: its option, its ledger entry, or the add-chip handler. */
function toDraftChips(list: StartChip[]): DraftChip[] {
  return list.map((chip, index) => ({ ...chip, localId: chip.localId ?? (chip.optionId ? `opt:${chip.optionId}` : `chip:${index}`) }));
}

/**
 * The starting point, read back as chips the author corrects. Locking it saves everything to the Notebook, with what comes
 * later in the story kept apart — nothing here is a decision, so a misunderstanding costs a re-run, not a revisit.
 */
export function StartStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);

  const [text, setText] = useState(() => parseStartInput(round).text ?? '');
  const [startingType, setStartingType] = useState<StartingType | null>(() => parseStartInput(round).startingType ?? null);
  const [draft, setDraft] = useState<SteerDraft>(EMPTY_STEER);
  const [chips, setChips] = useState<DraftChip[]>(() => toDraftChips(parseStartChips(round)));
  const [chipsKey, setChipsKey] = useState(() => startChipsKey(round));
  const [saved, setSaved] = useState<StartChip[] | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const pendingFocusRef = useRef<{ elementId: string; announce: string } | null>(null);
  const announceParityRef = useRef(false);

  const startRound = useStartBlueprintRoundMutation(projectId, step.key);
  const cancelRound = useCancelBlueprintRoundMutation(projectId, step.key);
  const lockStep = useLockBlueprintStepMutation(projectId, step.key);
  const savedChips = useLedgerEntriesQuery(projectId, LEDGER_QUERY);

  // Chips the author typed themselves are in no round's options, so a revisit has to read them back or the next lock retires them.
  if (saved == null && savedChips.data != null) {
    const restored = restoreStartChips(savedChips.data.entries);
    setSaved(restored);
    setChips(current => toDraftChips(mergeStartChips(current, restored, true)));
  }

  // Options arriving on the round already on screen is the same id with a different key, so the chips have
  // to follow the key, not the id. Adjusted during render rather than in an effect: a round that has just
  // become ready must never paint once with the old chips.
  if (startChipsKey(round) !== chipsKey) {
    setChipsKey(startChipsKey(round));
    setChips(toDraftChips(mergeStartChips(parseStartChips(round), saved ?? [], false)));
    setDraft(EMPTY_STEER);
  }

  // Re-parenting a chip into a different <ul>, or removing it, drops focus; this restores it once the move has painted.
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    document.getElementById(pending.elementId)?.focus();
    announceParityRef.current = !announceParityRef.current;
    setAnnouncement(pending.announce + (announceParityRef.current ? '\u200B' : ''));
  }, [chips]);

  // Cleared after a pause so a stale announcement doesn't linger in the live region.
  useEffect(() => {
    if (!announcement) return;
    const timer = window.setTimeout(() => setAnnouncement(''), ANNOUNCEMENT_CLEAR_MS);
    return () => window.clearTimeout(timer);
  }, [announcement]);

  const running = isRoundLive(round);
  const busy = running || startRound.isPending;
  const hasChips = chips.some(chip => chip.label.trim().length > 0);
  const textStatus = startTextStatus(text);
  const overLimit = textStatus.state === 'over';

  const run = (): void => {
    if (overLimit) return void toast.danger(`Your starting text is over the ${START_WORD_MAX.toLocaleString()}-word limit. Shorten it first.`);
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

  const editChip = (identity: string, patch: Partial<StartChip>): void => {
    const current = chips.find(chip => chip.localId === identity);
    if (current && patch.kind !== undefined && patch.kind !== current.kind && (patch.kind === 'later') !== (current.kind === 'later')) {
      pendingFocusRef.current = {
        elementId: chipTriggerId(identity),
        announce: patch.kind === 'later' ? `"${chipLabelText(current)}" moved to ${LATER_GROUP_LABEL}` : `"${chipLabelText(current)}" moved back to the opening`,
      };
    }
    setChips(chipsNow => chipsNow.map(chip => (chip.localId === identity ? { ...chip, ...patch } : chip)));
  };

  const opening = chips.filter(chip => chip.kind !== 'later');
  const later = chips.filter(chip => chip.kind === 'later');

  const removeChip = (identity: string): void => {
    const removed = chips.find(chip => chip.localId === identity);
    if (!removed) return;
    const group = removed.kind === 'later' ? later : opening;
    const position = group.findIndex(chip => chip.localId === identity);
    const neighbour = group[position + 1] ?? (position > 0 ? group[position - 1] : undefined);
    const fallback = chips.length > 1 ? ADD_CHIP_BUTTON_ID : START_TEXT_ID;
    pendingFocusRef.current = {
      elementId: neighbour ? chipInputId(neighbour.localId) : fallback,
      announce: `"${chipLabelText(removed)}" removed`,
    };
    setChips(current => current.filter(chip => chip.localId !== identity));
  };

  const renderChip = (chip: DraftChip, position: number): ReactElement => {
    const noun = chip.kind === 'later' ? 'later chip' : 'chip';
    return (
      <li key={chip.localId} className={styles.chipRow}>
        <Select
          triggerId={chipTriggerId(chip.localId)}
          value={chip.kind}
          onValueChange={kind => editChip(chip.localId, { kind: kind as StartChipKind })}
          aria-label={`What ${noun} ${position + 1} says`}
        >
          {START_CHIP_KINDS.map(kind => (
            <Select.Item key={kind} value={kind}>
              {START_CHIP_KIND_LABELS[kind]}
            </Select.Item>
          ))}
        </Select>
        <Input
          id={chipInputId(chip.localId)}
          value={chip.label}
          onValueChange={label => editChip(chip.localId, { label })}
          maxLength={START_CHIP_LABEL_MAX}
          aria-label={chip.kind === 'later' ? `Later chip ${position + 1}` : `Chip ${position + 1}`}
        />
        <IconButton
          size="sm"
          variant="ghost"
          aria-label={chip.label.trim() ? `Remove “${chip.label.trim()}”` : `Remove ${noun} ${position + 1}`}
          icon={<CloseIcon size={14} />}
          onClick={() => removeChip(chip.localId)}
        />
      </li>
    );
  };

  return (
    <>
      <section className={styles.card}>
        <Textarea
          id={START_TEXT_ID}
          placeholder="e.g. a kid who collects debts for the city and finds something in a jar that belongs to him. I like when magic costs something real. Not a chosen one."
          value={text}
          onValueChange={setText}
          minRows={6}
          maxRows={24}
          autoGrow
          aria-label="Your starting point"
          aria-describedby="start-text-count"
          aria-invalid={overLimit || undefined}
        />
        <p id="start-text-count" className={styles.startCount} data-state={textStatus.state} aria-live="polite">
          {startTextMeter(textStatus)}
        </p>
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
          <Button variant="primary" loading={busy} disabled={busy || overLimit || (!text.trim() && startingType == null)} onClick={run}>
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

      <span className={styles.srOnly} aria-live="polite">
        {announcement}
      </span>

      {chips.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Understood as</h2>
          <p className={styles.cardLede}>Correct anything that isn’t what you meant. What you keep here steers every later step.</p>
          {opening.length > 0 ? (
            <ul className={styles.chipList}>{opening.map(renderChip)}</ul>
          ) : (
            <p className={styles.cardLede}>Nothing read as the opening yet — everything kept below is for later.</p>
          )}

          {later.length > 0 && (
            <div className={styles.laterGroup}>
              <h3 className={styles.nbGroupLabel}>{LATER_GROUP_LABEL}</h3>
              <p className={styles.cardLede}>Kept for when the story gets there — nothing here shapes how it opens.</p>
              <ul className={styles.chipList}>{later.map(renderChip)}</ul>
            </div>
          )}

          <div className={styles.cardActions}>
            <Button
              id={ADD_CHIP_BUTTON_ID}
              size="sm"
              variant="ghost"
              prefix={<PlusIcon size={14} />}
              disabled={chips.length >= START_CHIP_MAX}
              onClick={() => setChips(current => [...current, { label: '', kind: 'element', localId: crypto.randomUUID() }])}
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
          hint={
            saved == null
              ? 'Reading back the chips you saved…'
              : 'Saved to your Notebook for every step after this one, with what comes later in the story kept apart. Nothing here is a decision yet.'
          }
          onLock={lock}
          loading={lockStep.isPending}
          disabled={saved == null || !hasChips || busy || lockStep.isPending}
        />
      )}
    </>
  );
}
