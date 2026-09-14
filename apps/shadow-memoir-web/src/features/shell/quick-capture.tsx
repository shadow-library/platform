import { Link, useNavigate } from '@tanstack/react-router';
import { type KeyboardEvent, type ReactElement, type ReactNode, type RefObject, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Input, Kbd, useMediaQuery } from '@shadow-library/ui';

import { OverlaySurface } from '@/components/OverlaySurface';
import { AiIcon, LogIcon, MoneyIcon, PlanIcon, QuestIcon, TodayIcon } from '@/components/icons';
import {
  CAPTURE_SLEEP_MAX_HOURS,
  CAPTURE_WATER_MAX_LITRES,
  type CaptureAction,
  type CaptureChoice,
  type CaptureDraft,
  type CaptureHealth,
  type CaptureKind,
  type CaptureMoney,
  type CaptureOccurrence,
  type CaptureProblem,
  captureQuestQuery,
  type CaptureReadingSource,
  type CaptureWeight,
  type HealthView,
  notifyOutcome,
  type OutcomeToast,
  outcomeToast,
  parseCapture,
  type SettledOutcome,
  STATE_LABELS,
  todayISODate,
  useCommand,
  useDay,
  useFinanceCommand,
  useFinanceSummary,
  useHealth,
  useOccurrenceSearch,
  useQuickLogCommand,
  useWeight,
  WEIGHT_RANGE_KG,
  type WeightEntry,
  type WeightView,
} from '@/lib/data';
import { type DataReadiness, useDataReadiness, useSyncReadiness } from '@/lib/sync';

import styles from './quick-capture.module.css';

export interface QuickCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Destination {
  to: string;
  label: string;
  icon: ReactElement;
  keywords: string[];
}

type CaptureOutcome = SettledOutcome<{ message: string }> | { status: 'needs-confirmation'; existingWeight: WeightEntry | null };

interface Rejection {
  line: string;
  notice: OutcomeToast;
}

const DESTINATIONS: Destination[] = [
  { to: '/', label: 'Today', icon: <TodayIcon size={16} />, keywords: ['day', 'quests'] },
  { to: '/plan', label: 'Planning Board', icon: <PlanIcon size={16} />, keywords: ['week', 'calendar', 'schedule'] },
  { to: '/quests', label: 'Quests', icon: <QuestIcon size={16} />, keywords: ['library'] },
  { to: '/quests/new', label: 'New quest', icon: <QuestIcon size={16} />, keywords: ['create', 'add'] },
  { to: '/log', label: 'Quick log', icon: <LogIcon size={16} />, keywords: ['journal', 'meal', 'weight', 'steps', 'water', 'sleep'] },
  { to: '/finance', label: 'Money', icon: <MoneyIcon size={16} />, keywords: ['expense', 'spend', 'receipt', 'subscription'] },
  { to: '/ai', label: 'Ask', icon: <AiIcon size={16} />, keywords: ['coach', 'insight'] },
];

const SUBJECT_MAX_CHARS = 40;

const IME_COMPOSITION_KEY_CODE = 229;

const DAY_ROLLOVER_MARGIN_MS = 1_000;

const NEW_DAY_NOTICE = 'It’s a new day, so this line now saves to today. Check it and save again.';

function msUntilNextLocalDay(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + DAY_ROLLOVER_MARGIN_MS;
}

function subjectOf(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > SUBJECT_MAX_CHARS ? `${trimmed.slice(0, SUBJECT_MAX_CHARS)}…` : trimmed;
}

