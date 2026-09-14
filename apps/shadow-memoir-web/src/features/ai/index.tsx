import { Link, useNavigate } from '@tanstack/react-router';
import { type ReactElement, type ReactNode, type RefObject, useState } from 'react';
import { Alert, Badge, Button, Card, Progress, Skeleton, Spinner, Switch, Textarea } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { Screen, ScreenColumns, screenStyles, useRevealOnSelect } from '@/components/ScreenLayout';
import { type AiRequest, type AiRequestState, type AiResult, type AiSuggestion, type CoachView, notifyOutcome, useCoach, useReflectCommand } from '@/lib/data';
import { formatCount } from '@/lib/format';
import { useSyncReadiness } from '@/lib/sync';

import styles from './ai.module.css';

const STATE_INTENT: Record<AiRequestState, 'neutral' | 'info' | 'success' | 'warning'> = {
  queued: 'neutral',
  processing: 'info',
  ready: 'success',
  failed: 'warning',
  cancelled: 'neutral',
  held: 'warning',
};

const STATE_LABELS: Record<AiRequestState, string> = {
  queued: 'Queued',
  processing: 'Reading',
  ready: 'Ready',
  failed: 'Did not finish',
  cancelled: 'Cancelled',
  held: 'Held',
};

const HISTORY_PREVIEW = 5;

const QUESTION_PLACEHOLDER = 'Why do Thursdays keep failing, and what would you change about next week?';

interface Refusal {
  status: 'rejected' | 'failed';
  message: string;
  code: string | null;
}

export function AiScreen(): ReactElement {
  const readiness = useSyncReadiness();
  const deleting = readiness.kind === 'failed' && readiness.reason === 'deletion-pending';
  const coach = useCoach({ refresh: !deleting });

  return (
    <Screen
      title="Ask"
      subtitle="Ask one question about your own history and read the answer later the same day. There is no chat here, and nothing is read until you say it may be."
    >
      {deleting ? (
        <DeletionPendingAsk />
      ) : (
        <DataState query={coach} skeleton={<AskSkeleton />}>
          {data => <CoachLayout coach={data} />}
        </DataState>
      )}
    </Screen>
  );
}

function AskSkeleton(): ReactElement {
  return (
    <>
      <Skeleton.Card />
      <Skeleton.Card />
    </>
  );
}

function CoachLayout({ coach }: { coach: CoachView }): ReactElement {
  const [selectedResultId, setSelectedResultId] = useState('');
  const result = coach.results.find(candidate => candidate.id === selectedResultId) ?? coach.results[0] ?? null;
  const resultRef = useRevealOnSelect<HTMLDivElement>(selectedResultId, result !== null);

  return (
    <ScreenColumns
      aside={
        <>
          <UsageCard quota={coach.quota} />
          {coach.history.length > 0 ? <HistoryCard coach={coach} openResultId={result?.id ?? null} onOpen={setSelectedResultId} /> : null}
          <GuidanceCards />
        </>
      }
    >
      {coach.consent.decided ? (
        <>
          <Composer coach={coach} />
          {coach.active ? <ActiveRequestCard request={coach.active} /> : null}
          {result ? <ResultCard result={result} targetRef={resultRef} /> : null}
        </>
      ) : (
        <ConsentGate coach={coach} />
      )}
    </ScreenColumns>
  );
}

function DeletionPendingAsk(): ReactElement {
  const navigate = useNavigate();

  return (
    <ScreenColumns aside={<GuidanceCards />}>
      <Alert intent="warning" title="This account is being deleted" action={{ label: 'See deletion status', onClick: () => void navigate({ to: '/settings/delete' }) }}>
        The coach takes no new requests while Shadow Memoir erases this account, and nothing more is read.
      </Alert>
      <QuestionCard question="" meta="Unavailable while this account is being deleted" note="Requests can’t be queued for an account that is being deleted." disabled />
    </ScreenColumns>
  );
}

