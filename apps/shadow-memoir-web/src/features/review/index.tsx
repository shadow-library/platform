import { Link } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Button, Card, FormField, Skeleton, Statistic, Textarea } from '@shadow-library/ui';

import { Screen, ScreenColumns, screenStyles } from '@/components/ScreenLayout';
import { type ReviewStepId, type ReviewView, useReflectCommand, useReview } from '@/lib/data';

import styles from './review.module.css';

const STEPS: { id: ReviewStepId; label: string }[] = [
  { id: 'kept', label: 'Kept' },
  { id: 'money', label: 'Money' },
  { id: 'body', label: 'Body' },
  { id: 'reflect', label: 'Reflect' },
  { id: 'done', label: 'Done' },
];

export function WeeklyReviewScreen(): ReactElement {
  const review = useReview();
  const command = useReflectCommand();
  const [index, setIndex] = useState(0);
  const step = STEPS[index] as (typeof STEPS)[number];

  const advance = (): void => {
    if (index === STEPS.length - 2) command.mutate({ type: 'review.complete' });
    setIndex(current => Math.min(STEPS.length - 1, current + 1));
  };

  return (
    <Screen title="Weekly Review" subtitle="A restrained look back at the week, in five short steps. Every prompt in it is optional.">
      {review.isPending || !review.data ? <Skeleton.Card /> : null}

      {review.data ? (
        <ScreenColumns
          aside={
            <>
              <Card padding="md">
                <h2 className={screenStyles.cardTitle}>Week at a glance</h2>
                <ul className={screenStyles.list}>
                  {review.data.glance.map(line => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </Card>
              <Card padding="md">
                <h2 className={screenStyles.cardTitle}>Carried into planning</h2>
                <p className={screenStyles.cardBody}>{review.data.carried}</p>
                <div className={styles.doneActions}>
                  <Button size="sm" variant="secondary" asChild>
                    <Link to="/plan">Open the board</Link>
                  </Button>
                </div>
              </Card>
            </>
          }
        >
          <Card padding="md">
            <div className={styles.stepBar}>
              <div>
                <p className={styles.headline}>{review.data.weekLabel}</p>
                <p className={styles.stepMeta}>{step.id === 'done' ? 'Completed and saved to History' : `Step ${index + 1} of ${STEPS.length} · about four minutes`}</p>
              </div>
              <div className={styles.stepActions}>
                <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => setIndex(current => Math.max(0, current - 1))}>
                  Back
                </Button>
                {step.id === 'done' ? (
                  <Button size="sm" variant="primary" asChild>
                    <Link to="/plan">Plan next week</Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={advance}>
                    {step.id === 'reflect' ? 'Finish the review' : 'Continue'}
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
                  data-reached={itemIndex <= index}
                  aria-current={itemIndex === index ? 'step' : undefined}
                  onClick={() => setIndex(itemIndex)}
                >
                  <span className={styles.stepRule} aria-hidden />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </Card>

          {step.id === 'kept' ? <KeptStep review={review.data} /> : null}
          {step.id === 'money' ? <FactsStep title="Money" headline={review.data.moneyHeadline} facts={review.data.moneyFacts} note={review.data.moneyNote} /> : null}
          {step.id === 'body' ? <BodyStep review={review.data} /> : null}
          {step.id === 'reflect' ? <ReflectStep review={review.data} /> : null}
          {step.id === 'done' ? <DoneStep review={review.data} /> : null}
        </ScreenColumns>
      ) : null}
    </Screen>
  );
}

function KeptStep({ review }: { review: ReviewView }): ReactElement {
  return (
    <Card padding="lg">
      <h2 className={styles.headline}>What you kept</h2>
      <p className={styles.lead}>{review.keptHeadline}</p>
      <ul className={styles.questRows}>
        {review.quests.map(quest => (
          <li key={quest.id}>
            <div className={styles.questHead}>
              <span>{quest.title}</span>
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
    </Card>
  );
}

function FactsStep({ title, headline, facts, note }: { title: string; headline: string; facts: ReviewView['moneyFacts']; note: string }): ReactElement {
  return (
    <Card padding="lg">
      <h2 className={styles.headline}>{title}</h2>
      <p className={styles.lead}>{headline}</p>
      <div className={styles.facts}>
        {facts.map(fact => (
          <Statistic key={fact.label} label={fact.label} value={fact.value} unit={fact.unit} comparison={fact.comparison} format={fact.format} size="sm" />
        ))}
      </div>
      <p className={screenStyles.cardBody}>{note}</p>
    </Card>
  );
}

function BodyStep({ review }: { review: ReviewView }): ReactElement {
  return (
    <Card padding="lg">
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
    </Card>
  );
}

function ReflectStep({ review }: { review: ReviewView }): ReactElement {
  const command = useReflectCommand();
  return (
    <Card padding="lg">
      <h2 className={styles.headline}>Your reflection</h2>
      <p className={styles.lead}>Three prompts, all optional. What you write is saved as a journal entry dated to the review.</p>
      <div className={styles.prompts}>
        {review.prompts.map(prompt => (
          <FormField key={prompt.id} label={prompt.question} optional>
            <Textarea
              defaultValue={prompt.answer}
              placeholder={prompt.placeholder}
              minRows={2}
              onBlur={event => command.mutate({ type: 'review.answer', promptId: prompt.id, answer: event.target.value })}
            />
          </FormField>
        ))}
      </div>
    </Card>
  );
}

function DoneStep({ review }: { review: ReviewView }): ReactElement {
  return (
    <Card padding="lg">
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
        <p className={styles.lead}>The week closes once you finish the reflection step.</p>
      )}
      <div className={styles.doneActions}>
        <Button variant="primary" asChild>
          <Link to="/plan">Plan next week</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/history">Read the entry</Link>
        </Button>
      </div>
    </Card>
  );
}
