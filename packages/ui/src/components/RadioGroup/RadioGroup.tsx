/**
 * Importing npm packages
 */
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { forwardRef, useId } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import { RadioGroupContext, useRadioGroupContext } from './RadioGroup.context';
import styles from './RadioGroup.module.css';
import { type RadioGroupProps, type RadioItemProps } from './RadioGroup.types';

/**
 * Declaring the constants
 */

/**
 * One choice from a small, always-visible set — the circular sibling of Checkbox with exclusive
 * semantics, built on Radix RadioGroup. The group is one tab stop; arrows move and select in a
 * single gesture (native roving tabindex). Compose with `RadioGroup.Item`.
 */
const RadioGroupRoot = forwardRef<HTMLDivElement, RadioGroupProps>(function RadioGroup({ label, invalid = false, className, children, ...props }, ref) {
  const labelId = useId();
  return (
    <RadioGroupContext.Provider value={{ invalid }}>
      <RadioGroupPrimitive.Root
        ref={ref}
        className={cn(styles.group, className)}
        aria-labelledby={label != null ? labelId : undefined}
        aria-invalid={invalid || undefined}
        {...props}
      >
        {label != null ? (
          <span id={labelId} className={styles.groupLabel}>
            {label}
          </span>
        ) : null}
        {children}
      </RadioGroupPrimitive.Root>
    </RadioGroupContext.Provider>
  );
});

const RadioItem = forwardRef<HTMLButtonElement, RadioItemProps>(function RadioItem({ label, description, id, className, disabled, ...props }, ref) {
  const { invalid } = useRadioGroupContext();
  const generatedId = useId();
  const itemId = id ?? generatedId;
  const descriptionId = description != null ? `${itemId}-description` : undefined;

  return (
    <div className={cn(styles.item, className)} data-disabled={disabled || undefined}>
      <RadioGroupPrimitive.Item ref={ref} id={itemId} className={styles.circle} disabled={disabled} data-invalid={invalid || undefined} aria-describedby={descriptionId} {...props}>
        <RadioGroupPrimitive.Indicator className={styles.dot} />
      </RadioGroupPrimitive.Item>
      <div className={styles.text}>
        <label htmlFor={itemId} className={styles.label}>
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

/** Compound RadioGroup: the root plus `.Item`. */
export const RadioGroup = Object.assign(RadioGroupRoot, { Item: RadioItem });

export { RadioItem };
