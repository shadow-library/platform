/**
 * Importing npm packages
 */
import * as SliderPrimitive from '@radix-ui/react-slider';
import { forwardRef, useMemo } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './Slider.module.css';
import { type SliderProps } from './Slider.types';

/**
 * A control for bounded, felt magnitudes (thresholds, weights, opacity). Wraps Radix Slider —
 * role="slider" with aria-valuenow/min/max and aria-valuetext for unit-bearing values, keyboard as a
 * first-class input. The value display is mandatory (a slider without a number is a mood, not a
 * control). Track/fill are the Progress pair; the thumb reads surface-card + border-strong + e1.
 */
export const Slider = forwardRef<HTMLSpanElement, SliderProps>(function Slider(
  {
    value,
    defaultValue,
    onValueChange,
    onValueCommit,
    min = 0,
    max = 100,
    step = 1,
    unit,
    formatValue,
    label,
    showValue = true,
    marks = false,
    orientation = 'horizontal',
    disabled = false,
    id,
    className,
    'aria-label': ariaLabel,
  },
  ref,
) {
  const single = !Array.isArray(value ?? defaultValue);
  const arrayValue = useMemo(() => {
    const source = value ?? defaultValue ?? min;
    return Array.isArray(source) ? source : [source];
  }, [value, defaultValue, min]);

  const format = (input: number): string => (formatValue ? formatValue(input) : `${input}${unit ?? ''}`);
  const toOut = (next: number[]): number | number[] => (single ? (next[0] ?? min) : next);

  const display = arrayValue.map(format).join(' – ');

  const markStops = useMemo(() => {
    if (!marks) return [];
    const count = Math.round((max - min) / step);
    if (count > 10 || count < 1) return [];
    return Array.from({ length: count + 1 }, (_, index) => min + index * step);
  }, [marks, min, max, step]);

  return (
    <div className={cn(styles.root, className)} data-disabled={disabled || undefined}>
      {label != null || showValue ? (
        <div className={styles.header}>
          {label != null ? <span className={styles.label}>{label}</span> : <span />}
          {showValue ? <span className={styles.value}>{display}</span> : null}
        </div>
      ) : null}
      <SliderPrimitive.Root
        ref={ref}
        id={id}
        className={styles.slider}
        value={value != null ? arrayValue : undefined}
        defaultValue={value == null ? arrayValue : undefined}
        onValueChange={next => onValueChange?.(toOut(next))}
        onValueCommit={next => onValueCommit?.(toOut(next))}
        min={min}
        max={max}
        step={step}
        orientation={orientation}
        disabled={disabled}
        aria-label={ariaLabel}
      >
        <SliderPrimitive.Track className={styles.track}>
          <SliderPrimitive.Range className={styles.range} />
          {markStops.map(stop => (
            <span key={stop} className={styles.mark} style={{ left: `${((stop - min) / (max - min)) * 100}%` }} aria-hidden='true' />
          ))}
        </SliderPrimitive.Track>
        {arrayValue.map((thumbValue, index) => (
          <SliderPrimitive.Thumb
            key={`thumb-${index}`}
            className={styles.thumb}
            aria-label={ariaLabel ? `${ariaLabel}${arrayValue.length > 1 ? ` ${index === 0 ? 'minimum' : 'maximum'}` : ''}` : undefined}
            aria-valuetext={format(thumbValue)}
          />
        ))}
      </SliderPrimitive.Root>
    </div>
  );
});
