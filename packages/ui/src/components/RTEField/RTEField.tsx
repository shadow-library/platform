/**
 * Importing npm packages
 */
import { createContext, forwardRef, type KeyboardEvent, useContext, useEffect, useId, useState } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import { Tag } from '../Tag';
import styles from './RTEField.module.css';
import {
  type RTEFieldAttachmentsProps,
  type RTEFieldContentProps,
  type RTEFieldContextValue,
  type RTEFieldFooterProps,
  type RTEFieldProps,
  type RTEFieldToolbarButtonProps,
  type RTEFieldToolbarProps,
} from './RTEField.types';

/**
 * Declaring the constants
 */
const RTEFieldContext = createContext<RTEFieldContextValue | null>(null);

/** Access the field's a11y ids and state to wire an engine's editable element (aria-labelledby, etc.). */
export function useRTEField(): RTEFieldContextValue {
  const context = useContext(RTEFieldContext);
  if (!context) throw new Error('useRTEField must be used within an RTEField');
  return context;
}

function FullscreenIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {active ? <path d="M6 2.5V6H2.5M10 2.5V6h3.5M6 13.5V10H2.5M10 13.5V10h3.5" /> : <path d="M2.5 6V2.5H6M13.5 6V2.5H10M2.5 10v3.5H6M13.5 10v3.5H10" />}
    </svg>
  );
}

/**
 * The field chrome around a rich-text engine — TipTap, Lexical, or ProseMirror mounts inside and the
 * wrapper makes it behave like every other Shadow UI form control (label, validation, focus, counter).
 * Its boundary of ownership is everything outside the engine's content element; it never reaches into
 * the document model. The whole frame takes the focus-field ring whenever focus is anywhere inside —
 * one field, one boundary. The editable element wires its own ARIA via `useRTEField`.
 */
const RTEFieldRoot = forwardRef<HTMLDivElement, RTEFieldProps>(function RTEField(
  {
    label,
    required = false,
    description,
    error,
    length,
    maxLength,
    countMode = 'characters',
    readOnly = false,
    disabled = false,
    fullscreenEnabled = false,
    fullscreen,
    onFullscreenChange,
    className,
    children,
    ...props
  },
  ref,
) {
  const labelId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const hasError = error === true || (typeof error === 'string' && error.length > 0);
  const errorMessage = typeof error === 'string' ? error : undefined;

  const isFsControlled = fullscreen !== undefined;
  const [fsInternal, setFsInternal] = useState(false);
  const isFullscreen = isFsControlled ? fullscreen : fsInternal;

  function setFullscreen(next: boolean): void {
    if (!isFsControlled) setFsInternal(next);
    onFullscreenChange?.(next);
  }

  // Esc leaves fullscreen.
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const overLimit = maxLength != null && length != null && length > maxLength;
  const nearLimit = maxLength != null && length != null && !overLimit && length >= maxLength * 0.9;
  const counterState = overLimit ? 'error' : nearLimit ? 'warning' : undefined;
  const invalid = hasError || overLimit;

  const context: RTEFieldContextValue = {
    labelId,
    descriptionId: description != null ? descriptionId : undefined,
    errorId: errorMessage ? errorId : undefined,
    disabled,
    readOnly,
    invalid,
  };

  const showCounter = !readOnly && maxLength != null && length != null;

  return (
    <RTEFieldContext.Provider value={context}>
      {isFullscreen ? <button type="button" className={styles.scrim} aria-label="Exit fullscreen" onClick={() => setFullscreen(false)} /> : null}
      <div ref={ref} className={cn(styles.field, className)} data-fullscreen={isFullscreen || undefined} {...props}>
        {!readOnly ? (
          <div className={styles.labelRow}>
            <span className={styles.label} id={labelId}>
              {label}
              {required ? (
                <span className={styles.required} aria-hidden="true">
                  {' '}
                  *
                </span>
              ) : null}
            </span>
            {showCounter ? (
              <span className={styles.counter} data-state={counterState} aria-hidden="true">
                {length}
                {countMode === 'words' ? ' words' : ''} / {maxLength}
              </span>
            ) : null}
          </div>
        ) : (
          <span className={styles.srOnly} id={labelId}>
            {label}
          </span>
        )}

        {description != null && !readOnly ? (
          <div className={styles.description} id={descriptionId}>
            {description}
          </div>
        ) : null}

        <div className={styles.frame} data-readonly={readOnly || undefined} data-disabled={disabled || undefined} aria-invalid={invalid || undefined}>
          {fullscreenEnabled && !readOnly ? (
            <button
              type="button"
              className={styles.fullscreenToggle}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              aria-pressed={isFullscreen}
              onClick={() => setFullscreen(!isFullscreen)}
            >
              <FullscreenIcon active={isFullscreen} />
            </button>
          ) : null}
          {children}
        </div>

        {errorMessage ? (
          <div className={styles.errorLine} id={errorId} role="alert">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <circle cx="8" cy="8" r="6.25" />
              <path d="M8 5v3.4M8 10.8v.1" strokeLinecap="round" />
            </svg>
            {errorMessage}
          </div>
        ) : null}
      </div>
    </RTEFieldContext.Provider>
  );
});

