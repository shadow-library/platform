import { type FormEvent, type ReactElement, useEffect, useId, useRef, useState } from 'react';
import { Button, Card, FormField, Input, NumberStepper, Select } from '@shadow-library/ui';

import { EntryCapNote } from '@/components/EntryCapNote';
import { type EntryCapAdvisory, MEAL_TYPE_LABELS, mealCaloriesError, type MealPreset, type MealType, type QuickLogCommandResult, useQuickLogCommand } from '@/lib/data';

import { mealLoggedMessage, relogPrompt, runQuickLog } from './quick-log-run';
import styles from './quick-logs.module.css';

export interface MealEntryPanelProps {
  date: string;
  presets: MealPreset[];
  presetsBusy: boolean;
  isLoggingPreset: (presetId: string) => boolean;
  confirmingPresetId: string | null;
  /** Resolves `true` once the preset's meal is saved or queued. */
  onLogPreset: (preset: MealPreset) => Promise<boolean>;
  onSaved: (result: QuickLogCommandResult) => void;
  onClose: () => void;
}

/**
 * Calories are typed. There is no commercial food database behind this field (D15), so zero is a legitimate
 * value — water and black coffee are meals a day can contain.
 */
export function MealEntryPanel({ date, presets, presetsBusy, isLoggingPreset, confirmingPresetId, onLogPreset, onSaved, onClose }: MealEntryPanelProps): ReactElement {
  const command = useQuickLogCommand();
  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [calories, setCalories] = useState<number | null>(0);
  const [mealType, setMealType] = useState<MealType>('cooked');
  const [caloriesTouched, setCaloriesTouched] = useState(false);
  const [draftKey, setDraftKey] = useState(0);
  const [advisory, setAdvisory] = useState<EntryCapAdvisory | null>(null);

  const relogHintId = useId();
  const confirmingPreset = presets.find(preset => preset.id === confirmingPresetId) ?? null;

  const caloriesError = caloriesTouched ? mealCaloriesError(calories) : null;
  const saving = command.isPendingFor(pending => pending.type === 'meal.log');

  useEffect(() => {
    panelRef.current?.scrollIntoView?.({ block: 'nearest' });
    nameRef.current?.focus({ preventScroll: true });
  }, []);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setCaloriesTouched(true);
    const draftName = name.trim();
    if (!draftName || calories === null || mealCaloriesError(calories)) return;

    const run = await runQuickLog(
      command,
      { type: 'meal.log', draft: { date, name: draftName, calories, mealType } },
      { action: 'log', subject: draftName, success: mealLoggedMessage },
    );
    if (run.kind !== 'saved') return;

    onSaved(run.result);
    if (!run.result.advisory?.message) return onClose();
    setAdvisory(run.result.advisory);
    setName('');
    setCalories(0);
    setMealType('cooked');
    setCaloriesTouched(false);
    setDraftKey(key => key + 1);
    nameRef.current?.focus();
  };

  const logPreset = async (preset: MealPreset): Promise<void> => {
    if (await onLogPreset(preset)) onClose();
  };

  return (
    <Card ref={panelRef} className={styles.entryPanel} padding="lg" aria-labelledby="meal-entry-title">
      <Card.Body>
        <form onSubmit={event => void submit(event)} noValidate>
          <h3 className={styles.cardTitle} id="meal-entry-title">
            Add meal
          </h3>

          <div className={styles.entryFields}>
            <FormField className={styles.entryName} label="What was it" required>
              <Input ref={nameRef} size="md" value={name} onValueChange={setName} placeholder="Oats, berries, skyr" autoComplete="off" />
            </FormField>

            <FormField label="Calories" helper="Your estimate. Zero is a valid answer." error={caloriesError}>
              <NumberStepper
                key={draftKey}
                className={styles.caloriesStepper}
                value={calories}
                onValueChange={next => {
                  setCalories(next);
                  setCaloriesTouched(true);
                }}
                min={0}
                clampOnBlur={false}
                step={10}
                precision={0}
                unit="kcal"
                aria-label="Calories"
              />
            </FormField>

            <FormField label="Kind">
              <Select size="md" value={mealType} onValueChange={value => setMealType(value as MealType)} aria-label="Meal kind">
                {(Object.keys(MEAL_TYPE_LABELS) as MealType[]).map(type => (
                  <Select.Item key={type} value={type}>
                    {MEAL_TYPE_LABELS[type]}
                  </Select.Item>
                ))}
              </Select>
            </FormField>
          </div>

          <EntryCapNote advisory={advisory} />

          <div className={styles.actions}>
            <Button type="submit" variant="primary" loading={saving} disabled={!name.trim() || caloriesError !== null}>
              Save meal
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>

          {presets.length > 0 && (
            <div className={styles.entryPresets}>
              <h4 className={styles.railTitle}>Your presets</h4>
              <div className={styles.presetChips}>
                {presets.map(preset => (
                  <Button
                    key={preset.id}
                    type="button"
                    size="sm"
                    variant={confirmingPresetId === preset.id ? 'primary' : 'secondary'}
                    aria-describedby={confirmingPresetId === preset.id ? relogHintId : undefined}
                    loading={isLoggingPreset(preset.id)}
                    disabled={presetsBusy}
                    onClick={() => void logPreset(preset)}
                  >
                    {preset.name} · {preset.calories.toLocaleString('en-US')} kcal
                  </Button>
                ))}
              </div>
              {confirmingPreset && (
                <p id={relogHintId} className={styles.hint} style={{ marginTop: 10 }}>
                  {relogPrompt(confirmingPreset.name)}
                </p>
              )}
            </div>
          )}
        </form>
      </Card.Body>
    </Card>
  );
}