function UsageCard({ quota }: { quota: CoachView['quota'] }): ReactElement {
  return (
    <Card padding="md">
      <Card.Body>
        <h2 className={screenStyles.cardTitle}>Usage</h2>
        {quota.limit === null ? (
          <p className={screenStyles.cardBody}>
            {formatCount(quota.used, 'request', 'requests')} used today on {quota.planName}.
          </p>
        ) : (
          <>
            <Progress value={Math.min(quota.used, quota.limit)} max={quota.limit} size="md" label="Requests used this month" />
            <p className={screenStyles.cardBody}>
              {Math.min(quota.used, quota.limit)} of {formatCount(quota.limit, 'request', 'requests')} used on {quota.planName}. The count resets on {quota.resetsOn}.
            </p>
          </>
        )}
        <p className={screenStyles.cardBody}>{quota.note}</p>
        <div className={styles.actions}>
          <Button size="sm" variant="secondary" asChild>
            <Link to="/settings/billing">See the plans</Link>
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}

interface HistoryCardProps {
  coach: CoachView;
  openResultId: string | null;
  onOpen: (resultId: string) => void;
}

function HistoryCard({ coach, openResultId, onOpen }: HistoryCardProps): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const readable = new Set(coach.results.map(result => result.id));
  const entries = expanded ? coach.history : coach.history.slice(0, HISTORY_PREVIEW);

  return (
    <Card padding="md">
      <Card.Body>
        <h2 className={screenStyles.cardTitle}>Result history</h2>
        <ul className={styles.history}>
          {entries.map(entry => (
            <li key={entry.id} className={styles.historyRow}>
              <Badge variant="outline" size="sm">
                {STATE_LABELS[entry.state]}
              </Badge>
              <span className={styles.historyBody}>
                {entry.resultId && readable.has(entry.resultId) ? (
                  <button
                    type="button"
                    className={styles.historyOpen}
                    title={entry.title}
                    aria-current={entry.resultId === openResultId || undefined}
                    onClick={() => onOpen(entry.resultId ?? '')}
                  >
                    <span className={styles.historyTitle}>{entry.title}</span>
                  </button>
                ) : (
                  <span className={styles.historyTitle} title={entry.title}>
                    {entry.title}
                  </span>
                )}
                <span className={styles.historyWhen}>{entry.when}</span>
              </span>
            </li>
          ))}
        </ul>
        {coach.history.length > HISTORY_PREVIEW ? (
          <div className={styles.actions}>
            <Button size="sm" variant="ghost" aria-expanded={expanded} onClick={() => setExpanded(current => !current)}>
              {expanded ? `Show the latest ${HISTORY_PREVIEW}` : `Show all ${coach.history.length}`}
            </Button>
          </div>
        ) : null}
      </Card.Body>
    </Card>
  );
}

function GuidanceCards(): ReactElement {
  return (
    <>
      <Card padding="md">
        <Card.Body>
          <h2 className={screenStyles.cardTitle}>Why it is not a chat</h2>
          <p className={screenStyles.cardBody}>
            A question worth asking about a month of your own behaviour is not worth answering in two seconds. Requests queue, run in the background, and wait here when they are
            done.
          </p>
        </Card.Body>
      </Card>

      <Card padding="md">
        <Card.Body>
          <h2 className={screenStyles.cardTitle}>If you are struggling</h2>
          <p className={screenStyles.cardBody}>
            The coach reads patterns in logs and nothing more. It is not a therapist or a crisis service. If something heavier is going on, please reach a person — a local helpline
            or someone you trust — rather than this screen.
          </p>
        </Card.Body>
      </Card>
    </>
  );
}

