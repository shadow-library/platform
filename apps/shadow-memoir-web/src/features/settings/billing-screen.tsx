import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Alert, Badge, Button, Card, DescriptionList, Skeleton } from '@shadow-library/ui';

import { Screen, screenStyles } from '@/components/ScreenLayout';
import { useAccountCommand, useBilling } from '@/lib/data';

import styles from './settings.module.css';

export function BillingScreen(): ReactElement {
  const billing = useBilling();
  const command = useAccountCommand();

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
      {billing.isPending || !billing.data ? <Skeleton.Card /> : null}

      {billing.data ? (
        <>
          <div className={styles.plans}>
            {billing.data.plans.map(plan => (
              <Card key={plan.id} padding="lg" selected={plan.current}>
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
                <Button
                  fullWidth
                  variant={plan.current ? 'secondary' : 'primary'}
                  disabled={plan.current}
                  onClick={() => command.mutate({ type: plan.id === 'coach' ? 'billing.startTrial' : 'billing.cancel' })}
                >
                  {plan.current ? 'Current plan' : plan.id === 'coach' ? 'Start the fourteen-day trial' : 'Return to Free at renewal'}
                </Button>
              </Card>
            ))}
          </div>

          <Card padding="lg">
            <h2 className={styles.sectionTitle}>Billing</h2>
            <DescriptionList layout="row" termWidth={150}>
              <DescriptionList.Item term="Status">{billing.data.status}</DescriptionList.Item>
              <DescriptionList.Item term="Trial">{billing.data.trialLine}</DescriptionList.Item>
              <DescriptionList.Item term="Coaching quota">{billing.data.quotaLine}</DescriptionList.Item>
              <DescriptionList.Item term="Invoices">{billing.data.invoicesLine}</DescriptionList.Item>
            </DescriptionList>
            <div className={styles.actions}>
              <Button size="sm" variant="secondary">
                Manage the subscription
              </Button>
              <Button size="sm" variant="ghost" onClick={() => command.mutate({ type: 'billing.cancel' })}>
                Cancel the plan
              </Button>
            </div>
            {billing.data.cancellationNote ? (
              <Alert intent="info" title="Cancelling keeps everything except the coaching volume">
                {billing.data.cancellationNote}
              </Alert>
            ) : null}
          </Card>

          <Card padding="md">
            <h2 className={screenStyles.cardTitle}>What money does not buy</h2>
            <p className={screenStyles.cardBody}>
              No experience multipliers, no extra HP, no shields, no faster levels and no cosmetics for cash. Paying has never touched hero mechanics and it never will.
            </p>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
