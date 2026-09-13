import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, type ReactNode, useState } from 'react';
import { Button, DescriptionList, Slider, Textarea, TimePicker } from '@shadow-library/ui';

import { OverlaySurface } from '@/components/OverlaySurface';
import {
  type Command,
  type CommandConfirmation,
  failureCopy,
  formatTime,
  notifyOutcome,
  type QuestOccurrence,
  REASON_LABELS,
  REASON_TAGS,
  type ReasonTag,
  STAT_LABELS,
  STRICTNESS_LABELS,
  STRICTNESS_RULES,
  useCommand,
} from '@/lib/data';

import styles from './quest-actions.module.css';

type Step = 'actions' | 'partial' | 'reschedule' | null;

export interface QuestActions {
  open: (occurrence: QuestOccurrence) => void;
  complete: (occurrence: QuestOccurrence) => void;
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
  const [occurrence, setOccurrence] = useState<QuestOccurrence | null>(null);
  const [step, setStep] = useState<Step>(null);
  const [confirmation, setConfirmation] = useState<CommandConfirmation | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [restoreFocusTo, setRestoreFocusTo] = useState<HTMLElement | null>(null);

  const close = (): void => setStep(null);
  const busy = occurrence !== null && command.isPendingFor(pending => 'occurrenceId' in pending && pending.occurrenceId === occurrence.id);

  const settle = async (payload: Command, target: QuestOccurrence, andClose: boolean): Promise<void> => {
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
    notifyOutcome(outcome, { ...feedback, success: saved ? outcome.local.message : '' });
    if (saved && andClose) close();
  };

  const dispatch = (payload: Command, andClose = true): void => {
    if (occurrence) void settle(payload, occurrence, andClose);
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
            onEdit={() => {
              close();
              void navigate({ to: '/quests/$questId', params: { questId: occurrence.questId } });
            }}
            dispatch={dispatch}
            pending={busy}
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
    overlays,
  };
}

interface OverlayProps {
  occurrence: QuestOccurrence;
  open: boolean;
  restoreFocusTo: HTMLElement | null;
  onClose: () => void;
  dispatch: (command: Command, andClose?: boolean) => void;
  pending: boolean;
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
  onEdit,
  dispatch,
  pending,
}: OverlayProps & { onPartial: () => void; onReschedule: () => void; onEdit: () => void }): ReactElement {
  const spendsHp = occurrence.strictness === 'anchor' || occurrence.strictness === 'routine';
  const actions: QuestActionDefinition[] = [
    {
      id: 'complete',
      label: 'Complete',
      rule: `${STRICTNESS_RULES[occurrence.strictness]} ${STAT_LABELS[occurrence.statAffinity]} gains a point.`,
      run: () => dispatch({ type: 'quest.complete', occurrenceId: occurrence.id }),
    },
    {
      id: 'partial',
      label: 'Partial',
      rule: 'Keeps the streak and grants XP for what you did. A reason is asked for.',
      run: onPartial,
    },
    {
      id: 'postpone',
      label: 'Postpone to tomorrow',
      rule: spendsHp ? 'Moves the occurrence to tomorrow and spends 1 HP. A shield can cover it.' : 'Moves the occurrence to tomorrow. No HP is spent.',
      disabledReason: occurrence.strictness === 'recovery' || occurrence.strictness === 'optional' ? 'Postpone does not apply to this strictness.' : undefined,
      run: () => dispatch({ type: 'quest.postpone', occurrenceId: occurrence.id }),
    },
    {
      id: 'reschedule',
      label: 'Reschedule to another day',
      rule: 'Moves only this occurrence. The streak is untouched while the move is inside the cap.',
      run: onReschedule,
    },
    {
      id: 'skip',
      label: 'Skip with a reason',
      rule: occurrence.shields > 0 ? 'Ends the streak unless a shield covers it — one is held.' : 'Ends the streak. The reason is only ever shown to you.',
      run: () => dispatch({ type: 'quest.skip', occurrenceId: occurrence.id }),
    },
    {
      id: 'edit',
      label: 'Edit quest',
      rule: 'Changes apply to future occurrences and never rewrite history.',
      disabledReason: occurrence.locked ? 'Schedule and strictness are locked while this week’s plan is committed.' : undefined,
      run: onEdit,
    },
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

function PartialOverlay({ occurrence, open, restoreFocusTo, onClose, dispatch, pending }: OverlayProps): ReactElement {
  const target = occurrence.partialTarget;
  const max = target?.target ?? 100;
  const unit = target?.unit ?? '%';
  const [progress, setProgress] = useState(Math.round(max / 2));
  const [reason, setReason] = useState<ReasonTag>('too_tired');
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
            onClick={() => dispatch({ type: 'quest.partial', occurrenceId: occurrence.id, progress, reasonTag: reason, note: note || undefined })}
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
          <div className={styles.reasons}>
            {REASON_TAGS.map(tag => (
              <Button key={tag} size="sm" variant={reason === tag ? 'secondary' : 'ghost'} aria-pressed={reason === tag} onClick={() => setReason(tag)}>
                {REASON_LABELS[tag]}
              </Button>
            ))}
          </div>
        </div>
        <Textarea placeholder="Anything worth remembering (optional)" maxLength={120} value={note} onValueChange={setNote} minRows={2} aria-label="Reason note" />
      </div>
    </OverlaySurface>
  );
}

function toMinuteOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function RescheduleOverlay({ occurrence, open, restoreFocusTo, onClose, dispatch, pending }: OverlayProps): ReactElement {
  const [time, setTime] = useState(formatTime(occurrence.startTimeMinutes) ?? '09:00');

  return (
    <OverlaySurface
      open={open}
      onOpenChange={onClose}
      restoreFocusTo={restoreFocusTo}
      title={`Move ${occurrence.questName}`}
      description="A reschedule moves this occurrence's time. It stays on the same day — the recurring plan is never rewritten."
      size="md"
      sheetSnapPoints={['half', 'full']}
      sheetDefaultSnap="full"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep the plan
          </Button>
          <Button variant="primary" loading={pending} onClick={() => dispatch({ type: 'quest.reschedule', occurrenceId: occurrence.id, toMin: toMinuteOfDay(time) })}>
            Move it
          </Button>
        </>
      }
    >
      <div className={styles.partialBody}>
        <TimePicker value={time} onValueChange={value => setTime(value ?? time)} hour12={false} aria-label="Move to" />
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