/** The command hooks live here rather than in the body: closing the palette unmounts the body, and a save must keep settling (and keep blocking a second save) after it does. */
export function QuickCapture({ open, onOpenChange }: QuickCaptureProps): ReactElement {
  const [text, setText] = useState('');
  const [replacing, setReplacing] = useState<WeightEntry | null>(null);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const shownText = useRef(text);
  const field = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const isTouchLayout = useMediaQuery('(max-width: 639px)');
  const questCommand = useCommand();
  const financeCommand = useFinanceCommand();
  const quickLogCommand = useQuickLogCommand();
  const pending = questCommand.isPending || financeCommand.isPending || quickLogCommand.isPending;

  useEffect(() => {
    shownText.current = text;
  }, [text]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      onOpenChange(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenChange]);

  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setText('');
      setReplacing(null);
      setRejection(null);
    }
  }

  useEffect(() => {
    if (!open || !isTouchLayout) return;
    // BottomSheet has no onOpenAutoFocus hook; deferred a tick past Radix's own mount autofocus
    // (the grabber), which otherwise wins the input back even when this effect runs after it.
    const timer = setTimeout(() => field.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open, isTouchLayout]);

  const runAction = async (action: CaptureAction): Promise<CaptureOutcome> => {
    if (action.domain === 'finance') return financeCommand.run(action.command);
    if (action.domain === 'quest') {
      const outcome = await questCommand.run(action.command);
      return outcome.status === 'needs-confirmation' ? { status: 'needs-confirmation', existingWeight: null } : outcome;
    }
    const outcome = await quickLogCommand.run(action.command);
    return outcome.status === 'needs-confirmation' ? { status: 'needs-confirmation', existingWeight: outcome.confirmation.needsConfirmation?.existing ?? null } : outcome;
  };

  const commit = async (draft: CaptureDraft, line: string): Promise<void> => {
    if (saving.current) return;
    saving.current = true;
    setRejection(null);
    try {
      const outcome = await runAction(draft.action);
      if (outcome.status === 'needs-confirmation') return setReplacing(outcome.existingWeight);
      const saved = outcome.status === 'applied' || outcome.status === 'queued-offline';
      const feedback = { success: saved ? outcome.local.message : '', action: 'save', subject: subjectOf(line) };
      const stillShown = shownText.current === line;
      const notice = outcomeToast(outcome, feedback);
      // At phone width a toast sits over the field the owner has to fix, so a line still in the palette hears about it there.
      if (!saved && stillShown && notice) return setRejection({ line, notice });
      notifyOutcome(outcome, feedback);
      if (!saved || !stillShown) return;
      setText('');
      onOpenChange(false);
    } finally {
      saving.current = false;
    }
  };

  return (
    <OverlaySurface
      open={open}
      onOpenChange={onOpenChange}
      title="Quick capture"
      size="md"
      sheetSnapPoints={['half', 'full']}
      sheetDefaultSnap="full"
      onOpenAutoFocus={event => {
        event.preventDefault();
        field.current?.focus();
      }}
      footer={
        isTouchLayout ? (
          <Button variant="ghost" fullWidth onClick={() => onOpenChange(false)}>
            Close
          </Button>
        ) : undefined
      }
    >
      <CaptureBody
        text={text}
        onTextChange={setText}
        field={field}
        pending={pending}
        replacing={replacing}
        rejection={rejection?.line === text ? rejection.notice : null}
        onCommit={draft => void commit(draft, text)}
        onClose={() => onOpenChange(false)}
      />
    </OverlaySurface>
  );
}

interface CaptureBodyProps {
  text: string;
  onTextChange: (text: string) => void;
  field: RefObject<HTMLInputElement | null>;
  pending: boolean;
  /** Today's weight as the save itself reported it, for when the weight read had not caught up yet. */
  replacing: WeightEntry | null;
  rejection: OutcomeToast | null;
  onCommit: (draft: CaptureDraft) => void;
  onClose: () => void;
}

const WAITING_COPY = { weight: 'Checking today’s weight…', health: 'Checking what’s already logged today…' } as const;