/** Toolbar region — one tab stop; arrow keys rove between the toggle buttons (ARIA toolbar pattern). */
const RTEFieldToolbar = forwardRef<HTMLDivElement, RTEFieldToolbarProps>(function RTEFieldToolbar({ className, onKeyDown, ...props }, ref) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    onKeyDown?.(event);
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    const active = document.activeElement as HTMLButtonElement | null;
    const current = active ? buttons.indexOf(active) : -1;
    if (current === -1) return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = buttons[(current + delta + buttons.length) % buttons.length];
    next?.focus();
  }

  return <div ref={ref} className={cn(styles.toolbar, className)} role="toolbar" aria-label="Formatting" onKeyDown={handleKeyDown} {...props} />;
});

const RTEFieldToolbarButton = forwardRef<HTMLButtonElement, RTEFieldToolbarButtonProps>(function RTEFieldToolbarButton({ className, pressed, type, ...props }, ref) {
  return <button ref={ref} type={type ?? 'button'} className={cn(styles.toolbarButton, className)} aria-pressed={pressed} data-pressed={pressed || undefined} {...props} />;
});

const RTEFieldToolbarDivider = forwardRef<HTMLDivElement, { className?: string }>(function RTEFieldToolbarDivider({ className }, ref) {
  return <div ref={ref} className={cn(styles.toolbarDivider, className)} aria-hidden="true" />;
});

const RTEFieldContent = forwardRef<HTMLDivElement, RTEFieldContentProps>(function RTEFieldContent({ className, ...props }, ref) {
  return <div ref={ref} className={cn(styles.content, className)} {...props} />;
});

const RTEFieldAttachments = forwardRef<HTMLDivElement, RTEFieldAttachmentsProps>(function RTEFieldAttachments({ value, onRemove, className, ...props }, ref) {
  if (value.length === 0) return null;
  return (
    <div ref={ref} className={cn(styles.attachments, className)} {...props}>
      {value.map(file => (
        <Tag key={file.id} size="sm" onRemove={onRemove ? () => onRemove(file.id) : undefined}>
          {file.label}
        </Tag>
      ))}
    </div>
  );
});

const RTEFieldFooter = forwardRef<HTMLDivElement, RTEFieldFooterProps>(function RTEFieldFooter({ className, ...props }, ref) {
  return <div ref={ref} className={cn(styles.footer, className)} {...props} />;
});

export const RTEField = Object.assign(RTEFieldRoot, {
  Toolbar: RTEFieldToolbar,
  ToolbarButton: RTEFieldToolbarButton,
  ToolbarDivider: RTEFieldToolbarDivider,
  Content: RTEFieldContent,
  Attachments: RTEFieldAttachments,
  Footer: RTEFieldFooter,
});

export { RTEFieldAttachments, RTEFieldContent, RTEFieldFooter, RTEFieldToolbar, RTEFieldToolbarButton, RTEFieldToolbarDivider };
