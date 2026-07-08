/**
 * Importing npm packages
 */
import * as Popover from '@radix-ui/react-popover';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './Combobox.module.css';
import { type ComboboxOption, type ComboboxProps } from './Combobox.types';

/**
 * Declaring the constants
 */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function ChevronIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M4 6.5L8 10.5L12 6.5' />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={2.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M3 8.5l3.5 3.5L13 5' />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' aria-hidden='true'>
      <path d='M4 4l8 8M12 4l-8 8' />
    </svg>
  );
}

/**
 * A typeahead single-select: Input's field + Select's listbox, and the only novelty is that typing
 * filters. Implements the ARIA 1.2 combobox pattern on Radix Popover (no Radix combobox primitive) —
 * DOM focus stays in the field while the highlight moves virtually via aria-activedescendant. Enter
 * always commits the highlighted (first-matched) row; blur reverts to the last committed label so
 * free text never persists silently. `onSearch` swaps the list for debounced async results.
 */
export function Combobox({
  options = [],
  value,
  defaultValue = null,
  onValueChange,
  onSearch,
  placeholder = 'Search…',
  size = 'md',
  invalid = false,
  disabled = false,
  readOnly = false,
  clearable = true,
  creatable = false,
  onCreate,
  loading = false,
  emptyMessage = 'No results',
  prefix,
  id,
  className,
  contentClassName,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
}: ComboboxProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<string | null>(defaultValue);
  const selectedValue = isControlled ? value : internalValue;

  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [committedLabel, setCommittedLabel] = useState('');
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [asyncOptions, setAsyncOptions] = useState<ComboboxOption[]>([]);
  const [searching, setSearching] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const isAsync = onSearch != null;

  // Interactions on the field itself (input, chevron, clear) are the trigger, not an outside dismiss —
  // without this guard Radix closes the popover on the same pointer-down that opened it, so it flickers
  // shut unless typing keeps reopening it.
  const isInsideField = (target: EventTarget | null): boolean => target instanceof Node && (fieldRef.current?.contains(target) ?? false);

  // Keep the field's committed label in sync with a value we can resolve from static options.
  useEffect(() => {
    if (open) return;
    const option = options.find(candidate => candidate.value === selectedValue);
    if (option) {
      setCommittedLabel(option.label);
      setInputValue(option.label);
    } else if (selectedValue == null) {
      setCommittedLabel('');
      setInputValue('');
    }
  }, [selectedValue, open, options]);

  // Debounced async search.
  useEffect(() => {
    if (!isAsync || !open) return;
    setSearching(true);
    const handle = setTimeout(async () => {
      const results = await onSearch(query);
      setAsyncOptions(results);
      setSearching(false);
      setActiveIndex(0);
    }, 300);
    return () => clearTimeout(handle);
  }, [query, open, isAsync, onSearch]);

  const filtered = useMemo(() => {
    if (isAsync) return asyncOptions;
    const q = fold(query.trim());
    return q ? options.filter(option => fold(option.label).includes(q)) : options;
  }, [isAsync, asyncOptions, options, query]);

  const showCreate = creatable && query.trim().length > 0 && !filtered.some(option => fold(option.label) === fold(query.trim()));
  const rowCount = filtered.length + (showCreate ? 1 : 0);
  const busy = loading || searching;

  function commit(option: ComboboxOption): void {
    if (option.disabled) return;
    if (!isControlled) setInternalValue(option.value);
    onValueChange?.(option.value);
    setCommittedLabel(option.label);
    setInputValue(option.label);
    setQuery('');
    setOpen(false);
  }

  function activate(index: number): void {
    if (showCreate && index === filtered.length) {
      onCreate?.(query.trim());
      setOpen(false);
      return;
    }
    const option = filtered[index];
    if (option) commit(option);
  }

  function clear(): void {
    if (!isControlled) setInternalValue(null);
    onValueChange?.(null);
    setCommittedLabel('');
    setInputValue('');
    setQuery('');
    inputRef.current?.focus();
  }

  function moveActive(delta: number): void {
    if (rowCount === 0) return;
    let next = activeIndex;
    for (let step = 0; step < rowCount; step++) {
      next = (next + delta + rowCount) % rowCount;
      const option = filtered[next];
      if (next >= filtered.length || !option?.disabled) break;
    }
    setActiveIndex(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      else moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Home' && open) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End' && open) {
      event.preventDefault();
      setActiveIndex(rowCount - 1);
    } else if (event.key === 'Enter') {
      if (open) {
        event.preventDefault();
        activate(activeIndex);
      }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setInputValue(committedLabel);
      setQuery('');
    }
  }

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    if (next) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.select());
    } else {
      setInputValue(committedLabel);
      setQuery('');
    }
  }

  const activeDescendant = open && rowCount > 0 ? `${listId}-row-${activeIndex}` : undefined;

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Anchor asChild>
        <div
          ref={fieldRef}
          className={cn(styles.field, className)}
          data-size={size}
          data-invalid={invalid || undefined}
          data-disabled={disabled || undefined}
          data-readonly={readOnly || undefined}
        >
          {prefix != null ? <span className={styles.prefix}>{prefix}</span> : null}
          <input
            ref={inputRef}
            id={id}
            className={styles.input}
            type='text'
            role='combobox'
            autoComplete='off'
            spellCheck={false}
            placeholder={placeholder}
            value={inputValue}
            disabled={disabled}
            readOnly={readOnly}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete='list'
            aria-activedescendant={activeDescendant}
            aria-invalid={invalid || undefined}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledby}
            onChange={event => {
              setInputValue(event.target.value);
              setQuery(event.target.value);
              setActiveIndex(0);
              if (!open) setOpen(true);
            }}
            onFocus={() => {
              if (!disabled && !readOnly) setOpen(true);
            }}
            onKeyDown={handleKeyDown}
          />
          {clearable && selectedValue != null && !disabled && !readOnly ? (
            <button type='button' className={styles.clear} aria-label='Clear' onClick={clear} onPointerDown={event => event.preventDefault()}>
              <ClearIcon />
            </button>
          ) : null}
          <button
            type='button'
            className={styles.chevron}
            tabIndex={-1}
            aria-label={open ? 'Close options' : 'Open options'}
            disabled={disabled}
            onPointerDown={event => event.preventDefault()}
            onClick={() => {
              if (disabled || readOnly) return;
              // Open explicitly rather than leaning on the input's focus handler: after a close the input
              // still holds focus, so focus() fires no focus event and the popover would never reopen.
              if (open) {
                setOpen(false);
              } else {
                setOpen(true);
                inputRef.current?.focus();
              }
            }}
          >
            <ChevronIcon />
          </button>
        </div>
      </Popover.Anchor>

      <Popover.Portal>
        <Popover.Content
          className={cn(styles.content, contentClassName)}
          align='start'
          sideOffset={4}
          onOpenAutoFocus={event => event.preventDefault()}
          onPointerDownOutside={event => {
            if (isInsideField(event.detail.originalEvent.target)) event.preventDefault();
          }}
          onFocusOutside={event => {
            if (isInsideField(event.detail.originalEvent.target)) event.preventDefault();
          }}
        >
          <div className={styles.srOnly} aria-live='polite'>
            {busy ? 'Searching…' : `${filtered.length} results`}
          </div>
          <div id={listId} role='listbox' aria-label={ariaLabel ?? 'Options'} aria-busy={busy || undefined} className={styles.list}>
            {busy ? (
              Array.from({ length: 3 }, (_, index) => (
                <div key={`skeleton-${index}`} className={styles.skeletonRow}>
                  <span className={styles.skeleton} />
                </div>
              ))
            ) : filtered.length === 0 && !showCreate ? (
              <div className={styles.empty}>
                {emptyMessage}
                {query.trim() ? <span className={styles.emptyQuery}> “{query.trim()}”</span> : null}
              </div>
            ) : (
              filtered.map((option, index) => {
                const selected = option.value === selectedValue;
                return (
                  // biome-ignore lint/a11y/useFocusableInteractive: options are virtual (aria-activedescendant); focus stays in the field
                  // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard activation is handled on the field input, not per option
                  <div
                    key={option.value}
                    id={`${listId}-row-${index}`}
                    role='option'
                    aria-selected={selected}
                    aria-disabled={option.disabled || undefined}
                    className={styles.option}
                    data-active={activeIndex === index || undefined}
                    data-disabled={option.disabled || undefined}
                    data-rich={option.description != null || option.media != null || undefined}
                    onPointerMove={() => setActiveIndex(index)}
                    onClick={() => commit(option)}
                  >
                    {option.media != null ? <span className={styles.media}>{option.media}</span> : null}
                    <span className={styles.optionText}>
                      <span className={styles.optionLabel}>{option.label}</span>
                      {option.description != null ? <span className={styles.optionDescription}>{option.description}</span> : null}
                    </span>
                    <span className={styles.check}>{selected ? <CheckIcon /> : null}</span>
                  </div>
                );
              })
            )}

            {showCreate && !busy ? (
              // biome-ignore lint/a11y/useFocusableInteractive: virtual option (aria-activedescendant); focus stays in the field
              // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard activation handled on the field input
              <div
                id={`${listId}-row-${filtered.length}`}
                role='option'
                aria-selected={false}
                className={cn(styles.option, styles.create)}
                data-active={activeIndex === filtered.length || undefined}
                onPointerMove={() => setActiveIndex(filtered.length)}
                onClick={() => activate(filtered.length)}
              >
                Create “{query.trim()}”
              </div>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
