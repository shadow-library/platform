import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, type ReactNode, useState } from 'react';
import { Button, DatePicker, DescriptionList, Slider, Textarea, toast } from '@shadow-library/ui';

import { OverlaySurface } from '@/components/OverlaySurface';
import {
  type Command,
  type CommandConfirmation,
  type QuestOccurrence,
  REASON_LABELS,
  REASON_TAGS,
  type ReasonTag,
  shiftDate,
  STAT_LABELS,
  STRICTNESS_LABELS,
  STRICTNESS_RULES,
  useCommand,
} from '@/lib/data';

import styles from './quest-actions.module.css';

type Step = 'actions' | 'partial' | 'reschedule';

export interface QuestActions {
  open: (occurrence: QuestOccurrence) => void;
  overlays: ReactNode;
}

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
  const [step, setStep] = useState<Step>('actions');
  const [confirmation, setConfirmation] = useState<CommandConfirmation | null>(null);

  const close = (): void => {
    setOccurrence(null);
    setStep('actions');
  };

  const dispatch = (payload: Command, andClose = true): void => {
    command.mutate(payload, {
      onSuccess: result => {
        if (result.status === 'needs-confirmation') {
          setConfirmation(result);
          setOccurrence(null);
          return;
        }
        if (result.status === 'rejected') {
          toast.warning(result.message);
          return;
        }
        toast.neutral(result.message);
        if (andClose) close();
      },
    });
  };

  const overlays = (
    <>
      {occurrence && step === 'actions' ? (
        <ActionListOverlay
          occurrence={occurrence}
          onClose={close}
          onPartial={() => setStep('partial')}
          onReschedule={() => setStep('reschedule')}
          onEdit={() => {
            close();
            void navigate({ to: '/quests/$questId', params: { questId: occurrence.questId } });
          }}
          dispatch={dispatch}
        />
      ) : null}
      {occurrence && step === 'partial' ? <PartialOverlay occurrence={occurrence} onClose={close} dispatch={dispatch} /> : null}
      {occurrence && step === 'reschedule' ? <RescheduleOverlay occurrence={occurrence} onClose={close} dispatch={dispatch} /> : null}
      {confirmation ? (
        <RescheduleCapOverlay
          confirmation={confirmation}
          onClose={() => setConfirmation(null)}
          onConfirm={() => {
            dispatch(confirmation.command, false);
            setConfirmation(null);
          }}
        />
      ) : null}
    </>
  );

  return {
    open: next => {
      setStep('actions');
      setOccurrence(next);
    },
    overlays,
  };
}

interface OverlayProps {
  occurrence: QuestOccurrence;
  onClose: () => void;
  dispatch: (command: Command, andClose?: boolean) => void;
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
  onClose,
  onPartial,
  onReschedule,
  onEdit,
  dispatch,
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
      open
      onOpenChange={onClose}
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
              disabled={Boolean(action.disabledReason)}
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

function PartialOverlay({ occurrence, onClose, dispatch }: OverlayProps): ReactElement {
  const target = occurrence.partialTarget;
  const max = target?.target ?? 100;
  const unit = target?.unit ?? '%';
  const [progress, setProgress] = useState(Math.round(max / 2));
  const [reason, setReason] = useState<ReasonTag>('too_tired');
  const [note, setNote] = useState('');

  return (
    <OverlaySurface
      open
      onOpenChange={onClose}
      title={`Partial — ${occurrence.questName}`}
      description="A partial keeps the streak and grants XP for what you did. It is a real outcome, not a failure."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => dispatch({ type: 'quest.partial', occurrenceId: occurrence.id, progress, reasonTag: reason, note: note || undefined })}>
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

function RescheduleOverlay({ occurrence, onClose, dispatch }: OverlayProps): ReactElement {
  const [date, setDate] = useState(shiftDate(occurrence.date, 1));

  return (
    <OverlaySurface
      open
      onOpenChange={onClose}
      title={`Move ${occurrence.questName}`}
      description="A reschedule moves only this occurrence. The recurring plan is never rewritten."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep the plan
          </Button>
          <Button variant="primary" onClick={() => dispatch({ type: 'quest.reschedule', occurrenceId: occurrence.id, toDate: date })}>
            Move it
          </Button>
        </>
      }
    >
      <div className={styles.partialBody}>
        <DatePicker value={date} onValueChange={value => setDate(value ?? date)} min={occurrence.date} aria-label="Move to" />
        <DescriptionList layout="row" termWidth={150}>
          <DescriptionList.Item term="Streak">Kept — a move inside the cap does not break it</DescriptionList.Item>
          <DescriptionList.Item term="HP">Unchanged</DescriptionList.Item>
          <DescriptionList.Item term="Recurring plan">Untouched — only today’s occurrence moves</DescriptionList.Item>
        </DescriptionList>
      </div>
    </OverlaySurface>
  );
}

function RescheduleCapOverlay({ confirmation, onClose, onConfirm }: { confirmation: CommandConfirmation; onClose: () => void; onConfirm: () => void }): ReactElement {
  return (
    <OverlaySurface
      open
      onOpenChange={onClose}
      title={confirmation.title}
      description={confirmation.body}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {confirmation.cancelLabel}
          </Button>
          <Button variant="primary" onClick={onConfirm}>
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