function ConsentGate({ coach }: { coach: CoachView }): ReactElement {
  const command = useReflectCommand();
  const [journal, setJournal] = useState(coach.consent.journal);
  const [health, setHealth] = useState(coach.consent.health);

  const save = async (): Promise<void> => {
    const outcome = await command.run({ type: 'ai.setConsent', consent: { journal, health } });
    notifyOutcome(outcome, { success: outcome.status === 'applied' ? outcome.local.message : '', action: 'save your consents' });
  };

  return (
    <Card padding="lg">
      <Card.Body>
        <h2 className={styles.headline}>Before the coach reads anything</h2>
        <p className={styles.lead}>
          Coaching is asynchronous: you ask a question, it is answered within a few hours, and the answer waits for you here. Your quests, planning and money are what it reads by
          default. The two below are separate decisions, each withdrawable on its own.
        </p>
        <div className={styles.consentRows}>
          <Switch
            checked={journal}
            onCheckedChange={setJournal}
            disabled={command.isPending}
            label="Journal reflections and reasons"
            description="The text you write when you reflect, and the reason you attach to a miss. Off by default."
          />
          <Switch
            checked={health}
            onCheckedChange={setHealth}
            disabled={command.isPending}
            label="Health data — a separate decision"
            description="Weight, sleep, steps, water and meals. Off by default and independent of the first. Withdrawing it excludes the data from future reads."
          />
        </div>
        <div className={styles.actions}>
          <Button variant="primary" loading={command.isPending} loadingText="Saving…" onClick={() => void save()}>
            Save and continue
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/settings">Read the data policy</Link>
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}

interface QuestionCardProps {
  question: string;
  meta: string;
  note: string;
  disabled?: boolean;
  pending?: boolean;
  canSubmit?: boolean;
  onQuestionChange?: (question: string) => void;
  onSubmit?: () => void;
  children?: ReactNode;
}

function QuestionCard({ question, meta, note, disabled = false, pending = false, canSubmit = false, onQuestionChange, onSubmit, children }: QuestionCardProps): ReactElement {
  return (
    <Card padding="lg">
      <Card.Body>
        <div className={styles.composerHead}>
          <h2 className={styles.headline}>Ask a question</h2>
          <span className={styles.quotaLabel}>{meta}</span>
        </div>
        <Textarea value={question} onValueChange={onQuestionChange} minRows={3} aria-label="Your question" placeholder={QUESTION_PLACEHOLDER} disabled={disabled || pending} />
        <div className={styles.actions}>
          <Button variant="primary" loading={pending} loadingText="Queuing…" disabled={disabled || !canSubmit} onClick={onSubmit}>
            Submit request
          </Button>
          <Button variant="ghost" disabled={disabled || pending || question.length === 0} onClick={() => onQuestionChange?.('')}>
            Clear
          </Button>
          <span className={styles.scopeNote}>{note}</span>
        </div>
        {children}
      </Card.Body>
    </Card>
  );
}

function Composer({ coach }: { coach: CoachView }): ReactElement {
  const command = useReflectCommand();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const { quota } = coach;
  const quotaSpent = quota.limit !== null && quota.used >= quota.limit;
  const pending = command.isPendingFor(item => item.type === 'ai.submit');
  const meta =
    quota.limit === null
      ? `${formatCount(quota.used, 'request', 'requests')} used today on Coach`
      : `${Math.max(0, quota.limit - quota.used)} of ${quota.limit} requests left this month`;
  const note =
    quotaSpent && !refusal
      ? `Both requests this month are used. The count resets on ${quota.resetsOn}.`
      : 'What the coach may read is decided by your consents, not by this question.';

  const submit = async (): Promise<void> => {
    const outcome = await command.run({ type: 'ai.submit', question });
    if (outcome.status === 'applied') {
      setRefusal(null);
      setQuestion('');
      notifyOutcome(outcome, { success: outcome.local.message, action: 'queue the request' });
      return;
    }
    if (outcome.status === 'rejected' || outcome.status === 'failed') {
      setRefusal({ status: outcome.status, message: outcome.message, code: outcome.code });
      return;
    }
    notifyOutcome(outcome, { success: '', action: 'queue the request' });
  };

  return (
    <QuestionCard
      question={question}
      meta={meta}
      note={note}
      pending={pending}
      canSubmit={question.trim().length > 0 && !quotaSpent}
      onQuestionChange={setQuestion}
      onSubmit={() => void submit()}
    >
      {refusal ? (
        <Alert
          className={styles.refusal}
          intent={refusal.status === 'failed' ? 'danger' : 'warning'}
          action={refusal.code === 'AI_001' ? { label: 'See the plans', onClick: () => void navigate({ to: '/settings/billing' }) } : undefined}
        >
          {refusal.message}
        </Alert>
      ) : null}
    </QuestionCard>
  );
}

function ActiveRequestCard({ request }: { request: AiRequest }): ReactElement {
  const command = useReflectCommand();

  const act = async (type: 'ai.cancel' | 'ai.retry', action: string): Promise<void> => {
    const outcome = await command.run({ type, requestId: request.id });
    notifyOutcome(outcome, { success: outcome.status === 'applied' ? outcome.local.message : '', action });
  };

  return (
    <Card padding="lg">
      <Card.Body>
        <div className={styles.stateHead}>
          <Badge variant="soft" intent={STATE_INTENT[request.state]}>
            {STATE_LABELS[request.state]}
          </Badge>
          <span className={styles.stateWhen}>{request.when}</span>
          {request.state === 'processing' ? <Spinner size="sm" /> : null}
        </div>
        <h2 className={styles.headline}>{request.question}</h2>
        <p className={styles.lead}>{request.body}</p>
        <div className={styles.actions}>
          {request.state === 'queued' ? (
            <Button
              size="sm"
              variant="ghost"
              loading={command.isPendingFor({ type: 'ai.cancel', requestId: request.id })}
              loadingText="Cancelling…"
              onClick={() => void act('ai.cancel', 'cancel the request')}
            >
              Cancel the request
            </Button>
          ) : null}
          {request.state === 'failed' ? (
            <Button
              size="sm"
              variant="primary"
              loading={command.isPendingFor({ type: 'ai.retry', requestId: request.id })}
              loadingText="Queuing…"
              onClick={() => void act('ai.retry', 'ask again')}
            >
              Ask it again
            </Button>
          ) : null}
          {request.state === 'held' ? (
            <Button size="sm" variant="secondary" asChild>
              <Link to="/settings/billing">See the plans</Link>
            </Button>
          ) : null}
        </div>
      </Card.Body>
    </Card>
  );
}

function ResultCard({ result, targetRef }: { result: AiResult; targetRef: RefObject<HTMLDivElement | null> }): ReactElement {
  const command = useReflectCommand();
  const navigate = useNavigate();

  const open = async (suggestion: AiSuggestion): Promise<void> => {
    const outcome = await command.run({ type: 'ai.applySuggestion', resultId: result.id, suggestionIndex: suggestion.index });
    notifyOutcome(outcome, { success: outcome.status === 'applied' ? outcome.local.message : '', action: 'open the suggestion' });
    if (outcome.status === 'applied') void navigate({ to: suggestion.to });
  };

  return (
    <Card padding="lg">
      <Card.Body>
        <div ref={targetRef} tabIndex={-1} className={screenStyles.revealTarget}>
          <h2 className={styles.headline}>{result.title}</h2>
          <p className={styles.lead}>{result.meta}</p>
        </div>
        <div className={styles.findings}>
          {result.findings.map(finding => (
            <div key={finding.heading}>
              <h3 className={styles.findingHeading}>{finding.heading}</h3>
              <p className={styles.findingBody}>{finding.body}</p>
            </div>
          ))}
        </div>
        {result.limitationNote ? (
          <p className={styles.limitation}>
            <span className={styles.limitationLabel}>What this answer could not see</span>
            {result.limitationNote}
          </p>
        ) : null}
        {result.suggestions.length > 0 ? (
          <div className={styles.suggestionBlock}>
            <h3 className={styles.findingHeading}>Suggestions</h3>
            <p className={styles.scopeNote}>Opening one records that you looked at it. The quest only changes when you edit it yourself.</p>
            <ul className={styles.suggestions}>
              {result.suggestions.map(suggestion => (
                <li key={suggestion.id} className={styles.suggestion}>
                  <p className={styles.suggestionText}>{suggestion.label}</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={command.isPendingFor({ type: 'ai.applySuggestion', resultId: result.id, suggestionIndex: suggestion.index })}
                    onClick={() => void open(suggestion)}
                  >
                    Open the quest
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card.Body>
    </Card>
  );
}
