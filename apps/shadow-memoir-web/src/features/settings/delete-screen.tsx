import { Link } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Button, Card, Checkbox, Skeleton } from '@shadow-library/ui';

import { Screen, ScreenColumns, screenStyles } from '@/components/ScreenLayout';
import { useAccountCommand, useDeletion } from '@/lib/data';

import styles from './settings.module.css';

/**
 * The screen ends at the re-authentication handoff on purpose. `POST /account/deletion` needs an elevated
 * principal, and an XHR is not a navigation the guard can bounce — so it answers `IAM_003`, and the owner
 * walks into the step-up prompt themselves. Nothing here can start an erasure (PRD §2.10).
 */
export function DeleteAccountScreen(): ReactElement {
  const deletion = useDeletion();
  const command = useAccountCommand();
  const [refusal, setRefusal] = useState<string | null>(null);

  const acknowledged = deletion.data?.acknowledged ?? [];
  const allAcknowledged = deletion.data ? acknowledged.length === deletion.data.acknowledgements.length : false;

  const begin = (): void => {
    command.mutate(
      { type: 'deletion.begin' },
      {
        onSuccess: result => setRefusal(result.status === 'rejected' ? result.message : null),
      },
    );
  };

  return (
    <Screen
      title="Delete your data"
      subtitle="This removes everything Shadow Memoir holds about you. It does not touch your Shadow account — signing in again would give you an empty app."
      actions={
        <Button size="sm" variant="ghost" asChild>
          <Link to="/settings">Settings</Link>
        </Button>
      }
    >
      {deletion.isPending || !deletion.data ? <Skeleton.Card /> : null}

      {deletion.data ? (
        <ScreenColumns
          aside={
            <Card padding="md">
              <h2 className={screenStyles.cardTitle}>Lighter options</h2>
              {deletion.data.alternatives.map(alternative => (
                <div key={alternative.title}>
                  <p className={styles.settingLabel}>{alternative.title}</p>
                  <p className={styles.settingHelp}>{alternative.body}</p>
                </div>
              ))}
            </Card>
          }
        >
          {deletion.data.stage === 'scheduled' ? (
            <Card padding="lg">
              <h2 className={styles.sectionTitle}>The erasure has started</h2>
              <p className={styles.sectionNote}>{deletion.data.stateNote}</p>
              <p className={styles.sectionNote}>{deletion.data.gracePeriodNote}</p>
            </Card>
          ) : deletion.data.stage === 'awaiting-reauth' ? (
            <Card padding="lg">
              <h2 className={styles.sectionTitle}>{deletion.data.reauth.title}</h2>
              <p className={styles.sectionNote}>{deletion.data.reauth.body}</p>
              <div className={styles.actions}>
                <Button variant="primary" asChild>
                  <a href={deletion.data.reauth.continueTo}>{deletion.data.reauth.continueLabel}</a>
                </Button>
                <Button variant="ghost" onClick={() => command.mutate({ type: 'deletion.abandon' })}>
                  Stop here
                </Button>
              </div>
            </Card>
          ) : (
            <Card padding="lg">
              <h2 className={styles.sectionTitle}>What would be erased</h2>
              <div className={styles.sets}>
                {deletion.data.sets.map(set => (
                  <div key={set.name} className={styles.set}>
                    <div className={styles.setName}>{set.name}</div>
                    <p className={styles.setMeta}>{set.meta}</p>
                  </div>
                ))}
              </div>

              <h2 className={screenStyles.cardTitle}>How it works</h2>
              <p className={styles.sectionNote}>{deletion.data.gracePeriodNote}</p>

              <div className={styles.acknowledgements}>
                {deletion.data.acknowledgements.map(item => (
                  <Checkbox
                    key={item.id}
                    checked={acknowledged.includes(item.id)}
                    label={item.text}
                    onCheckedChange={checked => command.mutate({ type: 'deletion.acknowledge', acknowledgementId: item.id, acknowledged: checked === true })}
                  />
                ))}
              </div>

              {refusal ? (
                <Alert intent="info" title="Not yet">
                  {refusal}
                </Alert>
              ) : null}

              <div className={styles.actions}>
                <Button variant="danger" disabled={!allAcknowledged} onClick={begin}>
                  Continue to confirmation
                </Button>
                <Button variant="ghost" asChild>
                  <Link to="/settings/export">Export first</Link>
                </Button>
              </div>
            </Card>
          )}
        </ScreenColumns>
      ) : null}
    </Screen>
  );
}
