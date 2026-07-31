/**
 * Importing npm packages
 */
import { cloneElement, forwardRef, isValidElement, type ReactElement, useId } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import { FormFieldContext } from './FormField.context';
import styles from './FormField.module.css';
import { type FormFieldProps } from './FormField.types';

/**
 * Declaring the constants
 */
function AlertIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 5v3.5M8 11h.01" />
    </svg>
  );
}

/** Props injected into the wrapped control so consumers avoid prop drilling. */
interface InjectedProps {
  id: string;
  invalid?: boolean;
  disabled?: boolean;
  'aria-describedby'?: string;
}

/**
 * The contract between form controls and forms. Renders the label, optionality marker, helper text,
 * and error message, and wires `htmlFor`/`id`, `aria-describedby`, and the invalid/disabled state
 * into the single control it wraps — which is why Input through Switch stay bare. Error replaces
 * helper in the same slot, so the layout never grows a second row of small text.
 */
export const FormField = forwardRef<HTMLDivElement, FormFieldProps>(function FormField(
  { label, helper, error, required = false, optional = false, invalid, disabled = false, className, children, ...props },
  ref,
) {
  const generatedId = useId();
  const child = isValidElement(children) ? (children as ReactElement<InjectedProps>) : null;
  const controlId = child?.props.id ?? generatedId;
  const messageId = `${controlId}-message`;

  const isInvalid = invalid ?? (error != null && error !== false);
  const hasMessage = (isInvalid && error != null && error !== false) || helper != null;
  const describedById = hasMessage ? messageId : undefined;
  const marker = required ? 'Required' : optional ? 'Optional' : null;

  const control = child
    ? cloneElement(child, {
        id: controlId,
        invalid: isInvalid || undefined,
        disabled: disabled || child.props.disabled,
        'aria-describedby': [child.props['aria-describedby'], describedById].filter(Boolean).join(' ') || undefined,
      })
    : children;

  return (
    <FormFieldContext.Provider value={{ controlId, describedById, invalid: isInvalid, disabled }}>
      <div ref={ref} className={cn(styles.root, className)} data-disabled={disabled || undefined} data-invalid={isInvalid || undefined} {...props}>
        {label != null ? (
          <div className={styles.labelRow}>
            <label htmlFor={controlId} className={styles.label}>
              {label}
            </label>
            {marker != null ? <span className={styles.marker}>{marker}</span> : null}
          </div>
        ) : null}
        {control}
        {isInvalid && error != null && error !== false ? (
          <p id={messageId} className={styles.error} role="alert">
            <span className={styles.errorIcon}>
              <AlertIcon />
            </span>
            {error}
          </p>
        ) : helper != null ? (
          <p id={messageId} className={styles.helper}>
            {helper}
          </p>
        ) : null}
      </div>
    </FormFieldContext.Provider>
  );
});
