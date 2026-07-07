/**
 * Importing npm packages
 */
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { forwardRef, useId } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './Switch.module.css';
import { type SwitchProps } from './Switch.types';

/**
 * Declaring the constants
 */

/**
 * On/off with immediate effect — no Save button. Built on Radix Switch (`role="switch"`, announced
 * "on/off"). Use for live system state; use Checkbox for choices that commit on submit. With a
 * `label` it renders the settings-row (label left, switch right); `pending` shows the async flip.
 */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch({ label, description, pending = false, id, className, disabled, ...props }, ref) {
  const generatedId = useId();
  const switchId = id ?? generatedId;
  const descriptionId = description != null ? `${switchId}-description` : undefined;

  const control = (
    <SwitchPrimitive.Root
      ref={ref}
      id={switchId}
      className={cn(styles.switch, label == null && className)}
      disabled={disabled}
      data-pending={pending || undefined}
      aria-describedby={descriptionId}
      {...props}
    >
      <SwitchPrimitive.Thumb className={styles.thumb} />
    </SwitchPrimitive.Root>
  );

  if (label == null) return control;

  return (
    <div className={cn(styles.root, className)} data-disabled={disabled || undefined}>
      <div className={styles.text}>
        <label htmlFor={switchId} className={styles.label}>
          {label}
        </label>
        {description != null ? (
          <span id={descriptionId} className={styles.description}>
            {description}
          </span>
        ) : null}
      </div>
      {control}
    </div>
  );
});
