import { type ReactElement, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, Card, EmptyState, Skeleton } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { EntryCapNote } from '@/components/EntryCapNote';
import { LinkageOfferNote } from '@/components/LinkageOfferNote';
import { SparkBars } from '@/components/SparkBars';
import {
  type EntryCapAdvisory,
  MEAL_TYPE_LABELS,
  type MealPreset,
  type MealsView,
  type QuestLinkageOffer,
  type QuickLogCommandResult,
  todayISODate,
  useMeals,
  useQuickLogCommand,
} from '@/lib/data';
import { formatCount, formatLocalDate, formatLocalTime } from '@/lib/format';

import { MealEntryPanel } from './meal-entry-panel';
import { mealLoggedMessage, relogPrompt, runQuickLog } from './quick-log-run';
import styles from './quick-logs.module.css';

const RELOG_GUARD_MS = 1500;
const RELOG_CONFIRM_MS = 4000;
const RELOG_CONFIRM_SETTLE_MS = 400;

export function MealsScreen(): ReactElement {
  const date = todayISODate();
  const meals = useMeals(date);

  return (
    <section className={styles.screen} aria-labelledby="meals-title">
      <h2 className={styles.cardTitle} id="meals-title">
        Meals
      </h2>

      <DataState query={meals} skeleton={<Skeleton.Card />}>
        {view => <MealsContent view={view} date={date} />}
      </DataState>
    </section>
  );
}

function inSessionOrder(presets: MealPreset[], order: string[]): MealPreset[] {
  const rank = (preset: MealPreset): number => {
    const index = order.indexOf(preset.id);
    return index === -1 ? order.length : index;
  };
  return [...presets].sort((a, b) => rank(a) - rank(b));
}

interface PresetMoment {
  presetId: string;
  at: number;
}

