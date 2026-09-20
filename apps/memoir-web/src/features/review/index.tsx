import { Link } from '@tanstack/react-router';
import { type ReactElement, useRef, useState } from 'react';
import { Alert, Button, Card, EmptyState, FormField, Skeleton, Statistic, Textarea } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { Screen, ScreenColumns, screenStyles } from '@/components/ScreenLayout';
import { failureCopy, notifyOutcome, type ReflectCommandHook, type ReviewPrompt, type ReviewStepId, type ReviewView, useReflectCommand, useReview } from '@/lib/data';

import styles from './review.module.css';

const STEPS: { id: ReviewStepId; label: string }[] = [
  { id: 'kept', label: 'Kept' },
  { id: 'money', label: 'Money' },
  { id: 'body', label: 'Body' },
  { id: 'reflect', label: 'Reflect' },
  { id: 'done', label: 'Done' },
];

const REFLECT_INDEX = STEPS.length - 2;
const DONE_INDEX = STEPS.length - 1;

const OUTCOME_LEGEND: { outcome: 'kept' | 'partial' | 'missed' | 'none'; label: string }[] = [
  { outcome: 'kept', label: 'Kept' },
  { outcome: 'partial', label: 'Partial' },
  { outcome: 'missed', label: 'Missed' },
  { outcome: 'none', label: 'Not scheduled' },
];

export function WeeklyReviewScreen(): ReactElement {
  return (
    <Screen title="Weekly Review" subtitle="A restrained look back at the week, in five short steps. Every prompt in it is optional.">
      {/* No `query`: gating this on `review` would remount the wizard on the owner's own answer, per the flash in follow-ups/P1-21 — P2-18 owns the real fix. */}
      <DataState skeleton={<Skeleton.Card />}>
        <ReviewWizard />
      </DataState>
    </Screen>
  );
}

