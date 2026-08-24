import { Link, useNavigate } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Badge, Button, Card, Progress, Skeleton, Spinner, Switch, Textarea, toast } from '@shadow-library/ui';

import { Screen, ScreenColumns, screenStyles } from '@/components/ScreenLayout';
import { type AiRequestState, type AiSuggestion, type CoachView, useCoach, useReflectCommand } from '@/lib/data';

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

export function AiScreen(): ReactElement {
  const coach = useCoach();

  return (
    <Screen
      title="Ask"
      subtitle="Ask one question about your own history and read the answer later the same day. There is no chat here, and nothing is read until you say it may be."
    >
      {coach.isPending || !coach.data ? <Skeleton.Card /> : null}

      {coach.data ? (
        <ScreenColumns
          aside={
            <>
              <Card padding="md">
                <h2 className={screenStyles.cardTitle}>Usage</h2>
                {coach.data.quota.limit === null ? (
                  <p className={screenStyles.cardBody}>
                    {coach.data.quota.used} requests this month on {coach.data.quota.planName}.
                  </p>
                ) : (
                  <>
                    <Progress value={coach.data.quota.used} max={coach.data.quota.limit} size="md" label="Requests used this month" />
                    <p className={screenStyles.cardBody}>
                      {coach.data.quota.used} of {coach.data.quota.limit} requests used on {coach.data.quota.planName}. The count resets on {coach.data.quota.resetsOn}.
                    </p>
                  </>
                )}
                <p className={screenStyles.cardBody}>{coach.data.quota.note}</p>
                <div className={styles.actions}>
                  <Button size="sm" variant="secondary" asChild>
                    <Link to="/settings/billing">See the plans</Link>
                  </Button>
                </div>
              </Card>

              {coach.data.history.length > 0 ? (
                <Card padding="md">
                  <h2 className={screenStyles.cardTitle}>Result history</h2>
                  <ul className={styles.history}>
                    {coach.data.history.map(entry => (
                      <li key={entry.id} className={styles.historyRow}>
                        <Badge variant="outline" size="sm">
                          {STATE_LABELS[entry.state]}
                        </Badge>
                        <span>
                          <span className={styles.historyTitle}>{entry.title}</span>
                          <span className={styles.historyWhen}>{entry.when}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}

              <Card padding="md">
                <h2 className={screenStyles.cardTitle}>Why it is not a chat</h2>
                <p className={screenStyles.cardBody}>
                  A question worth asking about a month of your own behaviour is not worth answering in two seconds. Requests queue, run in the background, and wait here when they
                  are done.
                </p>
              </Card>

              <Card padding="md">
                <h2 className={screenStyles.cardTitle}>If you are struggling</h2>
                <p className={screenStyles.cardBody}>
                  The coach reads patterns in logs and nothing more. It is not a therapist or a crisis service. If something heavier is going on, please reach a person — a local
                  helpline or someone you trust — rather than this screen.
                </p>
              </Card>
            </>
          }
        >
          {coach.data.consent.decided ? <Composer coach={coach.data} /> : <ConsentGate coach={coach.data} />}
        </ScreenColumns>
      ) : null}
    </Screen>
  );
}

function ConsentGate({ coach }: { coach: CoachView }): ReactElement {
  const command = useReflectCommand();
  const [journal, setJournal] = useState(coach.consent.journal);
  const [health, setHealth] = useState(coach.consent.health);

  return (
    <Card padding="lg">
      <h2 className={styles.headline}>Before the coach reads anything</h2>
      <p className={styles.lead}>
        Coaching is asynchronous: you ask a question, it is answered within a few hours, and the answer waits for you here. Your quests, planning and money are what it reads by
        default. The two below are separate decisions, each withdrawable on its own.
      </p>
      <div className={styles.consentRows}>
        <Switch
          checked={journal}
          onCheckedChange={setJournal}
          label="Journal reflections and reasons"
          description="The text you write when you reflect, and the reason you attach to a miss. Off by default."
        />
        <Switch
          checked={health}
          onCheckedChange={setHealth}
          label="Health data — a separate decision"
          description="Weight, sleep, steps, water and meals. Off by default and independent of the first. Withdrawing it excludes the data from future reads."
        />
      </div>
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => command.mutate({ type: 'ai.setConsent', consent: { journal, health } }, { onSuccess: result => toast.neutral(result.message) })}>
          Save and continue
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/settings">Read the data policy</Link>
        </Button>
      </div>
    </Card>
  );
}

function Composer({ coach }: { coach: CoachView }): ReactElement {
  const command = useReflectCommand();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);

  const quotaSpent = coach.quota.limit !== null && coach.quota.used >= coach.quota.limit;

  const submit = (): void => {
    command.mutate(
      { type: 'ai.submit', question },
      {
        onSuccess: result => {
          if (result.status === 'rejected') return setRefusal(result.message);
          setRefusal(null);
          setQuestion('');
          toast.neutral(result.message);
        },
      },
    );
  };

  const apply = (suggestion: AiSuggestion, resultId: string): void => {
    command.mutate(
      { type: 'ai.applySuggestion', resultId, suggestionIndex: suggestion.index },
      {
        onSuccess: result => {
          toast.neutral(result.message);
          if (result.status === 'applied') void navigate({ to: suggestion.to });
        },
      },
    );
  };

  return (
    <>
      <Card padding="lg">
        <div className={styles.composerHead}>
          <h2 className={styles.headline}>Ask a question</h2>
          <span className={styles.quotaLabel}>
            {coach.quota.limit === null ? 'A daily allowance on Coach' : `${Math.max(0, coach.quota.limit - coach.quota.used)} of ${coach.quota.limit} requests left this month`}
          </span>
        </div>
        <Textarea
          value={question}
          onValueChange={setQuestion}
          minRows={3}
          aria-label="Your question"
          placeholder="Why do Thursdays keep failing, and what would you change about next week?"
        />
        <div className={styles.actions}>
          <Button variant="primary" disabled={question.trim().length === 0 || quotaSpent} onClick={submit}>
            Submit request
          </Button>
          <Button variant="ghost" onClick={() => setQuestion('')}>
            Clear
          </Button>
          <span className={styles.scopeNote}>
            {quotaSpent
              ? `Both requests this month are used. The count resets on ${coach.quota.resetsOn}.`
              : 'What the coach may read is decided by your consents, not by this question.'}
          </span>
        </div>
        {refusal ? (
          <div className={styles.actions}>
            <p className={styles.lead}>{refusal}</p>
            <Button size="sm" variant="secondary" asChild>
              <Link to="/settings/billing">See the plans</Link>
            </Button>
          </div>
        ) : null}
      </Card>

      {coach.active ? (
        <Card padding="lg">
          <div className={styles.stateHead}>
            <Badge variant="soft" intent={STATE_INTENT[coach.active.state]}>
              {STATE_LABELS[coach.active.state]}
            </Badge>
            <span className={styles.stateWhen}>{coach.active.when}</span>
            {coach.active.state === 'processing' ? <Spinner size="sm" /> : null}
          </div>
          <h2 className={styles.headline}>{coach.active.question}</h2>
          <p className={styles.lead}>{coach.active.body}</p>
          <div className={styles.actions}>
            {coach.active.state === 'queued' ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => command.mutate({ type: 'ai.cancel', requestId: coach.active?.id ?? '' }, { onSuccess: result => toast.neutral(result.message) })}
              >
                Cancel the request
              </Button>
            ) : null}
            {coach.active.state === 'failed' ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => command.mutate({ type: 'ai.retry', requestId: coach.active?.id ?? '' }, { onSuccess: result => toast.neutral(result.message) })}
              >
                Ask it again
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {coach.latest ? (
        <Card padding="lg">
          <h2 className={styles.headline}>{coach.latest.title}</h2>
          <p className={styles.lead}>{coach.latest.meta}</p>
          <div className={styles.findings}>
            {coach.latest.findings.map(finding => (
              <div key={finding.heading}>
                <h3 className={styles.findingHeading}>{finding.heading}</h3>
                <p className={styles.findingBody}>{finding.body}</p>
              </div>
            ))}
          </div>
          {coach.latest.limitationNote ? <p className={styles.lead}>{coach.latest.limitationNote}</p> : null}
          <div className={styles.actions}>
            {coach.latest.suggestions.map(suggestion => (
              <Button key={suggestion.id} size="sm" variant="secondary" onClick={() => apply(suggestion, coach.latest?.id ?? '')}>
                {suggestion.label}
              </Button>
            ))}
          </div>
        </Card>
      ) : null}
    </>
  );
}