function MealsContent({ view, date }: { view: MealsView; date: string }): ReactElement {
  const command = useQuickLogCommand();
  const [chipOrder] = useState(() => view.presets.map(preset => preset.id));
  const chipPresets = inSessionOrder(view.presets, chipOrder);
  const [formOpen, setFormOpen] = useState(false);
  const [advisory, setAdvisory] = useState<EntryCapAdvisory | null>(null);
  const [linkage, setLinkage] = useState<QuestLinkageOffer | null>(null);
  const [confirmingPreset, setConfirmingPreset] = useState<MealPreset | null>(null);
  const lastPresetLogRef = useRef<PresetMoment | null>(null);
  const confirmRef = useRef<PresetMoment | null>(null);
  const relogStatusId = useId();

  const endConfirm = useCallback((): void => {
    confirmRef.current = null;
    setConfirmingPreset(null);
  }, []);

  useEffect(() => {
    if (!confirmingPreset) return;
    const handle = setTimeout(endConfirm, RELOG_CONFIRM_MS);
    return () => clearTimeout(handle);
  }, [confirmingPreset, endConfirm]);

  const presetsBusy = command.isPendingFor(pending => pending.type === 'meal.logPreset');
  const isLoggingPreset = (presetId: string): boolean => command.isPendingFor(pending => pending.type === 'meal.logPreset' && pending.presetId === presetId);

  const logPreset = async (preset: MealPreset): Promise<boolean> => {
    const now = performance.now();
    const confirm = confirmRef.current?.presetId === preset.id ? confirmRef.current : null;
    if (confirm && now - confirm.at < RELOG_CONFIRM_SETTLE_MS) return false;

    const lastLog = lastPresetLogRef.current;
    if (!confirm && lastLog?.presetId === preset.id && now - lastLog.at < RELOG_GUARD_MS) {
      confirmRef.current = { presetId: preset.id, at: now };
      setConfirmingPreset(preset);
      return false;
    }

    endConfirm();
    const run = await runQuickLog(command, { type: 'meal.logPreset', presetId: preset.id, date }, { action: 'log', subject: preset.name, success: mealLoggedMessage });
    if (run.kind !== 'saved') return false;
    lastPresetLogRef.current = { presetId: preset.id, at: performance.now() };
    setAdvisory(run.result.advisory ?? null);
    setLinkage(run.result.linkageOffer ?? null);
    return true;
  };

  const onPanelSaved = (result: QuickLogCommandResult): void => setLinkage(result.linkageOffer ?? null);

  return (
    <div className={styles.split}>
      <div className={styles.column}>
        <Card padding="md">
          <Card.Body>
            <div className={styles.cardHead}>
              <h3 className={styles.cardTitle}>{view.meals.length === 0 ? 'Today' : `Today · ${view.totalCalories.toLocaleString('en-US')} kcal`}</h3>
              <Button size="sm" variant="primary" disabled={formOpen} onClick={() => setFormOpen(true)}>
                Add meal
              </Button>
            </div>

            {view.meals.length === 0 && <EmptyState size="inline" title="Nothing logged today" description="A blank day stays blank — it is not a zero, and it costs nothing." />}

            {view.meals.map(meal => (
              <div key={meal.id} className={styles.row}>
                <span className={styles.rowSlot}>{formatLocalTime(meal.loggedAt)}</span>
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{meal.name}</span>
                  <span className={styles.rowMeta}>
                    {meal.sourceLabel} · {MEAL_TYPE_LABELS[meal.mealType]}
                  </span>
                </span>
                <span className={styles.rowValue}>{meal.calories.toLocaleString('en-US')} kcal</span>
              </div>
            ))}

            <EntryCapNote advisory={advisory} />
            <LinkageOfferNote offer={linkage} />
          </Card.Body>
        </Card>

        {formOpen && (
          <MealEntryPanel
            date={date}
            presets={chipPresets}
            presetsBusy={presetsBusy}
            isLoggingPreset={isLoggingPreset}
            confirmingPresetId={confirmingPreset?.id ?? null}
            onLogPreset={logPreset}
            onSaved={onPanelSaved}
            onClose={() => setFormOpen(false)}
          />
        )}

        <Card padding="md">
          <Card.Body>
            <h3 className={styles.cardTitle}>Last 14 days</h3>
            <SparkBars
              values={view.last14Days.map(day => day.value)}
              label="Calories over the last 14 days"
              height={72}
              highlightLast
              axis={{
                start: formatLocalDate(view.last14Days[0]?.date, { year: false }),
                middle: view.averageCalories === null ? 'nothing logged' : `average ${view.averageCalories.toLocaleString('en-US')} kcal`,
                end: 'Today',
              }}
            />

            {view.history.map(day => (
              <div key={day.date} className={styles.row}>
                <span className={styles.rowStamp}>{day.date === view.date ? 'Today' : formatLocalDate(day.date, { year: false })}</span>
                <span className={styles.rowMain}>
                  <span className={styles.rowMeta} style={{ marginTop: 0 }}>
                    {day.summary}
                  </span>
                </span>
                <span className={styles.rowValue}>{day.calories === null ? '—' : `${day.calories.toLocaleString('en-US')} kcal`}</span>
              </div>
            ))}
          </Card.Body>
        </Card>
      </div>

      <div className={styles.column}>
        {view.firstOfDayRewarded && (
          <Alert intent="success" title="First meal logged today">
            The day’s meal reward is already yours. Everything after it still records — meal logging is optional, and skipping a day costs nothing.
          </Alert>
        )}

        <Card padding="md">
          <Card.Body>
            <h3 className={styles.railTitle}>Presets</h3>
            {view.presets.length === 0 ? (
              <p className={styles.prose}>No presets on this account yet. Meals you type still log in one step with Add meal.</p>
            ) : (
              <>
                <ul className={styles.list}>
                  {view.presets.map(preset => (
                    <li key={preset.id} className={styles.railRow}>
                      <span className={styles.railRowLabel}>
                        {preset.name} <span className={styles.railRowWhen}>· used {formatCount(preset.usageCount, 'time', 'times')}</span>
                      </span>
                      <span className={styles.rowValue}>{preset.calories.toLocaleString('en-US')} kcal</span>
                    </li>
                  ))}
                </ul>
                <div className={styles.presetChips} style={{ marginTop: 12 }}>
                  {chipPresets.slice(0, 4).map(preset => (
                    <Button
                      key={preset.id}
                      size="sm"
                      variant={confirmingPreset?.id === preset.id ? 'primary' : 'secondary'}
                      aria-describedby={confirmingPreset?.id === preset.id ? relogStatusId : undefined}
                      loading={isLoggingPreset(preset.id)}
                      disabled={presetsBusy}
                      onClick={() => void logPreset(preset)}
                    >
                      {preset.name}
                    </Button>
                  ))}
                </div>
                <p id={relogStatusId} className={styles.hint} role="status" style={confirmingPreset ? { marginTop: 10 } : undefined}>
                  {confirmingPreset && relogPrompt(confirmingPreset.name)}
                </p>
                <p className={styles.hint} style={{ marginTop: 10 }}>
                  A logged meal keeps the numbers it was logged with. Editing a preset later never changes a past meal.
                </p>
              </>
            )}
          </Card.Body>
        </Card>
      </div>
    </div>
  );
}