function ReviewWizard(): ReactElement {
  const review = useReview();
  const command = useReflectCommand();
  const [index, setIndex] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [initialized, setInitialized] = useState(false);

  if (!initialized && review.data) {
    setInitialized(true);
    if (review.data.completion) {
      setIndex(DONE_INDEX);
      setFurthest(DONE_INDEX);
    }
  }

  if (!review.data) {
    if (review.isError)
      return <EmptyState size="page" title="Couldn't load this right now" description="Try again." action={{ label: 'Try again', onClick: () => void review.refetch() }} />;
    return <Skeleton.Card />;
  }
  const data = review.data;
  const step = STEPS[index] as (typeof STEPS)[number];

  const goTo = (next: number): void => {
    setIndex(next);
    setFurthest(current => Math.max(current, next));
  };

  const finish = async (): Promise<void> => {
    const outcome = await command.run({ type: 'review.complete' }).catch(() => null);
    if (!outcome) return notifyOutcome({ status: 'failed', message: failureCopy(null), code: null, undone: false }, { action: 'finish', subject: 'the review', success: '' });
    if (outcome.status !== 'applied' && outcome.status !== 'queued-offline') return notifyOutcome(outcome, { action: 'finish', subject: 'the review', success: '' });
    goTo(DONE_INDEX);
  };

  const advance = (): void => {
    if (index === REFLECT_INDEX && !data.completion) {
      void finish();
      return;
    }
    goTo(Math.min(DONE_INDEX, index + 1));
  };

  const finishing = index === REFLECT_INDEX && !data.completion && command.isPendingFor(pending => pending.type === 'review.complete');

  return (
    <ScreenColumns
      aside={
        <>
          <Card padding="md">
            <Card.Body>
              <h2 className={screenStyles.cardTitle}>Week at a glance</h2>
              <ul className={screenStyles.list}>
                {data.glance.map(line => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Card.Body>
          </Card>
          <Card padding="md">
            <Card.Body>
              <h2 className={screenStyles.cardTitle}>Carried into planning</h2>
              <p className={screenStyles.cardBody}>{data.carried}</p>
              <div className={styles.doneActions}>
                <Button size="sm" variant="secondary" asChild>
                  <Link to="/plan">Open the board</Link>
                </Button>
              </div>
            </Card.Body>
          </Card>
        </>
      }
    >
      <Card padding="md">
        <Card.Body>
          <div className={styles.stepBar}>
            <div>
              <p className={styles.headline}>{data.weekLabel}</p>
              <p className={styles.stepMeta}>
                {step.id === 'done' ? (data.completion ? 'Completed' : 'Not finished yet') : `Step ${index + 1} of ${STEPS.length} · about four minutes`}
              </p>
            </div>
            <div className={styles.stepActions}>
              <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => setIndex(current => Math.max(0, current - 1))}>
                Back
              </Button>
              {step.id === 'done' ? (
                data.completion ? (
                  <Button size="sm" variant="primary" asChild>
                    <Link to="/plan">Plan next week</Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => goTo(REFLECT_INDEX)}>
                    Back to reflection
                  </Button>
                )
              ) : (
                <Button size="sm" variant="primary" onClick={advance} loading={finishing}>
                  {index === REFLECT_INDEX && !data.completion ? 'Finish the review' : 'Continue'}
                </Button>
              )}
            </div>
          </div>
          <div className={styles.steps} role="group" aria-label="Review steps">
            {STEPS.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                className={styles.step}
                data-reached={itemIndex <= furthest}
                aria-current={itemIndex === index ? 'step' : undefined}
                onClick={() => setIndex(itemIndex)}
              >
                <span className={styles.stepRule} aria-hidden />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </Card.Body>
      </Card>

      {step.id === 'kept' ? <KeptStep review={data} /> : null}
      {step.id === 'money' ? <FactsStep title="Money" headline={data.moneyHeadline} facts={data.moneyFacts} note={data.moneyNote} /> : null}
      {step.id === 'body' ? <BodyStep review={data} /> : null}
      {step.id === 'reflect' ? <ReflectStep review={data} /> : null}
      {step.id === 'done' ? <DoneStep review={data} onBackToReflection={() => goTo(REFLECT_INDEX)} /> : null}
    </ScreenColumns>
  );
}

function KeptStep({ review }: { review: ReviewView }): ReactElement {
  return (
    <Card padding="lg">
      <Card.Body>
        <h2 className={styles.headline}>What you kept</h2>
        <p className={styles.lead}>{review.keptHeadline}</p>
        <ul className={styles.legend}>
          {OUTCOME_LEGEND.map(item => (
            <li key={item.outcome}>
              <span className={styles.legendSwatch} data-outcome={item.outcome} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
        <ul className={styles.questRows}>
          {review.quests.map(quest => (
            <li key={quest.id}>
              <div className={styles.questHead}>
                <span className={styles.questTitle}>{quest.title}</span>
                <span className={styles.questResult}>{quest.result}</span>
              </div>
              <div className={styles.days} role="img" aria-label={`${quest.title}: ${quest.result} across the week`}>
                {quest.days.map((outcome, dayIndex) => (
                  <span key={dayIndex} className={styles.day} data-outcome={outcome} />
                ))}
              </div>
            </li>
          ))}
        </ul>
        <p className={screenStyles.cardBody}>{review.keptPattern}</p>
      </Card.Body>
    </Card>
  );
}

function FactsStep({ title, headline, facts, note }: { title: string; headline: string; facts: ReviewView['moneyFacts']; note: string }): ReactElement {
  return (
    <Card padding="lg">
      <Card.Body>
        <h2 className={styles.headline}>{title}</h2>
        <p className={styles.lead}>{headline}</p>
        <div className={styles.facts}>
          {facts.map(fact => (
            <Statistic key={fact.label} label={fact.label} value={fact.value} unit={fact.unit} comparison={fact.comparison} format={fact.format} size="sm" />
          ))}
        </div>
        <p className={screenStyles.cardBody}>{note}</p>
      </Card.Body>
    </Card>
  );
}

function BodyStep({ review }: { review: ReviewView }): ReactElement {
  return (
    <Card padding="lg">
      <Card.Body>
        <h2 className={styles.headline}>Body</h2>
        <p className={styles.lead}>{review.bodyHeadline}</p>
        <div className={styles.facts}>
          {review.bodyFacts.map(fact => (
            <Statistic key={fact.label} label={fact.label} value={fact.value} unit={fact.unit} comparison={fact.comparison} format={fact.format} size="sm" />
          ))}
        </div>
        {review.bodyGap ? (
          <Alert intent="info" title={review.bodyGap.title}>
            {review.bodyGap.body}
          </Alert>
        ) : null}
      </Card.Body>
    </Card>
  );
}

function ReflectStep({ review }: { review: ReviewView }): ReactElement {
  const command = useReflectCommand();
  return (
    <Card padding="lg">
      <Card.Body>
        <h2 className={styles.headline}>Your reflection</h2>
        <p className={styles.lead}>Three prompts, all optional. What you write stays on this device, alongside the rest of this week&apos;s review.</p>
        <div className={styles.prompts}>
          {review.prompts.map(prompt => (
            <ReflectPrompt key={prompt.id} prompt={prompt} command={command} />
          ))}
        </div>
      </Card.Body>
    </Card>
  );
}

type SaveStatus = 'idle' | 'saving' | 'saved';

const SAVE_STATUS_COPY: Record<SaveStatus, string | null> = { idle: null, saving: 'Saving…', saved: 'Saved' };

function ReflectPrompt({ prompt, command }: { prompt: ReviewPrompt; command: ReflectCommandHook }): ReactElement {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const lastSaved = useRef(prompt.answer);

  const save = async (answer: string): Promise<void> => {
    if (answer === lastSaved.current) return;
    const previous = lastSaved.current;
    lastSaved.current = answer;
    setStatus('saving');
    const outcome = await command.run({ type: 'review.answer', promptId: prompt.id, answer }).catch(() => null);
    if (!outcome) {
      lastSaved.current = previous;
      setStatus('idle');
      notifyOutcome({ status: 'failed', message: failureCopy(null), code: null, undone: false }, { action: 'save', subject: 'your reflection', success: '' });
      return;
    }
    const saved = outcome.status === 'applied' || outcome.status === 'queued-offline';
    if (!saved) lastSaved.current = previous;
    setStatus(saved ? 'saved' : 'idle');
    notifyOutcome(outcome, { action: 'save', subject: 'your reflection', success: '' });
  };

  return (
    <FormField label={prompt.question} optional helper={<span aria-live="polite">{SAVE_STATUS_COPY[status]}</span>}>
      <Textarea
        defaultValue={prompt.answer}
        placeholder={prompt.placeholder}
        minRows={2}
        onValueChange={() => setStatus(current => (current === 'saved' ? 'idle' : current))}
        onBlur={event => void save(event.target.value)}
      />
    </FormField>
  );
}

function DoneStep({ review, onBackToReflection }: { review: ReviewView; onBackToReflection: () => void }): ReactElement {
  return (
    <Card padding="lg">
      <Card.Body>
        {review.completion ? (
          <>
            <Alert intent="success" title={review.completion.title}>
              {review.completion.body}
            </Alert>
            <ul className={styles.summaryLines}>
              {review.completion.lines.map(line => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        ) : (
          <Alert intent="info" title="Not finished yet">
            The week closes once you finish the reflection step.
          </Alert>
        )}
        <div className={styles.doneActions}>
          {review.completion ? (
            <Button variant="primary" asChild>
              <Link to="/plan">Plan next week</Link>
            </Button>
          ) : (
            <Button variant="primary" onClick={onBackToReflection}>
              Back to reflection
            </Button>
          )}
        </div>
      </Card.Body>
    </Card>
  );
}
