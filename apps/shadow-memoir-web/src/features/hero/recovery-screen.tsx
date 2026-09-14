import { Link } from '@tanstack/react-router';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Progress, Skeleton, Statistic, toast } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { Screen, ScreenColumns, screenStyles } from '@/components/ScreenLayout';
import { type HeroIntensityMode, type RecoveryView, useDismissComingBack, useHeroCommand, useRecovery } from '@/lib/data';

import styles from './hero.module.css';

export function RecoveryScreen(): ReactElement {
  const recovery = useRecovery();
  const dismiss = useDismissComingBack();
  const [focusDismissed, setFocusDismissed] = useState(false);

  const setAside = (): void => {
    dismiss.mutate(undefined, {
      onSuccess: () => setFocusDismissed(true),
      onError: () => toast.danger('Couldn’t set this aside. Try again.'),
    });
  };

  return (
    <Screen
      title="Coming back"
      subtitle="What happened recently, and every choice open to you now. Doing nothing is one of them, and it costs nothing."
      actions={
        <Button size="sm" variant="ghost" asChild>
          <Link to="/hero">Hero</Link>
        </Button>
      }
    >
      <DataState query={recovery} skeleton={<Skeleton.Card />}>
        {view => <RecoveryContent view={view} dismissing={dismiss.isPending} focusDismissed={focusDismissed} onDismiss={setAside} />}
      </DataState>
    </Screen>
  );
}

interface RecoveryContentProps {
  view: RecoveryView;
  dismissing: boolean;
  focusDismissed: boolean;
  onDismiss: () => void;
}

function RecoveryContent({ view, dismissing, focusDismissed, onDismiss }: RecoveryContentProps): ReactElement {
  const command = useHeroCommand();
  const dismissedHeading = useRef<HTMLHeadingElement>(null);
  const dismissed = view.comingBack.kind === 'dismissed';

  useEffect(() => {
    if (focusDismissed && dismissed) dismissedHeading.current?.focus();
  }, [focusDismissed, dismissed]);

  const setIntensity = (mode: HeroIntensityMode): void => {
    command.mutate({ type: 'intensity.set', mode }, { onSuccess: result => toast.neutral(result.message) });
  };

  return (
    <ScreenColumns
      asideVariant="context"
      aside={
        <>
          {view.overload ? (
            <Alert intent="warning" title={view.overload.title}>
              {view.overload.body}
            </Alert>
          ) : null}

          {view.missed.length > 0 ? (
            <Card padding="md">
              <Card.Body>
                <h2 className={screenStyles.cardTitle}>Recently missed</h2>
                <ul className={styles.rows}>
                  {view.missed.map(entry => (
                    <li key={entry.id} className={styles.row}>
                      <span>
                        <span className={styles.rowTitle}>{entry.title}</span>
                        <span className={styles.rowMeta}>{entry.meta}</span>
                      </span>
                      <Badge variant="outline" size="sm">
                        {entry.state}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </Card.Body>
            </Card>
          ) : null}

          {view.progress ? (
            <Card padding="md">
              <Card.Body>
                <h2 className={screenStyles.cardTitle}>Comeback progress</h2>
                <Progress value={view.progress.percent} max={100} size="md" label="Comeback progress" />
                <p className={screenStyles.cardBody}>{view.progress.note}</p>
              </Card.Body>
            </Card>
          ) : null}

          <Card padding="md">
            <Card.Body>
              <h2 className={screenStyles.cardTitle}>How shields work</h2>
              <p className={screenStyles.cardBody}>{view.shieldNote}</p>
            </Card.Body>
          </Card>
        </>
      }
    >
      <Card padding="lg">
        <Card.Body>
          <h2 className={styles.name}>{view.headline}</h2>
          <p className={screenStyles.cardBody}>{view.body}</p>
          <div className={styles.facts}>
            {view.stats.map(stat => (
              <Statistic key={stat.label} label={stat.label} value={stat.value} unit={stat.unit} size="sm" />
            ))}
          </div>
        </Card.Body>
      </Card>

      {dismissed ? (
        <Card padding="md">
          <Card.Body>
            <h2 ref={dismissedHeading} tabIndex={-1} className={screenStyles.cardTitle}>
              Not now
            </h2>
            <p className={screenStyles.cardBody}>These choices are set aside for today. They come back tomorrow if they still apply.</p>
          </Card.Body>
        </Card>
      ) : null}

      {!dismissed && view.choices.length > 0 ? (
        <Card padding="md">
          <Card.Body>
            <h2 className={screenStyles.cardTitle}>Open choices</h2>
            <p className={screenStyles.cardBody}>Each of these is optional and reversible.</p>
            {view.choices.map(choice => (
              <div key={choice.id} className={styles.choice}>
                <p className={styles.choiceTitle}>{choice.title}</p>
                <p className={screenStyles.cardBody}>{choice.body}</p>
                <p className={styles.choiceEffect}>Effect: {choice.effect}</p>
                <div className={styles.choiceActions}>
                  <Button size="sm" variant="secondary" asChild>
                    <Link to={choice.to}>{choice.actionLabel}</Link>
                  </Button>
                </div>
              </div>
            ))}
            <div className={styles.choiceActions}>
              <Button size="sm" variant="ghost" loading={dismissing} disabled={dismissing} onClick={onDismiss}>
                Not now
              </Button>
            </div>
          </Card.Body>
        </Card>
      ) : null}

      <Card padding="md">
        <Card.Body>
          <h2 className={screenStyles.cardTitle}>Intensity</h2>
          <p className={screenStyles.cardBody}>
            How much the app should ask of you. This changes load and strictness across every quest at once, and it never changes experience already earned.
          </p>
          <div className={styles.options} role="group" aria-label="Intensity">
            {view.intensityOptions.map(option => (
              <button key={option.mode} type="button" className={styles.option} aria-pressed={view.intensity === option.mode} onClick={() => setIntensity(option.mode)}>
                <span className={styles.optionDot} aria-hidden />
                <span>
                  <span className={styles.optionName}>{option.name}</span>
                  <span className={styles.optionDesc}>{option.description}</span>
                </span>
              </button>
            ))}
          </div>
        </Card.Body>
      </Card>
    </ScreenColumns>
  );
}
