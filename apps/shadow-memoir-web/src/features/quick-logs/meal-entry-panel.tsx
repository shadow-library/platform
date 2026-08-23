import { type FormEvent, type ReactElement, useState } from 'react';
import { Button, Card, FormField, Input, NumberStepper, Select, toast } from '@shadow-library/ui';

import { EntryCapNote } from '@/components/EntryCapNote';
import { type EntryCapAdvisory, MEAL_TYPE_LABELS, type MealPreset, type MealType, useQuickLogCommand } from '@/lib/data';

import styles from './quick-logs.module.css';

export interface MealEntryPanelProps {
  date: string;
  presets: MealPreset[];
  onClose: () => void;
}

/**
 * Calories are typed. There is no commercial food database behind this field (D15), so zero is a legitimate
 * value — water and black coffee are meals a day can contain.
 */
export function MealEntryPanel({ date, presets, onClose }: MealEntryPanelProps): ReactElement {
  const command = useQuickLogCommand();
  const [name, setName] = useState('');
  const [calories, setCalories] = useState<number | null>(0);
  const [mealType, setMealType] = useState<MealType>('cooked');
  const [advisory, setAdvisory] = useState<EntryCapAdvisory | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!name.trim()) return;

    command.mutate(
      { type: 'meal.log', draft: { date, name: name.trim(), calories: calories ?? 0, mealType } },
      {
        onSuccess: result => {
          setAdvisory(result.advisory ?? null);
          toast.success(result.reward?.rewarded ? `${result.message} First meal today — +${result.reward.xp} XP.` : result.message);
          if (!result.advisory?.message) onClose();
        },
      },
    );
  };

  const logPreset = (preset: MealPreset): void => {
    command.mutate(
      { type: 'meal.logPreset', presetId: preset.id, date },
      {
        onSuccess: result => {
          toast.success(result.message);
          onClose();
        },
      },
    );
  };

  return (
    <Card padding="lg" aria-labelledby="meal-entry-title">
      <form className={styles.padLg} onSubmit={submit}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle} id="meal-entry-title">
            Add meal
          </h3>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <FormField label="What was it" required>
          <Input size="md" value={name} onValueChange={setName} placeholder="Oats, berries, skyr" autoComplete="off" />
        </FormField>

        <div className={styles.formRow}>
          <FormField label="Calories" helper="Your estimate. Zero is a valid answer.">
            <NumberStepper value={calories} onValueChange={setCalories} min={0} step={10} unit="kcal" aria-label="Calories" />
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
          <Button type="submit" variant="primary" loading={command.isPending} disabled={!name.trim()}>
            Save meal
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>

        <div style={{ marginTop: 16 }}>
          <h4 className={styles.railTitle}>Your presets</h4>
          <div className={styles.presetChips}>
            {presets.map(preset => (
              <Button key={preset.id} type="button" size="sm" variant="secondary" onClick={() => logPreset(preset)}>
                {preset.name} · {preset.calories} kcal
              </Button>
            ))}
          </div>
        </div>
      </form>
    </Card>
  );
}
