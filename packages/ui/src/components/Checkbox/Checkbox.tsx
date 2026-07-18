/**
 * Importing npm packages
 */
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { forwardRef, useId } from 'react';

/**
 * Importing user defined packages
 */
import { CheckIcon } from '@/icons';
import { cn } from '@/lib';

import styles from './Checkbox.module.css';
import { type CheckboxProps } from './Checkbox.types';

/**
 * Declaring the constants
 */
function DashIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
      <path d="M3.5 8h9" />
    </svg>
  );
}

/**
 * Independent on/off choice that commits with the form (use Switch for instant effects, Radio for
 * exclusive ones). Built on Radix Checkbox — the 16px box, 4px radius, and accent fill defined here
 * are reused by Multi Select, table row selection, and Tree checkboxes. Supports `indeterminate`.
 */
export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox({ label, description, invalid = false, id, className, disabled, checked, ...props }, ref) {
  const generatedId = useId();
  const boxId = id ?? generatedId;
  const descriptionId = description != null ? `${boxId}-description` : undefined;
  const isIndeterminate = checked === 'indeterminate';

  const box = (
    <CheckboxPrimitive.Root
      ref={ref}
      id={boxId}
      className={cn(styles.box, label == null && className)}
      disabled={disabled}
      checked={checked}
      data-invalid={invalid || undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={descriptionId}
      {...props}
    >
      <CheckboxPrimitive.Indicator className={styles.indicator}>{isIndeterminate ? <DashIcon /> : <CheckIcon strokeWidth={2.5} />}</CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (label == null) return box;

  return (
    <div className={cn(styles.root, className)} data-disabled={disabled || undefined}>
      {box}
      <div className={styles.text}>
        <label htmlFor={boxId} className={styles.label}>
          {label}
        </label>
        {description != null ? (
          <span id={descriptionId} className={styles.description}>
            {description}
          </span>
        ) : null}
      </div>
    </div>
  );
});