function CaptureBody({ text, onTextChange, field, pending, replacing, rejection, onCommit, onClose }: CaptureBodyProps): ReactElement {
  const navigate = useNavigate();
  const [clock, setClock] = useState(() => ({ today: todayISODate(), tick: 0 }));
  const [dayChangedFor, setDayChangedFor] = useState<string | null>(null);
  const today = clock.today;
  const summary = useFinanceSummary();
  const moneyReady = useDataReadiness({ query: summary }).readiness.kind === 'ready';
  const weight = useWeight();
  const health = useHealth(today);
  const healthReadiness = useDataReadiness({ query: health });
  const syncReady = useSyncReadiness().kind === 'ready';
  const day = useDay(today);
  const occurrences = useOccurrenceSearch(captureQuestQuery(text), today);
  const [notice, setNotice] = useState<{ text: string; message: string } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const candidates = useRef<HTMLDivElement>(null);
  const questionId = useId();

  // The engine's `today` is fixed at start, so this reads the device clock: `tick` re-arms a timer that fired early, and the save re-checks for a device that slept through it.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = todayISODate();
      if (next !== clock.today && text.trim() !== '') {
        setDayChangedFor(text);
        setNotice({ text, message: NEW_DAY_NOTICE });
      }
      setClock(current => ({ today: next, tick: current.tick + 1 }));
    }, msUntilNextLocalDay());
    return () => clearTimeout(timer);
  }, [clock, text]);

  const money = useMemo<CaptureMoney | null>(() => {
    if (!moneyReady || !summary.data) return null;
    const { settings, categories } = summary.data;
    return { homeCurrency: settings.homeCurrency, currencies: settings.currencies, categories };
  }, [moneyReady, summary.data]);

  const captureOccurrences = useMemo<CaptureOccurrence[]>(() => {
    const states = new Map(day.data?.occurrences.map(occurrence => [occurrence.id, occurrence.state]));
    return (occurrences.data ?? []).map(target => ({ ...target, state: states.get(target.occurrenceId) ?? 'upcoming' }));
  }, [occurrences.data, day.data]);

  const weightFailed = weight.isError;
  const healthReadinessKind = healthReadiness.readiness.kind;
  const parse = useMemo(() => {
    const captureWeight = captureWeightOf(weightFailed, weight.data, [weight.data?.today, replacing].find(entry => entry?.date === today) ?? null);
    const captureHealth = captureHealthOf(syncReady, healthReadinessKind, health.data);
    return parseCapture(text, { date: today, money, occurrences: captureOccurrences, weight: captureWeight, health: captureHealth });
  }, [text, today, money, captureOccurrences, weight.data, weightFailed, syncReady, healthReadinessKind, health.data, replacing]);

  const retryReading = (on: CaptureReadingSource): void => {
    if (on === 'health') return healthReadiness.retry();
    void weight.refetch();
  };

  const query = text.trim().toLowerCase();
  const destinations = DESTINATIONS.filter(item => query.length === 0 || item.label.toLowerCase().includes(query) || item.keywords.some(keyword => keyword.includes(query)));
  const shownNotice = notice?.text === text ? notice.message : null;

  const save = (draft: CaptureDraft): void => {
    const liveToday = todayISODate();
    if (liveToday !== today || dayChangedFor === text) {
      setClock(current => ({ today: liveToday, tick: current.tick + 1 }));
      setDayChangedFor(null);
      return setNotice({ text, message: NEW_DAY_NOTICE });
    }
    if (occurrences.isLoading || day.isLoading) return setNotice({ text, message: 'Still checking today’s quests. Try again in a moment.' });
    onCommit(draft);
  };

  const go = (destination: Destination): void => {
    onClose();
    void navigate({ to: destination.to });
  };

  const submit = (): void => {
    if (parse.status === 'waiting') return;
    if (parse.status === 'ambiguous') return candidates.current?.querySelector<HTMLButtonElement>('[data-capture-option]:not(:disabled)')?.focus();
    const [first] = destinations;
    const navigationIntended = parse.status === 'draft' && parse.draft.kind === 'journal' && first !== undefined;
    if (parse.status === 'draft' && !navigationIntended) return save(parse.draft);
    if (first) go(first);
  };

  const moveFocus = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const options = Array.from(body.current?.querySelectorAll<HTMLButtonElement>('[data-capture-option]:not(:disabled)') ?? []);
    const stops: HTMLElement[] = field.current ? [field.current, ...options] : options;
    const index = stops.findIndex(stop => stop === document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    const next = event.key === 'ArrowDown' ? Math.min(index + 1, stops.length - 1) : Math.max(index - 1, 0);
    stops[next]?.focus();
  };

  const onFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return moveFocus(event);
    if (event.nativeEvent.isComposing || event.keyCode === IME_COMPOSITION_KEY_CODE) return;
    event.preventDefault();
    submit();
  };

  return (
    <div className={styles.body} ref={body}>
      <Input
        value={text}
        onValueChange={onTextChange}
        onKeyDown={onFieldKeyDown}
        placeholder="coffee 4.20 · 8000 steps · 78.4 kg"
        aria-label="Log something, or jump to a screen"
        ref={field}
        clearable
      />

      {rejection ? (
        <Alert intent={rejection.intent === 'danger' ? 'danger' : 'warning'} title={rejection.title}>
          {rejection.body}
        </Alert>
      ) : null}

      {shownNotice ? (
        <p className={styles.message} role="status">
          {shownNotice}
        </p>
      ) : null}

      {parse.status === 'draft' ? <ParseBand draft={parse.draft} pending={pending} onCommit={save} /> : null}

      {parse.status === 'waiting' ? (
        <p className={styles.message} role="status">
          {WAITING_COPY[parse.on]}
        </p>
      ) : null}

      {parse.status === 'ambiguous' ? (
        <div className={styles.candidates} ref={candidates} role="group" aria-labelledby={questionId}>
          <p className={styles.message} id={questionId} role="status">
            {parse.question}
          </p>
          {parse.choices.map(choice => {
            const { kind, kindLabel, summary } = describeChoice(choice);
            const unavailable = choice.status === 'unavailable';
            return (
              <button
                key={`${kind}:${summary}`}
                type="button"
                className={styles.candidate}
                data-capture-option
                disabled={pending}
                aria-disabled={unavailable || undefined}
                onKeyDown={moveFocus}
                onClick={() => choice.status === 'available' && save(choice.draft)}
              >
                <Badge variant="outline" size="sm">
                  {kindLabel}
                </Badge>
                <span className={styles.candidateText}>{summary}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {parse.status === 'unrecognised' ? <ProblemMessage problem={parse.problem} query={captureQuestQuery(text)} onNavigate={onClose} onRetry={retryReading} /> : null}

      {destinations.length === 0 ? null : (
        <div>
          <p className={styles.sectionLabel}>Go to</p>
          <ul className={styles.destinations}>
            {destinations.map(item => (
              <li key={item.to}>
                <button type="button" className={styles.destination} data-capture-option onKeyDown={moveFocus} onClick={() => go(item)}>
                  <span className={styles.destinationIcon}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className={styles.footerHint}>
        <Kbd>Enter</Kbd> saves, or opens the first screen. <Kbd>↑</Kbd> <Kbd>↓</Kbd> move through the list. <Kbd>Esc</Kbd> closes this. <Kbd keys="mod+K" /> reopens it from
        anywhere.
      </p>
    </div>
  );
}

function describeChoice(choice: CaptureChoice): { kind: CaptureKind; kindLabel: string; summary: string } {
  if (choice.status === 'unavailable') return choice;
  const { kind, kindLabel, fields } = choice.draft;
  return { kind, kindLabel, summary: fields.map(item => item.value).join(' · ') };
}

function captureWeightOf(failed: boolean, view: WeightView | undefined, today: WeightEntry | null): CaptureWeight {
  if (view !== undefined) return { status: 'known', today };
  return failed ? { status: 'failed' } : { status: 'loading' };
}

function captureHealthOf(syncReady: boolean, readiness: DataReadiness['kind'], view: HealthView | undefined): CaptureHealth {
  if (!syncReady) return { status: 'unavailable' };
  if (readiness === 'failed') return { status: 'failed' };
  if (readiness === 'loading' || view === undefined) return { status: 'loading' };
  return { status: 'known', today: view.metrics.flatMap(metric => metric.entry ?? []) };
}

const READING_NAMES: Record<CaptureReadingSource, string> = { weight: 'weight', health: 'health log' };

interface ProblemMessageProps {
  problem: CaptureProblem;
  query: string;
  onNavigate: () => void;
  onRetry: (on: CaptureReadingSource) => void;
}

function ProblemMessage({ problem, query, onNavigate, onRetry }: ProblemMessageProps): ReactElement {
  const link = (to: string, label: string): ReactNode => (
    <Link to={to} onClick={onNavigate}>
      {label}
    </Link>
  );

  const message = (children: ReactNode): ReactElement => (
    <p className={styles.message} role="status">
      {children}
    </p>
  );

  switch (problem.kind) {
    case 'quest-resolved':
      return message(
        <>
          “{problem.questName}” is already {problem.state === 'completed' ? 'completed' : `recorded as ${STATE_LABELS[problem.state].toLowerCase()}`} today, so nothing is saved. To
          change it, open it on {link('/', 'Today')}.
        </>,
      );
    case 'no-quest':
      return message(
        <>
          Nothing scheduled today is called “{query}”. Check the name on {link('/', 'Today')} or in {link('/quests', 'Quests')}.
        </>,
      );
    case 'weight-out-of-range':
      return message(
        <>
          A weight has to be between {WEIGHT_RANGE_KG.min} and {WEIGHT_RANGE_KG.max} kg, so nothing is saved from this line. Log it on {link('/log/weight', 'Weight')}.
        </>,
      );
    case 'water-out-of-range':
      return message(
        <>
          Water is saved in whole millilitres, up to {CAPTURE_WATER_MAX_LITRES} litres, so nothing is saved from this line. Log it on {link('/log/health', 'Health')}.
        </>,
      );
    case 'health-unavailable':
      return message(<>Today’s health log hasn’t loaded on this device yet, so this line can’t be saved. Try again in a moment, or log it on {link('/log/health', 'Health')}.</>);
    case 'reading-failed':
      return (
        <div className={styles.retry}>
          {message(<>Today’s {READING_NAMES[problem.on]} couldn’t be read on this device, so this line isn’t saved.</>)}
          <Button size="sm" variant="secondary" onClick={() => onRetry(problem.on)}>
            Try again
          </Button>
        </div>
      );
    case 'sleep-out-of-range':
      return message(
        <>
          Sleep can be at most {CAPTURE_SLEEP_MAX_HOURS} hours, so nothing is saved from this line. Log it on {link('/log/health', 'Health')}.
        </>,
      );
    case 'money-unavailable':
      return message(
        <>
          Your Money settings haven’t loaded on this device yet, so this amount can’t be saved in the right currency. Try again in a moment, or add it in{' '}
          {link('/finance', 'Money')}.
        </>,
      );
    case 'currency-not-enabled':
      return message(
        <>
          {problem.symbol} isn’t one of the currencies on this account, so nothing is saved from this line. Type the amount without the symbol to log it in {problem.homeCurrency}.
        </>,
      );
  }
}

function ParseBand({ draft, pending, onCommit }: { draft: CaptureDraft; pending: boolean; onCommit: (draft: CaptureDraft) => void }): ReactElement {
  return (
    <div className={styles.parse}>
      <div className={styles.parseHead}>
        <Badge variant="soft" intent="info">
          {draft.kindLabel}
        </Badge>
        <span className={styles.parseHint} role="status">
          {draft.hint}
        </span>
      </div>
      <div className={styles.parseFields}>
        {draft.fields.map(item => (
          <div key={item.label} className={styles.field}>
            <p className={styles.fieldLabel}>{item.label}</p>
            <p className={styles.fieldValue} data-mono={item.mono === true}>
              {item.value}
            </p>
            {item.guessed ? <p className={styles.fieldGuess}>assumed</p> : null}
          </div>
        ))}
      </div>
      {draft.warning ? <p className={styles.parseWarning}>{draft.warning}</p> : null}
      <div className={styles.parseActions}>
        <Button size="sm" variant="primary" loading={pending} loadingText="Saving…" disabled={pending} onClick={() => onCommit(draft)}>
          Save
        </Button>
      </div>
    </div>
  );
}
