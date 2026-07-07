/**
 * Importing npm packages
 */
import * as Popover from '@radix-ui/react-popover';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './ColorPicker.module.css';
import { type ColorPickerProps } from './ColorPicker.types';

/**
 * Declaring the constants
 */
const DEFAULT_PALETTE = [
  { label: 'Indigo', value: '#4f46e5' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Amber', value: '#d97706' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Pink', value: '#db2777' },
  { label: 'Purple', value: '#7c3aed' },
  { label: 'Slate', value: '#475569' },
];

/** Normalize loose hex input to `#rrggbb`, or null when it doesn't parse. */
function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(raw)) {
    return `#${raw
      .split('')
      .map(character => character + character)
      .join('')}`;
  }
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  return null;
}

/** Black or white check color by the swatch's perceived luminance. */
function contrastColor(hex: string): string {
  const value = normalizeHex(hex) ?? '#000000';
  const r = Number.parseInt(value.slice(1, 3), 16);
  const g = Number.parseInt(value.slice(3, 5), 16);
  const b = Number.parseInt(value.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#000000' : '#ffffff';
}

function CheckIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={2.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M3 8.5l3.5 3.5L13 5' />
    </svg>
  );
}

/**
 * A swatch trigger + a palette panel on hex values. Palette swatches are a radiogroup, each named by
 * its meaning ("Indigo", "Team purple"), never a bare hex; the selected swatch shows a luminance-aware
 * check. The hex field holds the last valid color and never stores garbage (invalid input shows the
 * danger field). Committed custom colors join a deduped, last-8 recent row. (An HSV spectrum is a
 * future layer.)
 */
export function ColorPicker({
  value,
  defaultValue = '#4f46e5',
  onValueChange,
  onCommit,
  palette = DEFAULT_PALETTE,
  size = 'md',
  disabled = false,
  className,
  'aria-label': ariaLabel = 'Color',
}: ColorPickerProps) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue);
  const current = isControlled ? value : internal;

  const [open, setOpen] = useState(false);
  const [hexText, setHexText] = useState(current);
  const [hexInvalid, setHexInvalid] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  function change(next: string): void {
    if (!isControlled) setInternal(next);
    onValueChange?.(next);
    setHexInvalid(false);
  }

  function commit(next: string): void {
    change(next);
    setHexText(next);
    onCommit?.(next);
    setRecent(list => [next, ...list.filter(entry => entry !== next)].slice(0, 8));
  }

  function selectSwatch(hex: string): void {
    commit(hex);
    setOpen(false);
  }

  function handleHexChange(next: string): void {
    setHexText(next);
    const normalized = normalizeHex(next);
    if (normalized) change(normalized);
    else setHexInvalid(true);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={next => {
        if (disabled) return;
        setOpen(next);
        if (!next) {
          setHexText(current);
          setHexInvalid(false);
        }
      }}
    >
      <Popover.Trigger asChild>
        <button type='button' className={cn(styles.trigger, className)} data-size={size} disabled={disabled} aria-label={`${ariaLabel}: ${current}`} aria-haspopup='dialog'>
          <span className={styles.triggerSwatch} style={{ background: current }} />
          <span className={styles.triggerHex}>{current}</span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content className={styles.content} align='start' sideOffset={4} role='dialog' aria-label={`Choose ${ariaLabel.toLowerCase()}`}>
          <div className={styles.palette} role='radiogroup' aria-label='Palette'>
            {palette.map(swatch => {
              const selected = normalizeHex(swatch.value) === normalizeHex(current);
              return (
                // biome-ignore lint/a11y/useSemanticElements: a color swatch is a colored button, not an <input type="radio">
                <button
                  key={swatch.value}
                  type='button'
                  role='radio'
                  aria-checked={selected}
                  aria-label={swatch.label}
                  className={styles.swatch}
                  data-selected={selected || undefined}
                  style={{ background: swatch.value }}
                  onClick={() => selectSwatch(swatch.value)}
                >
                  {selected ? (
                    <span className={styles.swatchCheck} style={{ color: contrastColor(swatch.value) }}>
                      <CheckIcon />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <label className={styles.hexRow}>
            <span className={styles.hexPreview} style={{ background: hexInvalid ? 'transparent' : current }} />
            <input
              className={styles.hexInput}
              data-invalid={hexInvalid || undefined}
              value={hexText}
              aria-label='Hex color'
              spellCheck={false}
              onChange={event => handleHexChange(event.target.value)}
            />
          </label>

          {recent.length > 0 ? (
            <div className={styles.recent}>
              {recent.map(color => (
                <button
                  key={color}
                  type='button'
                  className={styles.recentSwatch}
                  aria-label={`Recent ${color}`}
                  style={{ background: color }}
                  onClick={() => selectSwatch(color)}
                />
              ))}
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
