/**
 * Importing npm packages
 */
import { type ChangeEvent, type ClipboardEvent, forwardRef, type KeyboardEvent, useId, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { useControllableState } from '@/hooks';
import { cn, mergeRefs } from '@/lib';

import styles from './TokenInput.module.css';
import { type TokenInputProps, type TokenValue } from './TokenInput.types';

/**
 * Declaring the constants
 */
function RemoveIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/**
 * A field that collects typed or pasted values — emails, domains, IPs, environment names — as tokens.
 * Pasting a spreadsheet column splits on the separators into many tokens at once; invalid ones stay in
 * place (marked, counted, editable), never silently dropped. Backspace removes the last token and
 * arrow-left selects tokens for keyboard removal. Values cross the API as `{ value, valid }[]`.
 */
export const TokenInput = forwardRef<HTMLInputElement, TokenInputProps>(function TokenInput(
  {
    value,
    defaultValue = [],
    onValueChange,
    validate,
    separators = [',', ';', 'Enter'],
    placeholder = 'Add…',
    size = 'md',
    disabled = false,
    readOnly = false,
    invalid = false,
    maxTokens,
    prefix,
    id,
    className,
    'aria-label': ariaLabel,
  },
  ref,
) {
  const [tokens, setTokens] = useControllableState<TokenValue[]>({ value, defaultValue, onChange: onValueChange });

  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const describedById = useId();

  const charSeparators = separators.filter(token => token.length === 1);
  const commitOnSpace = separators.includes('Space') || separators.includes(' ');

  function validateValue(candidate: string): boolean {
    const result = validate?.(candidate);
    return result === undefined ? true : result === true;
  }

  function commitTokens(next: TokenValue[]): void {
    setTokens(next);
  }

  function addValues(rawValues: string[]): void {
    if (readOnly || disabled) return;
    const additions: TokenValue[] = [];
    for (const raw of rawValues) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (maxTokens != null && tokens.length + additions.length >= maxTokens) break;
      const existingIndex = tokens.findIndex(token => token.value === trimmed);
      if (existingIndex >= 0) {
        setFlash(existingIndex);
        setTimeout(() => setFlash(null), 300);
        continue;
      }
      if (additions.some(token => token.value === trimmed)) continue;
      additions.push({ value: trimmed, valid: validateValue(trimmed) });
    }
    if (additions.length > 0) commitTokens([...tokens, ...additions]);
  }

  function removeAt(index: number): void {
    if (readOnly || disabled) return;
    commitTokens(tokens.filter((_, position) => position !== index));
    setSelected(null);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const text = event.target.value;
    const separator = charSeparators.find(character => text.includes(character));
    if (separator) {
      const parts = text.split(new RegExp(`[${charSeparators.map(character => `\\${character}`).join('')}]`));
      const tail = parts.pop() ?? '';
      addValues(parts);
      setDraft(tail);
    } else {
      setDraft(text);
    }
    setSelected(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    const atStart = inputRef.current?.selectionStart === 0 && inputRef.current?.selectionEnd === 0;
    if ((event.key === 'Enter' && separators.includes('Enter')) || (event.key === ' ' && commitOnSpace)) {
      if (draft.trim()) {
        event.preventDefault();
        addValues([draft]);
        setDraft('');
      }
      return;
    }
    if (event.key === 'Backspace' && draft === '') {
      event.preventDefault();
      if (selected != null) removeAt(selected);
      else if (tokens.length > 0) setSelected(tokens.length - 1);
      return;
    }
    if (event.key === 'ArrowLeft' && draft === '' && tokens.length > 0) {
      event.preventDefault();
      setSelected(current => (current == null ? tokens.length - 1 : Math.max(0, current - 1)));
      return;
    }
    if (event.key === 'ArrowRight' && selected != null) {
      event.preventDefault();
      setSelected(current => (current != null && current < tokens.length - 1 ? current + 1 : null));
      if (selected === tokens.length - 1) inputRef.current?.focus();
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected != null) {
      event.preventDefault();
      removeAt(selected);
      return;
    }
    if (event.key === 'Escape') setSelected(null);
    if (atStart) return;
  }

  function handleBlur(): void {
    if (draft.trim()) {
      addValues([draft]);
      setDraft('');
    }
    setSelected(null);
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>): void {
    const text = event.clipboardData.getData('text');
    if (!/[,;\s\n]/.test(text)) return;
    event.preventDefault();
    addValues(text.split(/[,;\s\n]+/));
    setDraft('');
  }

  const anyInvalid = tokens.some(token => !token.valid);

  return (
    // clicking the field chrome focuses the real input inside it
    // the click only forwards focus to the real input, which owns all keyboard behavior
    <div
      className={cn(styles.root, className)}
      data-size={size}
      data-invalid={invalid || anyInvalid || undefined}
      data-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
      onClick={() => inputRef.current?.focus()}
    >
      {prefix != null ? <span className={styles.prefix}>{prefix}</span> : null}
      {tokens.map((token, index) => (
        <span
          key={`${token.value}-${index}`}
          className={styles.token}
          data-invalid={!token.valid || undefined}
          data-selected={selected === index || undefined}
          data-flash={flash === index || undefined}
        >
          {token.value}
          {!readOnly ? (
            <button
              type="button"
              className={styles.tokenRemove}
              aria-label={`Remove ${token.value}`}
              onClick={() => removeAt(index)}
              onPointerDown={event => event.stopPropagation()}
            >
              <RemoveIcon />
            </button>
          ) : null}
        </span>
      ))}
      <input
        ref={mergeRefs(ref, inputRef)}
        id={id}
        className={styles.input}
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        placeholder={tokens.length === 0 ? placeholder : ''}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={ariaLabel}
        aria-invalid={invalid || anyInvalid || undefined}
        aria-describedby={describedById}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onPaste={handlePaste}
      />
      <span id={describedById} className={styles.srOnly} aria-live="polite">
        {tokens.length} {tokens.length === 1 ? 'value' : 'values'}
        {anyInvalid ? `, ${tokens.filter(token => !token.valid).length} invalid` : ''}
      </span>
    </div>
  );
});
