import { type ReactElement } from 'react';

import { MOODS, type MoodValence } from '@/lib/data';

import styles from './quick-logs.module.css';

export interface MoodPickerProps {
  value: MoodValence | null;
  onChange: (value: MoodValence | null) => void;
}

/** Five points, and pressing the selected one clears it — mood is optional, so it must be un-answerable. */
export function MoodPicker({ value, onChange }: MoodPickerProps): ReactElement {
  return (
    <div className={styles.moodRow} role="group" aria-label="Mood">
      {MOODS.map(mood => (
        <button
          key={mood.value}
          type="button"
          className={styles.moodButton}
          aria-pressed={value === mood.value}
          aria-label={mood.label}
          title={mood.label}
          onClick={() => onChange(value === mood.value ? null : mood.value)}
        >
          <span aria-hidden>{mood.glyph}</span>
        </button>
      ))}
    </div>
  );
}
