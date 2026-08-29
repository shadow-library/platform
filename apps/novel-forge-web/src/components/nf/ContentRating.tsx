import { CONTENT_RATING_LEVEL_LABELS, CONTENT_RATING_LEVELS, type ContentRating, type ContentRatingDimension, type ContentRatingLevel } from '@shadow-library/sdk';
import { FormField, Select } from '@shadow-library/ui';
import { type ReactElement } from 'react';

import styles from './nf.module.css';

export const UNRATED = '__unrated__';

export interface RatingFieldProps<D extends ContentRatingDimension> {
  label: string;
  helper: string;
  dimension: D;
  value: ContentRatingLevel<D> | typeof UNRATED;
  onValueChange: (value: ContentRatingLevel<D> | typeof UNRATED) => void;
  error?: string;
}

// "Unrated" is a first-class option, not the same as the mildest real level — a novel nobody has
// characterised must never be published as if someone had confirmed it clean.
export function RatingField<D extends ContentRatingDimension>({ label, helper, dimension, value, onValueChange, error }: RatingFieldProps<D>): ReactElement {
  return (
    <FormField label={label} error={error} helper={value === UNRATED ? `${helper} Not yet characterised.` : helper}>
      <Select value={value} onValueChange={next => onValueChange(next as ContentRatingLevel<D> | typeof UNRATED)} size="sm">
        <Select.Item value={UNRATED} description="Nobody has assessed this dimension yet">
          Unrated
        </Select.Item>
        <Select.Separator />
        {CONTENT_RATING_LEVELS[dimension].map(level => (
          <Select.Item key={level} value={level}>
            {CONTENT_RATING_LEVEL_LABELS[level]}
          </Select.Item>
        ))}
      </Select>
    </FormField>
  );
}

export interface ContentRatingPickerProps {
  value: ContentRating;
  onValueChange: (value: ContentRating) => void;
}

/** Three independent optional dimensions; an unset one is dropped from the body rather than sent as `'none'`. */
export function ContentRatingPicker({ value, onValueChange }: ContentRatingPickerProps): ReactElement {
  const { sexualContent, violence, darkContent } = value;
  return (
    <div className={styles.ratingGrid}>
      <RatingField
        label="Sexual content"
        helper="How explicit this chapter gets."
        dimension="sexualContent"
        value={sexualContent ?? UNRATED}
        onValueChange={next => onValueChange({ violence, darkContent, sexualContent: next === UNRATED ? undefined : next })}
      />
      <RatingField
        label="Violence"
        helper="How graphic the violence gets."
        dimension="violence"
        value={violence ?? UNRATED}
        onValueChange={next => onValueChange({ sexualContent, darkContent, violence: next === UNRATED ? undefined : next })}
      />
      <RatingField
        label="Dark content"
        helper="Abuse, self-harm, cruelty."
        dimension="darkContent"
        value={darkContent ?? UNRATED}
        onValueChange={next => onValueChange({ sexualContent, violence, darkContent: next === UNRATED ? undefined : next })}
      />
    </div>
  );
}
