import { useMatchRoute, useNavigate } from '@tanstack/react-router';
import { type ReactElement, type ReactNode, useState } from 'react';
import { Button, DescriptionList, Slider, Textarea, TimePicker } from '@shadow-library/ui';

import { OverlaySurface } from '@/components/OverlaySurface';
import {
  type Command,
  type CommandConfirmation,
  failureCopy,
  formatTime,
  type HeroIntensityMode,
  notifyOutcome,
  type QuestOccurrence,
  REASON_LABELS,
  REASON_TAGS,
  type ReasonTag,
  STAT_LABELS,
  STRICTNESS_LABELS,
  STRICTNESS_RULES,
  useCommand,
  useDayPreferences,
  useMemoirData,
} from '@/lib/data';

import { alreadyRecordedReason, breakCostNote, breakStreakNote, rescheduleDisabledReason } from './quest-presenters';
import styles from './quest-actions.module.css';

type Step = 'actions' | 'partial' | 'reschedule' | 'skip' | 'postpone' | null;

export interface QuestActions {
  open: (occurrence: QuestOccurrence) => void;
  complete: (occurrence: QuestOccurrence) => void;
  reschedule: (occurrence: QuestOccurrence) => void;
  overlays: ReactNode;
}

const ACTION_VERBS: Partial<Record<Command['type'], string>> = {
  'quest.complete': 'complete',
  'quest.partial': 'save the partial for',
  'quest.skip': 'skip',
  'quest.postpone': 'postpone',
  'quest.reschedule': 'move',
};

interface QuestActionDefinition {
  id: string;
  label: string;
  rule: string;
  disabledReason?: string;
  run: () => void;
}

export function useQuestActions(): QuestActions {
  const navigate = useNavigate();
  const command = useCommand();
  const intensity = useDayPreferences().data?.intensity;
  const [occurrence, setOccurrence] = useState<QuestOccurrence | null>(null);
  const [step, setStep] = useState<Step>(null);
  const [confirmation, setConfirmation] = useState<CommandConfirmation | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [restoreFocusTo, setRestoreFocusTo] = useState<HTMLElement | null>(null);

  const close = (): void => setStep(null);
  const busy = occurrence !== null && command.isPendingFor(pending => 'occurrenceId' in pending && pending.occurrenceId === occurrence.id);

  const settle = async (payload: Command, target: QuestOccurrence, andClose: boolean, successNote?: string): Promise<void> => {
    const feedback = { action: ACTION_VERBS[payload.type] ?? 'save', subject: target.questName };
    const outcome = await command.run(payload).catch(() => null);
    if (!outcome) return notifyOutcome({ status: 'failed', message: failureCopy(null), code: null, undone: false }, { ...feedback, success: '' });
    if (outcome.status === 'needs-confirmation') {
      setConfirmation(outcome.confirmation);
      setConfirmationOpen(true);
      setStep(null);
      return;
    }

    const saved = outcome.status === 'applied' || outcome.status === 'queued-offline';
    notifyOutcome(outcome, { ...feedback, success: saved ? [outcome.local.message, successNote].filter(Boolean).join(' ') : '' });
    if (saved && andClose) close();
  };

  const dispatch = (payload: Command, andClose = true, successNote?: string): void => {
    if (occurrence) void settle(payload, occurrence, andClose, successNote);
  };

  const overlays = (
    <>
      {occurrence ? (
        <>
          <ActionListOverlay
            occurrence={occurrence}
            open={step === 'actions'}
            restoreFocusTo={restoreFocusTo}
            onClose={close}
            onPartial={() => setStep('partial')}
            onReschedule={() => setStep('reschedule')}
            onSkip={() => setStep('skip')}
            onPostpone={() => setStep('postpone')}
            onEdit={() => {
              close();
              void navigate({ to: '/quests/$questId', params: { questId: occurrence.questId } });
            }}
            dispatch={dispatch}
            pending={busy}
            intensity={intensity}
          />
          <PartialOverlay
            key={`partial-${occurrence.id}`}
            occurrence={occurrence}
            open={step === 'partial'}
            restoreFocusTo={restoreFocusTo}
            onClose={close}
            dispatch={dispatch}
            pending={busy}
          />
          <SkipOverlay
            key={`skip-${occurrence.id}`}
            occurrence={occurrence}
            open={step === 'skip'}
            restoreFocusTo={restoreFocusTo}
            onClose={close}
            dispatch={dispatch}
            pending={busy}
            intensity={intensity}
          />
          <PostponeOverlay
            key={`postpone-${occurrence.id}`}
            occurrence={occurrence}
            open={step === 'postpone'}
            restoreFocusTo={restoreFocusTo}
            onClose={close}
            dispatch={dispatch}
            pending={busy}
            intensity={intensity}
          />
          <RescheduleOverlay
            key={`reschedule-${occurrence.id}`}
            occurrence={occurrence}
            open={step === 'reschedule'}
            restoreFocusTo={restoreFocusTo}
            onClose={close}
            dispatch={dispatch}
            pending={busy}
          />
        </>
      ) : null}
      {confirmation ? (
        <RescheduleCapOverlay
          confirmation={confirmation}
          open={confirmationOpen}
          restoreFocusTo={restoreFocusTo}
          pending={busy}
          onClose={() => setConfirmationOpen(false)}
          onConfirm={() => {
            dispatch(confirmation.command, false);
            setConfirmationOpen(false);
          }}
        />
      ) : null}
    </>
  );

  return {
    open: next => {
      setRestoreFocusTo(document.activeElement instanceof HTMLElement ? document.activeElement : null);
      setStep('actions');
      setOccurrence(next);
    },
    complete: target => void settle({ type: 'quest.complete', occurrenceId: target.id }, target, false),
    reschedule: next => {
      setRestoreFocusTo(document.activeElement instanceof HTMLElement ? document.activeElement : null);
      setStep('reschedule');
      setOccurrence(next);
    },
    overlays,
  };
}

