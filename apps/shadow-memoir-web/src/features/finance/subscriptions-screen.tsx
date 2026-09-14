import { type ReactElement, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, cn, EmptyState, Skeleton, Tag } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import {
  convertToHomeMinor,
  deriveDueState,
  DUE_STATE_LABELS,
  type ExpenseCategory,
  formatMinor,
  notifyOutcome,
  rateFromSnapshots,
  type Subscription,
  type SubscriptionDueState,
  todayISODate,
  UNCATEGORISED,
  unconvertedSubscriptionsNote,
  useFinanceCommand,
  useSubscriptions,
} from '@/lib/data';
import { formatLocalDate } from '@/lib/format';
import { useDataReadiness } from '@/lib/sync';

import styles from './finance.module.css';
import { SubscriptionEntryPanel } from './subscription-entry-panel';

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

function dueLabel(subscription: Subscription, dueState: SubscriptionDueState): string {
  if (!subscription.active) return 'Paused — no renewals';
  if (dueState === 'overdue') return `Was due ${formatLocalDate(subscription.nextDueDate)}`;
  return `Renews ${formatLocalDate(subscription.nextDueDate)}`;
}

function categoryName(subscription: Subscription, categories: ExpenseCategory[]): string {
  return categories.find(category => category.id === subscription.expenseCategoryId)?.name ?? UNCATEGORISED.name;
}

