import { type ReactElement } from 'react';
import { Alert, Badge, Button, Card, EmptyState, Skeleton, Tag, toast } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import {
  deriveDueState,
  DUE_STATE_LABELS,
  formatMinor,
  type Subscription,
  SUBSCRIPTION_CATEGORIES,
  type SubscriptionDueState,
  todayISODate,
  useFinanceCommand,
  useSubscriptions,
} from '@/lib/data';
import { useDataReadiness } from '@/lib/sync';

import styles from './finance.module.css';

const FREQUENCY_LABELS: Record<Subscription['frequency'], string> = {
  weekly: 'weekly',
  monthly: 'monthly',
  quarterly: 'quarterly',
  yearly: 'yearly',
  custom: 'custom cycle',
};

/** Overdue is amber, never red — a bill the owner has not confirmed is information, not a failure. */
const DUE_INTENT: Record<SubscriptionDueState, 'neutral' | 'info' | 'warning'> = {
  none: 'neutral',
  upcoming: 'info',
  due: 'info',
  overdue: 'warning',
};

export function SubscriptionsScreen(): ReactElement {
  const today = todayISODate();
  const subscriptions = useSubscriptions();
  const command = useFinanceCommand();

  const confirm = (subscription: Subscription): void => {
    command.mutate({ type: 'subscription.confirmCycle', id: subscription.id, billingDate: subscription.nextDueDate }, { onSuccess: result => toast.success(result.message) });
  };

  const ready = useDataReadiness({ query: subscriptions }).readiness.kind === 'ready';
  const view = subscriptions.data;
  const home = view?.homeCurrency ?? 'EUR';

  return (
    <section className={styles.screen} aria-labelledby="subs-title">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title} id="subs-title">
            Subscriptions
          </h1>
          <p className={styles.meta}>
            {ready && view ? `${view.activeCount} active · ${formatMinor(view.monthlyTotalMinor, home)} a month · ${formatMinor(view.yearlyTotalMinor, home)} a year` : 'Loading'}
          </p>
        </div>
      </header>

      <DataState query={subscriptions} skeleton={<Skeleton.List rows={6} />}>
        <div className={styles.split}>
          <Card padding="md">
            <Card.Body>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>Recurring charges</h2>
              </div>

              {view?.items.length === 0 && (
                <EmptyState size="inline" title="No subscriptions yet" description="Add one and Memoir will prepare its expense for you to confirm when the cycle comes due." />
              )}

              {view?.items.map(subscription => {
                const dueState = deriveDueState(subscription, today);
                const category = SUBSCRIPTION_CATEGORIES[subscription.categoryId];
                return (
                  <div key={subscription.id} className={styles.staticRow}>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitleLine}>
                        <span className={styles.rowName}>{subscription.name}</span>
                        <Tag size="sm">{category.name}</Tag>
                        {dueState !== 'none' && (
                          <Badge variant="soft" size="sm" intent={DUE_INTENT[dueState]}>
                            {DUE_STATE_LABELS[dueState]}
                          </Badge>
                        )}
                        {subscription.trialEndsOn && (
                          <Badge variant="outline" size="sm">
                            Trial ends {subscription.trialEndsOn}
                          </Badge>
                        )}
                        {!subscription.active && (
                          <Badge variant="outline" size="sm">
                            Paused
                          </Badge>
                        )}
                      </span>
                      <span className={styles.rowMeta}>
                        Renews {subscription.nextDueDate}
                        {subscription.linkedQuestTitle ? ` · linked to ${subscription.linkedQuestTitle}` : ''}
                        {` · ${formatMinor(subscription.monthlyEquivalentMinor, home)} a month`}
                      </span>
                    </span>
                    <span className={styles.rowAmount}>
                      <span className={styles.amount}>{formatMinor(subscription.amountMinor, subscription.currency)}</span>
                      <span className={styles.amountSub}>{FREQUENCY_LABELS[subscription.frequency]}</span>
                    </span>
                    {(dueState === 'due' || dueState === 'overdue') && (
                      <Button size="sm" variant="secondary" loading={command.isPending} onClick={() => confirm(subscription)}>
                        Confirm charge
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => command.mutate({ type: 'subscription.setActive', id: subscription.id, active: !subscription.active })}>
                      {subscription.active ? 'Pause' : 'Resume'}
                    </Button>
                  </div>
                );
              })}
            </Card.Body>
          </Card>

          <div className={styles.column}>
            <Card padding="md">
              <Card.Body>
                <h2 className={styles.railTitle}>Next 30 days</h2>
                <ul className={styles.railList}>
                  {view?.upcoming.map(charge => (
                    <li key={`${charge.subscriptionId}-${charge.dueDate}`} className={styles.railRow}>
                      <span className={styles.railRowName}>
                        {charge.name} <span className={styles.railRowWhen}>· {charge.dueDate}</span>
                      </span>
                      <span className={styles.mono}>{formatMinor(charge.amountMinor, charge.currency)}</span>
                    </li>
                  ))}
                </ul>
                {view?.upcoming.length === 0 && <p className={styles.railProse}>Nothing renews in the next month.</p>}
              </Card.Body>
            </Card>

            {view?.collisions.map(collision => (
              <Alert key={collision.date} intent="info" title="Two renewals land on the same day">
                {collision.names.join(' and ')} both renew on {collision.date}, {formatMinor(collision.totalMinor, home)} together. Nothing is wrong — it is worth knowing before
                the day.
              </Alert>
            ))}

            <Card padding="md">
              <Card.Body>
                <h2 className={styles.railTitle}>Nothing is charged for you</h2>
                <p className={styles.railProse}>
                  When a cycle comes due, Memoir prepares the expense and waits. Confirming writes it once for that cycle, however many devices you confirm from.
                </p>
              </Card.Body>
            </Card>
          </div>
        </div>
      </DataState>
    </section>
  );
}