interface OverlayProps {
  occurrence: QuestOccurrence;
  open: boolean;
  restoreFocusTo: HTMLElement | null;
  onClose: () => void;
  dispatch: (command: Command, andClose?: boolean, successNote?: string) => void;
  pending: boolean;
  intensity?: HeroIntensityMode;
}

function summaryLine(occurrence: QuestOccurrence): string {
  return [
    'Today',
    STAT_LABELS[occurrence.statAffinity],
    STRICTNESS_LABELS[occurrence.strictness],
    occurrence.streakDays > 0 ? `${occurrence.streakDays}-day streak` : null,
    occurrence.shields > 0 ? `${occurrence.shields} shields` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function ActionListOverlay({
  occurrence,
  open,
  restoreFocusTo,
  onClose,
  onPartial,
  onReschedule,
  onSkip,
  onPostpone,
  onEdit,
  dispatch,
  pending,
  intensity,
}: OverlayProps & { onPartial: () => void; onReschedule: () => void; onSkip: () => void; onPostpone: () => void; onEdit: () => void }): ReactElement {
  const matchRoute = useMatchRoute();
  const onOwnDetailPage = Boolean(matchRoute({ to: '/quests/$questId', params: { questId: occurrence.questId } }));
  const shielded = occurrence.shields > 0;
  const cost = breakCostNote(occurrence.strictness, intensity, occurrence.streakDays, shielded);
  const streakNote = breakStreakNote(occurrence.strictness, occurrence.shields);

  const actions: QuestActionDefinition[] = [
    {
      id: 'complete',
      label: 'Complete',
      rule: `${STRICTNESS_RULES[occurrence.strictness]} ${STAT_LABELS[occurrence.statAffinity]} gains a point.`,
      disabledReason: alreadyRecordedReason(occurrence),
      run: () => dispatch({ type: 'quest.complete', occurrenceId: occurrence.id }),
    },
    {
      id: 'partial',
      label: 'Partial',
      rule: 'Keeps the streak and grants XP for what you did. A reason is asked for.',
      disabledReason: alreadyRecordedReason(occurrence),
      run: onPartial,
    },
    {
      id: 'postpone',
      label: 'Postpone to tomorrow',
      rule: `${streakNote} ${cost}`,
      disabledReason:
        occurrence.strictness === 'recovery' || occurrence.strictness === 'optional' ? 'Postpone does not apply to this strictness.' : alreadyRecordedReason(occurrence),
      run: onPostpone,
    },
    {
      id: 'reschedule',
      label: 'Reschedule to another time',
      rule: 'Moves only this occurrence’s time today. The streak is untouched while the move is inside the cap.',
      disabledReason: rescheduleDisabledReason(occurrence),
      run: onReschedule,
    },
    {
      id: 'skip',
      label: 'Skip with a reason',
      rule: `${streakNote} ${cost} The reason is only ever shown to you.`,
      disabledReason: alreadyRecordedReason(occurrence),
      run: onSkip,
    },
    ...(onOwnDetailPage
      ? []
      : [
          {
            id: 'edit',
            label: 'Quest details',
            rule: 'History, streak and rules for this quest.',
            run: onEdit,
          },
        ]),
  ];

  return (
    <OverlaySurface
      open={open}
      onOpenChange={onClose}
      restoreFocusTo={restoreFocusTo}
      title={occurrence.questName}
      description={summaryLine(occurrence)}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <ul className={styles.actionList}>
        {actions.map(action => (
          <li key={action.id}>
            <button
              type="button"
              className={styles.action}
              onClick={action.run}
              disabled={Boolean(action.disabledReason) || pending}
              aria-busy={pending || undefined}
              aria-label={action.label}
              aria-describedby={`${action.id}-rule`}
            >
              <span className={styles.actionLabel}>{action.label}</span>
              <span className={styles.actionRule} id={`${action.id}-rule`}>
                {action.disabledReason ?? action.rule}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </OverlaySurface>
  );
}

function ReasonPicker({ reason, onPick }: { reason: ReasonTag | null; onPick: (tag: ReasonTag) => void }): ReactElement {
  return (
    <div className={styles.reasons}>
      {REASON_TAGS.map(tag => (
        <Button key={tag} size="sm" variant={reason === tag ? 'primary' : 'ghost'} aria-pressed={reason === tag} onClick={() => onPick(tag)}>
          {REASON_LABELS[tag]}
        </Button>
      ))}
    </div>
  );
}

function PartialOverlay({ occurrence, open, restoreFocusTo, onClose, dispatch, pending }: OverlayProps): ReactElement {
  const target = occurrence.partialTarget;
  const max = target?.target ?? 100;
  const unit = target?.unit ?? '%';
  const [progress, setProgress] = useState(Math.round(max / 2));
  const [reason, setReason] = useState<ReasonTag | null>(null);
  const [note, setNote] = useState('');

  return (
    <OverlaySurface
      open={open}
      onOpenChange={onClose}
      restoreFocusTo={restoreFocusTo}
      title={`Partial — ${occurrence.questName}`}
      description="A partial keeps the streak and grants XP for what you did. It is a real outcome, not a failure."
      size="md"
      sheetSnapPoints={['half', 'full']}
      sheetDefaultSnap="full"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!reason}
            onClick={() => reason && dispatch({ type: 'quest.partial', occurrenceId: occurrence.id, progress, reasonTag: reason, note: note || undefined })}
          >
            Save partial
          </Button>
        </>
      }
    >
      <div className={styles.partialBody}>
        <Slider
          label="How far did you get"
          value={progress}
          onValueChange={value => setProgress(Array.isArray(value) ? (value[0] as number) : value)}
          min={0}
          max={max}
          step={1}
          unit={unit}
          showValue
          aria-label="How far did you get"
        />
        <div>
          <p className={styles.fieldLabel}>
            Reason <span className={styles.fieldHint}>— used only in your own patterns</span>
          </p>
          <ReasonPicker reason={reason} onPick={setReason} />
          {reason ? null : <p className={styles.fieldHint}>Choose a reason to save.</p>}
        </div>
        <Textarea placeholder="Anything worth remembering (optional)" maxLength={120} showCount value={note} onValueChange={setNote} minRows={2} aria-label="Reason note" />
      </div>
    </OverlaySurface>
  );
}

function breakNotesFor(occurrence: QuestOccurrence, intensity: HeroIntensityMode | undefined): { streakNote: string; costNote: string } {
  return {
    streakNote: breakStreakNote(occurrence.strictness, occurrence.shields),
    costNote: breakCostNote(occurrence.strictness, intensity, occurrence.streakDays, occurrence.shields > 0),
  };
}

function SkipOverlay({ occurrence, open, restoreFocusTo, onClose, dispatch, pending, intensity }: OverlayProps): ReactElement {
  const [reason, setReason] = useState<ReasonTag | null>(null);
  const [note, setNote] = useState('');
  const { streakNote, costNote } = breakNotesFor(occurrence, intensity);

  return (
    <OverlaySurface
      open={open}
      onOpenChange={onClose}
      restoreFocusTo={restoreFocusTo}
      title={`Skip — ${occurrence.questName}`}
      description="The reason is only ever shown to you."
      size="md"
      sheetSnapPoints={['half', 'full']}
      sheetDefaultSnap="full"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              dispatch({ type: 'quest.skip', occurrenceId: occurrence.id, reasonTag: reason ?? undefined, note: note || undefined }, true, `${streakNote} ${costNote}`)
            }
          >
            Skip quest
          </Button>
        </>
      }
    >
      <div className={styles.partialBody}>
        <DescriptionList layout="row" termWidth={150}>
          <DescriptionList.Item term="Streak">{streakNote}</DescriptionList.Item>
          <DescriptionList.Item term="Cost">{costNote}</DescriptionList.Item>
        </DescriptionList>
        <div>
          <p className={styles.fieldLabel}>
            Reason <span className={styles.fieldHint}>— used only in your own patterns</span>
          </p>
          <ReasonPicker reason={reason} onPick={setReason} />
        </div>
        <Textarea placeholder="Anything worth remembering (optional)" maxLength={120} showCount value={note} onValueChange={setNote} minRows={2} aria-label="Reason note" />
      </div>
    </OverlaySurface>
  );
}

function PostponeOverlay({ occurrence, open, restoreFocusTo, onClose, dispatch, pending, intensity }: OverlayProps): ReactElement {
  const { streakNote, costNote } = breakNotesFor(occurrence, intensity);

  return (
    <OverlaySurface
      open={open}
      onOpenChange={onClose}
      restoreFocusTo={restoreFocusTo}
      title={`Postpone — ${occurrence.questName}`}
      description={`This moves the occurrence to tomorrow. ${streakNote} ${costNote}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep today
          </Button>
          <Button variant="primary" loading={pending} onClick={() => dispatch({ type: 'quest.postpone', occurrenceId: occurrence.id }, true, `${streakNote} ${costNote}`)}>
            Postpone
          </Button>
        </>
      }
    >
      <div className={styles.partialBody}>
        <DescriptionList layout="row" termWidth={150}>
          <DescriptionList.Item term="Streak">{streakNote}</DescriptionList.Item>
          <DescriptionList.Item term="Cost">{costNote}</DescriptionList.Item>
        </DescriptionList>
      </div>
    </OverlaySurface>
  );
}

function toMinuteOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function isPastRescheduleTime(occurrenceDate: string, today: string, minuteOfDay: number): boolean {
  if (occurrenceDate > today) return false;
  if (occurrenceDate < today) return true;
  const now = new Date();
  return minuteOfDay < now.getHours() * 60 + now.getMinutes();
}

function nextQuarterHour(now: Date): string {
  const minuteOfDay = Math.min(1439, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15);
  return `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
}

const RESCHEDULE_ERROR_ID = 'reschedule-time-error';

function RescheduleOverlay({ occurrence, open, restoreFocusTo, onClose, dispatch, pending }: OverlayProps): ReactElement {
  const { today } = useMemoirData();
  const [time, setTime] = useState(formatTime(occurrence.startTimeMinutes) ?? nextQuarterHour(new Date()));
  const [error, setError] = useState<string | null>(null);

  const move = (): void => {
    const toMin = toMinuteOfDay(time);
    if (isPastRescheduleTime(occurrence.date, today, toMin)) {
      setError('Pick a time that hasn’t passed yet.');
      return;
    }
    dispatch({ type: 'quest.reschedule', occurrenceId: occurrence.id, toMin });
  };

  return (
    <OverlaySurface
      open={open}
      onOpenChange={onClose}
      restoreFocusTo={restoreFocusTo}
      title={`Reschedule — ${occurrence.questName}`}
      description="This changes only today’s time — the day and the recurring plan don’t move."
      size="md"
      sheetSnapPoints={['half', 'full']}
      sheetDefaultSnap="full"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep the plan
          </Button>
          <Button variant="primary" loading={pending} onClick={move}>
            Move it
          </Button>
        </>
      }
    >
      <div className={styles.partialBody}>
        <TimePicker
          value={time}
          onValueChange={value => {
            setTime(value ?? time);
            setError(null);
          }}
          hour12={false}
          aria-label="Move to"
          aria-invalid={error !== null}
          aria-describedby={error ? RESCHEDULE_ERROR_ID : undefined}
        />
        {error ? (
          <p className={styles.fieldError} id={RESCHEDULE_ERROR_ID} role="alert">
            {error}
          </p>
        ) : null}
        <DescriptionList layout="row" termWidth={150}>
          <DescriptionList.Item term="Streak">Kept — a move inside the cap does not break it</DescriptionList.Item>
          <DescriptionList.Item term="HP">Unchanged</DescriptionList.Item>
          <DescriptionList.Item term="Recurring plan">Untouched — only today’s occurrence moves</DescriptionList.Item>
        </DescriptionList>
      </div>
    </OverlaySurface>
  );
}

interface RescheduleCapOverlayProps {
  confirmation: CommandConfirmation;
  open: boolean;
  restoreFocusTo: HTMLElement | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function RescheduleCapOverlay({ confirmation, open, restoreFocusTo, pending, onClose, onConfirm }: RescheduleCapOverlayProps): ReactElement {
  return (
    <OverlaySurface
      open={open}
      onOpenChange={onClose}
      restoreFocusTo={restoreFocusTo}
      title={confirmation.title}
      description={confirmation.body}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {confirmation.cancelLabel}
          </Button>
          <Button variant="primary" loading={pending} onClick={onConfirm}>
            {confirmation.confirmLabel}
          </Button>
        </>
      }
    >
      <DescriptionList layout="row" termWidth={150}>
        <DescriptionList.Item term="Recorded as">A postpone with a reason, so the history stays honest</DescriptionList.Item>
        <DescriptionList.Item term="Blocked">Never — the cap advises, it does not stop the move</DescriptionList.Item>
      </DescriptionList>
    </OverlaySurface>
  );
}
