/**
 * Importing npm packages
 */
import { type KeyboardEvent, useState } from 'react';

/**
 * Importing user defined packages
 */
import { useControllableState } from '@/hooks';
import { cn } from '@/lib';

import styles from './Rating.module.css';
import { type RatingProps } from './Rating.types';

/**
 * Declaring the constants
 */
function StarIcon() {
  return (
    <svg viewBox='0 0 20 20' fill='currentColor' aria-hidden='true'>
      <path d='M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 15l-5.3 2.8 1-5.8L1.5 7.7l5.9-.9L10 1.5Z' />
    </svg>
  );
}

/**
 * A star rating in two modes. Input is a radio group (role="radiogroup" with "1 star"…"n stars"
 * radios — the native one-of-n pattern, form-post compatible): click commits immediately, clicking the
 * current value clears it, arrows move within one focus ring. Display is a single image
 * (role="img" aria-label="Rated 4.3 out of 5") supporting fractional fills — never n separate icons.
 */
export function Rating({
  value,
  defaultValue = 0,
  onValueChange,
  max = 5,
  size = 'md',
  readOnly = false,
  disabled = false,
  invalid = false,
  allowClear = true,
  labels,
  reviewCount,
  'aria-label': ariaLabel,
}: RatingProps) {
  const [current, setCurrent] = useControllableState({ value, defaultValue, onChange: onValueChange });
  const [hover, setHover] = useState<number | null>(null);

  const stars = Array.from({ length: max }, (_, index) => index + 1);

  if (readOnly) {
    const label = ariaLabel ?? `Rated ${current} out of ${max}${reviewCount != null ? `, ${reviewCount} reviews` : ''}`;
    return (
      <div className={styles.root} data-size={size} role='img' aria-label={label}>
        {stars.map(star => {
          const fill = Math.max(0, Math.min(1, current - (star - 1)));
          return (
            <span key={star} className={styles.star} aria-hidden='true'>
              <span className={styles.outline}>
                <StarIcon />
              </span>
              <span className={styles.fill} style={{ width: `${fill * 100}%` }}>
                <StarIcon />
              </span>
            </span>
          );
        })}
      </div>
    );
  }

  function commit(next: number): void {
    setCurrent(next);
  }

  function activate(star: number): void {
    if (disabled) return;
    if (star === current && allowClear) commit(0);
    else commit(star);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (disabled) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      commit(Math.min(max, current + 1));
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      commit(Math.max(0, current - 1));
    }
  }

  const shown = hover ?? current;
  const meaning = labels && shown > 0 ? labels[shown - 1] : undefined;

  return (
    <div className={styles.wrap}>
      <div
        className={cn(styles.root, styles.input)}
        data-size={size}
        data-invalid={invalid || undefined}
        data-disabled={disabled || undefined}
        role='radiogroup'
        aria-label={ariaLabel ?? 'Rating'}
        onKeyDown={handleKeyDown}
        onPointerLeave={() => setHover(null)}
      >
        {stars.map(star => (
          // biome-ignore lint/a11y/useSemanticElements: a star radio can't be a native <input type="radio">; role="radio" buttons in a role="radiogroup" is the sanctioned pattern
          <button
            key={star}
            type='button'
            role='radio'
            aria-checked={current === star}
            aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
            className={styles.starButton}
            data-filled={star <= shown || undefined}
            data-preview={(hover != null && star <= hover) || undefined}
            tabIndex={current === star || (current === 0 && star === 1) ? 0 : -1}
            disabled={disabled}
            onClick={() => activate(star)}
            onPointerEnter={() => setHover(star)}
          >
            <StarIcon />
          </button>
        ))}
      </div>
      {/* Out of flow so the label appearing on hover never reflows the stars (which would land hover on the wrong star). */}
      {labels != null ? <span className={styles.meaning}>{meaning ?? ''}</span> : null}
    </div>
  );
}
