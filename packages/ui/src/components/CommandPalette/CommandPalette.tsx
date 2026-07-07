/**
 * Importing npm packages
 */
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { Kbd } from '../Kbd';
import styles from './CommandPalette.module.css';
import { type CommandItem, type CommandPaletteProps } from './CommandPalette.types';

/**
 * Declaring the constants
 */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function SearchIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' aria-hidden='true'>
      <circle cx='7' cy='7' r='4.5' />
      <path d='M10.5 10.5L14 14' />
    </svg>
  );
}

/** Match the fold of the label + keywords against the query. */
function matches(command: CommandItem, query: string): boolean {
  if (!query) return true;
  const haystack = fold([command.label, ...(command.keywords ?? [])].join(' '));
  return fold(query)
    .split(/\s+/)
    .every(term => haystack.includes(term));
}

/**
 * The ⌘K accelerator: a Radix Dialog shell (focus trap, Esc, return focus) with a combobox inside
 * (DOM focus stays in the field, highlight moves virtually via aria-activedescendant). Commands are
 * grouped in first-seen order, fuzzy-filtered per keystroke with the first result always highlighted,
 * and run on select — one Enter, one consequence. Kbd hints teach the same shortcuts as the menus. An
 * accelerator, never the only route.
 */
export function CommandPalette({
  commands,
  open,
  defaultOpen = false,
  onOpenChange,
  hotkey = 'mod+k',
  placeholder = 'Type a command or search…',
  emptyMessage = 'No results',
}: CommandPaletteProps) {
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = isControlled ? open : internalOpen;

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  function setOpen(next: boolean): void {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
    if (next) {
      setQuery('');
      setActiveIndex(0);
    }
  }

  // Global hotkey (mod+k by default).
  useEffect(() => {
    if (hotkey == null) return;
    const key = hotkey.split('+').pop()?.toLowerCase();
    const wantsMod = /\bmod\b|\bcmd\b|\bmeta\b/.test(hotkey);
    function onKey(event: globalThis.KeyboardEvent): void {
      if (event.key.toLowerCase() === key && (!wantsMod || event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(!isOpen);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const filtered = useMemo(() => commands.filter(command => matches(command, query)), [commands, query]);
  const groups = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const command of filtered) {
      const bucket = map.get(command.group) ?? [];
      bucket.push(command);
      map.set(command.group, bucket);
    }
    return [...map.entries()].map(([name, items]) => ({ name, items }));
  }, [filtered]);
  const flat = useMemo(() => groups.flatMap(group => group.items), [groups]);
  const indexOf = useMemo(() => new Map(flat.map((command, index) => [command.id, index])), [flat]);

  function run(command: CommandItem): void {
    command.onRun();
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (flat.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => (index + 1) % flat.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => (index - 1 + flat.length) % flat.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(flat.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const command = flat[activeIndex];
      if (command) run(command);
    }
  }

  const activeId = flat.length > 0 ? `${listId}-row-${activeIndex}` : undefined;

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={next => {
        setOpen(next);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={styles.scrim} />
        <div className={styles.positioner}>
          <DialogPrimitive.Content className={styles.panel} aria-describedby={undefined} onOpenAutoFocus={event => event.preventDefault()}>
            <DialogPrimitive.Title className={styles.srOnly}>Command palette</DialogPrimitive.Title>
            <div className={styles.searchRow}>
              <span className={styles.searchIcon}>
                <SearchIcon />
              </span>
              <input
                ref={inputRef}
                className={styles.input}
                type='text'
                role='combobox'
                autoComplete='off'
                spellCheck={false}
                placeholder={placeholder}
                value={query}
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={activeId}
                aria-label='Command palette'
                onChange={event => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                // biome-ignore lint/a11y/noAutofocus: focus belongs in the palette's search field the instant it opens (it is a modal accelerator)
                autoFocus
              />
              <Kbd keys='esc' bare />
            </div>

            <div id={listId} role='listbox' aria-label='Commands' className={styles.list}>
              {flat.length === 0 ? (
                <div className={styles.empty}>
                  {emptyMessage}
                  {query.trim() ? <span className={styles.emptyQuery}> “{query.trim()}”</span> : null}
                </div>
              ) : (
                groups.map(group => (
                  // biome-ignore lint/a11y/useSemanticElements: a listbox option group uses role="group" on a div, not a form fieldset
                  <div key={group.name} role='group' aria-label={group.name} className={styles.group}>
                    <div className={styles.groupLabel}>{group.name}</div>
                    {group.items.map(command => {
                      const index = indexOf.get(command.id) ?? 0;
                      return (
                        // biome-ignore lint/a11y/useFocusableInteractive: virtual option (aria-activedescendant); focus stays in the field
                        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled on the field input
                        <div
                          key={command.id}
                          id={`${listId}-row-${index}`}
                          role='option'
                          aria-selected={activeIndex === index}
                          className={styles.row}
                          data-active={activeIndex === index || undefined}
                          onPointerMove={() => setActiveIndex(index)}
                          onClick={() => run(command)}
                        >
                          {command.icon != null ? <span className={styles.iconTile}>{command.icon}</span> : null}
                          <span className={styles.rowText}>
                            <span className={styles.rowLabel}>{command.label}</span>
                            {command.meta != null ? <span className={styles.rowMeta}>{command.meta}</span> : null}
                          </span>
                          {command.shortcut != null ? <Kbd keys={command.shortcut} /> : null}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className={styles.hintBar}>
              <span className={styles.hint}>
                <Kbd keys='up' bare />
                <Kbd keys='down' bare />
                to navigate
              </span>
              <span className={styles.hint}>
                <Kbd keys='enter' bare />
                to select
              </span>
              <span className={styles.hint}>
                <Kbd keys='esc' bare />
                to close
              </span>
            </div>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