export function SubscriptionsScreen(): ReactElement {
  const today = todayISODate();
  const subscriptions = useSubscriptions();
  const command = useFinanceCommand();
  const [entryOpen, setEntryOpen] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);

  const closeEntry = (): void => {
    setEntryOpen(false);
    addButton.current?.focus();
  };

  const confirm = async (subscription: Subscription): Promise<void> => {
    const outcome = await command.run({ type: 'subscription.confirmCycle', id: subscription.id, billingDate: subscription.nextDueDate });
    const local = outcome.status === 'applied' || outcome.status === 'queued-offline' ? outcome.local : null;
    notifyOutcome(outcome, { success: local?.message ?? '', action: 'confirm', subject: subscription.name });
  };

  const togglePause = async (subscription: Subscription): Promise<void> => {
    const outcome = await command.run({ type: 'subscription.setActive', id: subscription.id, active: !subscription.active });
    const local = outcome.status === 'applied' || outcome.status === 'queued-offline' ? outcome.local : null;
    notifyOutcome(outcome, { success: local?.message ?? '', action: subscription.active ? 'pause' : 'resume', subject: subscription.name });
  };

  const { readiness } = useDataReadiness({ query: subscriptions });
  const ready = readiness.kind === 'ready';
  const view = subscriptions.data;
  const home = view?.homeCurrency ?? 'EUR';
  const meta = ready && view ? `${view.activeCount} active · ${formatMinor(view.monthlyTotalMinor, home)} a month · ${formatMinor(view.yearlyTotalMinor, home)} a year` : null;
  const unconvertedNote = ready && view ? unconvertedSubscriptionsNote(view.unconverted) : '';

  return (
    <section className={styles.screen} aria-labelledby="subs-title">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title} id="subs-title">
            Subscriptions
          </h1>
          {meta && (
            <p className={styles.meta} title={meta}>
              {meta}
            </p>
          )}
          {unconvertedNote && <p className={styles.metaWarning}>{unconvertedNote}</p>}
        </div>
      </header>

      <DataState query={subscriptions} skeleton={<Skeleton.List rows={6} />}>
        <div className={styles.split}>
          <div className={styles.column}>
            {entryOpen && view && <SubscriptionEntryPanel today={today} settings={view.settings} onClose={closeEntry} />}

            <Card padding="md">
              <Card.Body>
                <div className={styles.cardHead}>
                  <h2 className={styles.cardTitle}>Recurring charges</h2>
                  <Button ref={addButton} size="sm" variant="primary" onClick={() => setEntryOpen(true)} aria-expanded={entryOpen}>
                    Add subscription
                  </Button>
                </div>

                {view?.items.length === 0 && (
                  <EmptyState
                    size="inline"
                    title="No subscriptions yet"
                    description="Add one and Memoir will prepare its expense for you to confirm when the cycle comes due."
                    action={{ label: 'Add one', onClick: () => setEntryOpen(true) }}
                  />
                )}

                {view?.items.map(subscription => {
                  const dueState = deriveDueState(subscription, today);
                  const equivalentMinor = convertToHomeMinor(
                    subscription.monthlyEquivalentMinor,
                    subscription.currency,
                    rateFromSnapshots(subscription.currency, home, view?.rates ?? []),
                    home,
                  );
                  const equivalentText =
                    equivalentMinor === null
                      ? `no ${subscription.currency} rate yet`
                      : subscription.currency === home
                        ? `${formatMinor(equivalentMinor, home)} a month`
                        : `≈ ${formatMinor(equivalentMinor, home)} a month`;

                  return (
                    <div key={subscription.id} className={cn(styles.staticRow, styles.subscriptionRow)}>
                      <span className={styles.rowMain}>
                        <span className={styles.rowTitleLine}>
                          <span className={styles.rowName}>{subscription.name}</span>
                          <Tag size="sm">{categoryName(subscription, view?.categories ?? [])}</Tag>
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
                          {dueLabel(subscription, dueState)}
                          {subscription.linkedQuestTitle ? ` · linked to ${subscription.linkedQuestTitle}` : ''}
                          {` · ${equivalentText}`}
                        </span>
                      </span>
                      <span className={styles.rowTrail}>
                        {(dueState === 'due' || dueState === 'overdue') && (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={command.isPendingFor(c => c.type === 'subscription.confirmCycle' && c.id === subscription.id)}
                            onClick={() => void confirm(subscription)}
                          >
                            Confirm charge
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={command.isPendingFor(c => c.type === 'subscription.setActive' && c.id === subscription.id)}
                          onClick={() => void togglePause(subscription)}
                        >
                          {subscription.active ? 'Pause' : 'Resume'}
                        </Button>
                        <span className={styles.rowAmount}>
                          <span className={styles.amount}>{formatMinor(subscription.amountMinor, subscription.currency)}</span>
                          <span className={styles.amountSub}>{FREQUENCY_LABELS[subscription.frequency]}</span>
                        </span>
                      </span>
                    </div>
                  );
                })}
              </Card.Body>
            </Card>
          </div>

          <div className={styles.column}>
            <Card padding="md">
              <Card.Body>
                <h2 className={styles.railTitle}>Next 30 days</h2>
                <ul className={styles.railList}>
                  {view?.upcoming.map(charge => (
                    <li key={`${charge.subscriptionId}-${charge.dueDate}`} className={styles.railRow}>
                      <span className={styles.railRowName} title={charge.name}>
                        {charge.name} <span className={styles.railRowWhen}>· {formatLocalDate(charge.dueDate)}</span>
                      </span>
                      <span className={styles.mono}>{formatMinor(charge.amountMinor, charge.currency)}</span>
                    </li>
                  ))}
                </ul>
                {view?.upcoming.length === 0 && <p className={styles.railProse}>Nothing renews in the next month.</p>}
              </Card.Body>
            </Card>

            {view?.collisions.map(collision => {
              const amountParts = [
                collision.totalMinor === null ? null : formatMinor(collision.totalMinor, home),
                ...collision.unconvertedCharges.map(charge => `plus ${formatMinor(charge.amountMinor, charge.currency)}`),
              ].filter((part): part is string => part !== null);

              return (
                <Alert key={collision.date} intent="info" title="Two renewals land on the same day">
                  {collision.names.join(' and ')} both renew on {formatLocalDate(collision.date)}
                  {amountParts.length > 0 ? `, ${amountParts.join(' ')} together` : ''}. Nothing is wrong — it is worth knowing before the day.
                </Alert>
              );
            })}

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
