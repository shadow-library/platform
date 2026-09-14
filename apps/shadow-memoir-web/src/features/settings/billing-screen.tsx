import { Link } from '@tanstack/react-router';
import { type ReactElement, useEffect, useState } from 'react';
import { Badge, Button, Card, DescriptionList, Skeleton } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { Screen, screenStyles } from '@/components/ScreenLayout';
import { type BillingPeriod, type BillingView, notifyOutcome, useAccountCommand, useBilling } from '@/lib/data';

import styles from './settings.module.css';

const CHECKOUT_REDIRECT_TIMEOUT_MS = 10_000;

export function BillingScreen(): ReactElement {
  const billing = useBilling();

  return (
    <Screen
      title="Plan and billing"
      subtitle="A paid plan buys machine time for coaching and nothing else. The game is identical on both plans."
      actions={
        <Button size="sm" variant="ghost" asChild>
          <Link to="/settings">Settings</Link>
        </Button>
      }
    >
      <DataState query={billing} skeleton={<Skeleton.Card />}>
        {data => <BillingPlans billing={data} />}
      </DataState>
    </Screen>
  );
}

function BillingPlans({ billing }: { billing: BillingView }): ReactElement {
  const command = useAccountCommand();
  const [redirecting, setRedirecting] = useState<BillingPeriod | null>(null);
  const checkoutPending = redirecting !== null || command.isPendingFor(item => item.type === 'billing.checkout');

  useEffect(() => {
    if (redirecting === null) return undefined;
    const settle = (): void => setRedirecting(null);
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) settle();
    };
    window.addEventListener('pageshow', onPageShow);
    const timer = window.setTimeout(settle, CHECKOUT_REDIRECT_TIMEOUT_MS);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      window.clearTimeout(timer);
    };
  }, [redirecting]);

  const checkout = async (plan: BillingPeriod): Promise<void> => {
    const outcome = await command.run({ type: 'billing.checkout', plan });
    if (outcome.status === 'applied') setRedirecting(plan);
    notifyOutcome(outcome, { success: '', action: 'start checkout' });
  };

  return (
    <>
      <div className={styles.plans}>
        {billing.plans.map(plan => (
          <Card key={plan.id} padding="lg" selected={plan.current}>
            <Card.Body>
              <div className={styles.planHead}>
                <span className={styles.planName}>{plan.name}</span>
                {plan.current ? (
                  <Badge variant="soft" intent="info">
                    Current
                  </Badge>
                ) : null}
              </div>
              <div className={styles.planPrice}>
                <span className={styles.planPriceValue}>{plan.price}</span>
                <span className={styles.planCycle}>{plan.cycle}</span>
              </div>
              <p className={styles.sectionNote}>{plan.tagline}</p>
              <ul className={styles.planFeatures}>
                {plan.features.map(feature => (
                  <li key={feature.text} className={styles.planFeature} data-included={feature.included}>
                    <span className={styles.planGlyph} aria-hidden>
                      {feature.included ? '✓' : '—'}
                    </span>
                    <span>{feature.text}</span>
                  </li>
                ))}
              </ul>
              {plan.id === 'coach' && !plan.current ? (
                <div className={styles.actions}>
                  <Button
                    variant="primary"
                    loading={redirecting === 'monthly' || command.isPendingFor({ type: 'billing.checkout', plan: 'monthly' })}
                    loadingText="Starting checkout…"
                    disabled={checkoutPending}
                    onClick={() => void checkout('monthly')}
                  >
                    {billing.lapsed ? 'Renew monthly' : 'Pay monthly'}
                  </Button>
                  <Button
                    variant="secondary"
                    loading={redirecting === 'yearly' || command.isPendingFor({ type: 'billing.checkout', plan: 'yearly' })}
                    loadingText="Starting checkout…"
                    disabled={checkoutPending}
                    onClick={() => void checkout('yearly')}
                  >
                    {billing.lapsed ? 'Renew yearly' : 'Pay yearly'}
                  </Button>
                </div>
              ) : plan.id === 'coach' ? (
                <p className={styles.sectionNote}>
                  <strong>Current plan.</strong> Switching between monthly and yearly is done with the payment provider.
                </p>
              ) : (
                <Button fullWidth variant="secondary" disabled>
                  {plan.current ? 'Current plan' : 'Included'}
                </Button>
              )}
            </Card.Body>
          </Card>
        ))}
      </div>

      <Card padding="lg">
        <Card.Body>
          <h2 className={styles.sectionTitle}>Billing</h2>
          <DescriptionList layout="row" termWidth={150}>
            <DescriptionList.Item term="Status">{billing.status}</DescriptionList.Item>
            {billing.trialLine ? <DescriptionList.Item term="Trial">{billing.trialLine}</DescriptionList.Item> : null}
            <DescriptionList.Item term="Coaching quota">{billing.quotaLine}</DescriptionList.Item>
            <DescriptionList.Item term="Invoices">{billing.invoicesLine}</DescriptionList.Item>
          </DescriptionList>
          <p className={styles.sectionNote}>{billing.manageNote}</p>
        </Card.Body>
      </Card>

      <Card padding="md">
        <Card.Body>
          <h2 className={screenStyles.cardTitle}>What money does not buy</h2>
          <p className={screenStyles.cardBody}>
            No experience multipliers, no extra HP, no shields, no faster levels and no cosmetics for cash. Paying has never touched hero mechanics and it never will.
          </p>
        </Card.Body>
      </Card>
    </>
  );
}
