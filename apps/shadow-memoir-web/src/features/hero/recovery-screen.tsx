import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Alert, Badge, Button, Card, Progress, Skeleton, Statistic, toast } from '@shadow-library/ui';

import { Screen, ScreenColumns, screenStyles } from '@/components/ScreenLayout';
import { type HeroIntensityMode, useHeroCommand, useRecovery } from '@/lib/data';

import styles from './hero.module.css';

export function RecoveryScreen(): ReactElement {
  const recovery = useRecovery();
  const command = useHeroCommand();

  const setIntensity = (mode: HeroIntensityMode): void => {
    command.mutate({ type: 'intensity.set', mode }, { onSuccess: result => toast.neutral(result.message) });
  };

  return (
    <Screen
      title="Coming back"
      subtitle="What happened while you were away, and every choice open to you now. Doing nothing is one of them, and it costs nothing."
      actions={
        <Button size="sm" variant="ghost" asChild>
          <Link to="/hero">Hero</Link>
        </Button>
      }
    >
      {recovery.isPending || !recovery.data ? <Skeleton.Card /> : null}

      {recovery.data ? (
        <ScreenColumns
          aside={
            <>
              {recovery.data.overload ? (
                <Alert intent="warning" title={recovery.data.overload.title}>
                  {recovery.data.overload.body}
                </Alert>
              ) : null}

              <Card padding="md">
                <h2 className={screenStyles.cardTitle}>While you were away</h2>
                <ul className={styles.rows}>
                  {recovery.data.missed.map(entry => (
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
              </Card>

              <Card padding="md">
                <h2 className={screenStyles.cardTitle}>Comeback progress</h2>
                <Progress value={recovery.data.progressPercent} max={100} size="md" label="Comeback progress" />
                <p className={screenStyles.cardBody}>{recovery.data.progressNote}</p>
              </Card>

              <Card padding="md">
                <h2 className={screenStyles.cardTitle}>How shields work</h2>
                <p className={screenStyles.cardBody}>{recovery.data.shieldNote}</p>
              </Card>
            </>
          }
        >
          <Card padding="lg">
            <h2 className={styles.name}>{recovery.data.headline}</h2>
            <p className={screenStyles.cardBody}>{recovery.data.body}</p>
            <div className={styles.facts}>
              {recovery.data.stats.map(stat => (
                <Statistic key={stat.label} label={stat.label} value={stat.value} unit={stat.unit} size="sm" />
              ))}
            </div>
          </Card>

          <Card padding="md">
            <h2 className={screenStyles.cardTitle}>Open choices</h2>
            <p className={screenStyles.cardBody}>Each of these is optional and reversible.</p>
            {recovery.data.choices.map(choice => (
              <div key={choice.id} className={styles.choice}>
                <p className={styles.choiceTitle}>{choice.title}</p>
                <p className={screenStyles.cardBody}>{choice.body}</p>
                <p className={styles.choiceEffect}>Effect: {choice.effect}</p>
                <div className={styles.choiceActions}>
                  <Button size="sm" variant="secondary" asChild>
                    <Link to={choice.to}>{choice.actionLabel}</Link>
                  </Button>
                  <Button size="sm" variant="ghost">
                    Not now
                  </Button>
                </div>
              </div>
            ))}
          </Card>

          <Card padding="md">
            <h2 className={screenStyles.cardTitle}>Intensity</h2>
            <p className={screenStyles.cardBody}>
              How much the app should ask of you. This changes load and strictness across every quest at once, and it never changes experience already earned.
            </p>
            <div className={styles.options} role="group" aria-label="Intensity">
              {recovery.data.intensityOptions.map(option => (
                <button key={option.mode} type="button" className={styles.option} aria-pressed={recovery.data.intensity === option.mode} onClick={() => setIntensity(option.mode)}>
                  <span className={styles.optionDot} aria-hidden />
                  <span>
                    <span className={styles.optionName}>{option.name}</span>
                    <span className={styles.optionDesc}>{option.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </ScreenColumns>
      ) : null}
    </Screen>
  );
}
