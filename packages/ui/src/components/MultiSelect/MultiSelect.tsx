/**
 * Importing npm packages
 */
import * as Popover from '@radix-ui/react-popover';
import { type KeyboardEvent, type MouseEvent, type ReactElement, useId, useMemo, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { useControllableState } from '@/hooks';
import { CheckIcon, ChevronDownIcon } from '@/icons';
import { cn } from '@/lib';

import styles from './MultiSelect.module.css';
import { type MultiSelectOption, type MultiSelectProps } from './MultiSelect.types';

/**
 * Declaring the constants
 */
function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/**
 * Several values from one list. Built on Radix Popover + an ARIA multi-select listbox (Radix has no
 * multi-select primitive). Differs from Select in three behaviors: items are checkboxes, the list
 * stays open across picks, and the trigger shows values as removable tags with a `+N` overflow.
 */
export function MultiSelect({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = 'Select…',
  size = 'md',
  invalid = false,
  disabled = false,
  maxVisibleTags = 3,
  maxSelected,
  searchable = false,
  selectAll = false,
  clearable = true,
  open,
  defaultOpen,
  onOpenChange,
  id,
  className,
  contentClassName,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
}: MultiSelectProps): ReactElement {
  const [selected, setSelected] = useControllableState<string[]>({ value, defaultValue: defaultValue ?? [], onChange: onValueChange });
  const [isOpen, setOpenState] = useControllableState({ value: open, defaultValue: defaultOpen ?? false, onChange: onOpenChange });

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(option => option.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const enabledFiltered = filtered.filter(option => !option.disabled);
  const allSelected = enabledFiltered.length > 0 && enabledFiltered.every(option => selected.includes(option.value));
  const someSelected = enabledFiltered.some(option => selected.includes(option.value));
  const limitReached = maxSelected != null && selected.length >= maxSelected;

  // Rows the keyboard walks: an optional select-all row followed by the filtered options.
  const rows = useMemo(() => {
    const optionRows = filtered.map(option => ({ kind: 'option' as const, option }));
    return selectAll ? [{ kind: 'all' as const, option: null }, ...optionRows] : optionRows;
  }, [filtered, selectAll]);

  function commit(next: string[]): void {
    setSelected(next);
  }

  function setOpen(next: boolean): void {
    setOpenState(next);
    if (next) {
      setQuery('');
      setActiveIndex(
        selectAll
          ? 0
          : Math.max(
              0,
              filtered.findIndex(option => !option.disabled),
            ),
      );
    }
  }

  function toggle(option: MultiSelectOption): void {
    if (option.disabled) return;
    if (selected.includes(option.value)) {
      commit(selected.filter(v => v !== option.value));
    } else if (!limitReached) {
      commit([...selected, option.value]);
    }
  }

  function toggleSelectAll(): void {
    if (allSelected) {
      const filteredValues = new Set(enabledFiltered.map(option => option.value));
      commit(selected.filter(v => !filteredValues.has(v)));
    } else {
      const additions = enabledFiltered.map(option => option.value).filter(v => !selected.includes(v));
      const room = maxSelected != null ? Math.max(0, maxSelected - selected.length) : additions.length;
      commit([...selected, ...additions.slice(0, room)]);
    }
  }

  function activateRow(index: number): void {
    const row = rows[index];
    if (!row) return;
    if (row.kind === 'all') toggleSelectAll();
    else toggle(row.option);
  }

  function moveActive(delta: number): void {
    if (rows.length === 0) return;
    let next = activeIndex;
    let step = 0;
    while (step < rows.length) {
      next = (next + delta + rows.length) % rows.length;
      const row = rows[next];
      if (row && (row.kind === 'all' || !row.option.disabled)) break;
      step++;
    }
    setActiveIndex(next);
  }

  function handleListKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(rows.length - 1);
    } else if (event.key === 'Enter' || (event.key === ' ' && !searchable)) {
      event.preventDefault();
      activateRow(activeIndex);
    } else if (event.key === 'Backspace' && searchable && query === '' && selected.length > 0) {
      commit(selected.slice(0, -1));
    }
  }

  function removeTag(event: MouseEvent | KeyboardEvent, optionValue: string): void {
    event.stopPropagation();
    commit(selected.filter(v => v !== optionValue));
  }

  const selectedOptions = selected.map(v => options.find(option => option.value === v)).filter((option): option is MultiSelectOption => option != null);
  const visibleTags = selectedOptions.slice(0, maxVisibleTags);
  const overflow = selectedOptions.length - visibleTags.length;
  const isEmpty = selected.length === 0;
  const activeDescendant = rows.length > 0 ? `${listId}-row-${activeIndex}` : undefined;

  return (
    <Popover.Root open={isOpen} onOpenChange={setOpen}>
      <Popover.Trigger
        id={id}
        type="button"
        disabled={disabled}
        className={cn(styles.trigger, className)}
        data-size={size}
        data-invalid={invalid || undefined}
        data-empty={isEmpty || undefined}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
      >
        <span className={styles.tags}>
          {isEmpty ? <span className={styles.placeholder}>{placeholder}</span> : null}
          {visibleTags.map(option => (
            <span key={option.value} className={styles.tag}>
              {option.label}
              {/* a native <button> can't nest inside the trigger button; role="button" span is the valid alternative */}
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Remove ${option.label}`}
                className={styles.tagRemove}
                onPointerDown={event => event.stopPropagation()}
                onClick={event => removeTag(event, option.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') removeTag(event, option.value);
                }}
              >
                <CloseIcon />
              </span>
            </span>
          ))}
          {overflow > 0 ? <span className={styles.overflow}>+{overflow}</span> : null}
        </span>
        <span className={styles.chevron}>
          <ChevronDownIcon />
        </span>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className={cn(styles.content, contentClassName)}
          align="start"
          sideOffset={6}
          onOpenAutoFocus={event => {
            if (!searchable) {
              event.preventDefault();
              listRef.current?.focus();
            }
          }}
        >
          {searchable ? (
            <div className={styles.search}>
              <input
                ref={searchRef}
                className={styles.searchInput}
                type="text"
                placeholder="Search…"
                value={query}
                aria-label="Search options"
                aria-controls={listId}
                aria-activedescendant={activeDescendant}
                onChange={event => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleListKeyDown}
              />
            </div>
          ) : null}

          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            aria-label={ariaLabel ?? 'Options'}
            aria-activedescendant={searchable ? undefined : activeDescendant}
            tabIndex={searchable ? -1 : 0}
            className={styles.list}
            onKeyDown={searchable ? undefined : handleListKeyDown}
          >
            {selectAll ? (
              // options are managed via aria-activedescendant; focus stays on the listbox container
              // keyboard activation is handled on the listbox container, not per option
              <div
                id={`${listId}-row-0`}
                role="option"
                aria-selected={allSelected}
                className={styles.option}
                data-active={activeIndex === 0 || undefined}
                onPointerMove={() => setActiveIndex(0)}
                onClick={toggleSelectAll}
              >
                <span className={styles.checkbox} data-checked={allSelected || undefined} data-indeterminate={!allSelected && someSelected ? 'true' : undefined}>
                  {allSelected ? <CheckIcon strokeWidth={2.5} /> : !allSelected && someSelected ? <span className={styles.dash} /> : null}
                </span>
                <span className={styles.optionLabel}>Select all</span>
              </div>
            ) : null}

            {filtered.length === 0 ? (
              <div className={styles.empty}>No results</div>
            ) : (
              filtered.map((option, optionIndex) => {
                const rowIndex = selectAll ? optionIndex + 1 : optionIndex;
                const checked = selected.includes(option.value);
                const rowDisabled = option.disabled || (limitReached && !checked);
                return (
                  // options are managed via aria-activedescendant; focus stays on the listbox container
                  // keyboard activation is handled on the listbox container, not per option
                  <div
                    key={option.value}
                    id={`${listId}-row-${rowIndex}`}
                    role="option"
                    aria-selected={checked}
                    aria-disabled={rowDisabled || undefined}
                    className={styles.option}
                    data-active={activeIndex === rowIndex || undefined}
                    data-disabled={rowDisabled || undefined}
                    onPointerMove={() => setActiveIndex(rowIndex)}
                    onClick={() => !rowDisabled && toggle(option)}
                  >
                    <span className={styles.checkbox} data-checked={checked || undefined}>
                      {checked ? <CheckIcon strokeWidth={2.5} /> : null}
                    </span>
                    <span className={styles.optionLabel}>{option.label}</span>
                  </div>
                );
              })
            )}

            {clearable || limitReached ? (
              <>
                <div className={styles.divider} />
                <div className={styles.footer}>
                  <span className={styles.count}>{limitReached ? `Max ${maxSelected}` : `${selected.length} selected`}</span>
                  {clearable && selected.length > 0 ? (
                    <button type="button" className={styles.clearAll} onClick={() => commit([])}>
                      Clear all
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
