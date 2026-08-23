import { type ReactElement, useState } from 'react';
import { Alert, Button, Card, EmptyState, Skeleton, Statistic, toast } from '@shadow-library/ui';

import { EntryCapNote } from '@/components/EntryCapNote';
import { SparkBars } from '@/components/SparkBars';
import { type EntryCapAdvisory, MEAL_TYPE_LABELS, todayISODate, useMeals, useQuickLogCommand } from '@/lib/data';

import { MealEntryPanel } from './meal-entry-panel';
import styles from './quick-logs.module.css';

export function MealsScreen(): ReactElement {
  const date = todayISODate();
  const meals = useMeals(date);
  const command = useQuickLogCommand();
  const [formOpen, setFormOpen] = useState(false);
  const [advisory, setAdvisory] = useState<EntryCapAdvisory | null>(null);

  const view = meals.data;

  const logPreset = (presetId: string): void => {
    command.mutate(
      { type: 'meal.logPreset', presetId, date },
      {
        onSuccess: result => {
          setAdvisory(result.advisory ?? null);
          toast.success(result.reward?.rewarded ? `${result.message} First meal today — +${result.reward.xp} XP.` : result.message);
        },
      },
    );
  };

  if (meals.isLoading || !view) return <Skeleton.Card />;

  return (
    <section className={styles.screen} aria-labelledby="meals-title">
      <h2 className={styles.cardTitle} id="meals-title">
        Meals
      </h2>

      <div className={styles.split}>
        <div className={styles.column}>
          <Card padding="md">
            <div className={styles.pad}>
              <div className={styles.cardHead}>
                <h3 className={styles.cardTitle}>Today · {view.totalCalories.toLocaleString('en-US')} kcal</h3>
                <Button size="sm" variant="primary" onClick={() => setFormOpen(true)}>
                  Add meal
                </Button>
              </div>

              {view.meals.length === 0 && (
                <EmptyState
                  size="inline"
                  title="Nothing logged today"
                  description="A blank day stays blank — it is not a zero, and it costs nothing."
                  action={{ label: 'Add meal', onClick: () => setFormOpen(true) }}
                />
              )}

              {view.meals.map(meal => (
                <div key={meal.id} className={styles.row}>
                  <span className={styles.rowSlot}>{meal.loggedAt.slice(11, 16)}</span>
                  <span className={styles.rowMain}>
                    <span className={styles.rowName}>{meal.name}</span>
                    <span className={styles.rowMeta}>
                      {meal.sourceLabel} · {MEAL_TYPE_LABELS[meal.mealType]}
                    </span>
                  </span>
                  <span className={styles.mono}>{meal.calories} kcal</span>
                </div>
              ))}

              <div className={styles.statRow}>
                <Statistic label="Protein" value={view.macros.proteinG} unit="g" size="sm" />
                <Statistic label="Carbs" value={view.macros.carbsG} unit="g" size="sm" />
                <Statistic label="Fat" value={view.macros.fatG} unit="g" size="sm" />
                <Statistic label="Meals logged" value={view.meals.length} size="sm" />
              </div>

              <EntryCapNote advisory={advisory} />
            </div>
          </Card>

          {formOpen && <MealEntryPanel date={date} presets={view.presets} onClose={() => setFormOpen(false)} />}

          <Card padding="md">
            <div className={styles.pad}>
              <h3 className={styles.cardTitle}>Last 14 days</h3>
              <SparkBars values={view.last14Days.map(day => day.value)} label="Calories over the last 14 days" height={72} highlightLast />
              <div className={styles.axis}>
                <span>{view.last14Days[0]?.date}</span>
                <span>average {view.averageCalories.toLocaleString('en-US')} kcal</span>
                <span>{date}</span>
              </div>

              {view.history.map(day => (
                <div key={day.date} className={styles.row}>
                  <span className={styles.rowStamp}>{day.date}</span>
                  <span className={styles.rowMain}>
                    <span className={styles.rowMeta} style={{ marginTop: 0 }}>
                      {day.summary}
                    </span>
                  </span>
                  <span className={styles.mono}>{day.calories === null ? '—' : day.calories.toLocaleString('en-US')}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className={styles.column}>
          {view.firstOfDayRewarded && (
            <Alert intent="success" title="First meal logged today">
              The day’s meal reward is already yours. Everything after it still records — meal logging is optional, and skipping a day costs nothing.
            </Alert>
          )}

          <Card padding="md">
            <div className={styles.pad}>
              <h3 className={styles.railTitle}>Presets</h3>
              <ul className={styles.list}>
                {view.presets.map(preset => (
                  <li key={preset.id} className={styles.railRow}>
                    <span>
                      {preset.name} <span className={styles.railRowWhen}>· used {preset.usageCount} times</span>
                    </span>
                    <span className={styles.mono}>{preset.calories} kcal</span>
                  </li>
                ))}
              </ul>
              <div className={styles.presetChips} style={{ marginTop: 12 }}>
                {view.presets.slice(0, 4).map(preset => (
                  <Button key={preset.id} size="sm" variant="secondary" loading={command.isPending} onClick={() => logPreset(preset.id)}>
                    {preset.name}
                  </Button>
                ))}
              </div>
              <p className={styles.hint} style={{ marginTop: 10 }}>
                A logged meal keeps the numbers it was logged with. Editing a preset later never changes a past meal.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
