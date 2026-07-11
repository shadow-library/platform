/**
 * Importing npm packages
 */
import * as Popover from '@radix-ui/react-popover';
import { type KeyboardEvent, type PointerEvent, useState } from 'react';

/**
 * Importing user defined packages
 */
import { useControllableState } from '@/hooks';
import { CheckIcon, ChevronDownIcon } from '@/icons';
import { cn } from '@/lib';

import styles from './ColorPicker.module.css';
import { type ColorPickerProps } from './ColorPicker.types';

/**
 * Declaring the constants
 */
const DEFAULT_PALETTE = [
  { label: 'Red', value: '#dc2626' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Amber', value: '#d97706' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Teal', value: '#0d9488' },
  { label: 'Sky', value: '#0284c7' },
  { label: 'Indigo', value: '#4f46e5' },
  { label: 'Violet', value: '#7c3aed' },
  { label: 'Fuchsia', value: '#c026d3' },
  { label: 'Pink', value: '#db2777' },
  { label: 'Slate', value: '#525866' },
  { label: 'Ink', value: '#111214' },
  { label: 'Rose tint', value: '#fecaca' },
  { label: 'Amber tint', value: '#fde68a' },
  { label: 'Green tint', value: '#bbf7d0' },
  { label: 'Indigo tint', value: '#c7d2fe' },
];

type Hsv = { h: number; s: number; v: number };

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const clamp01 = (value: number): number => clamp(value, 0, 1);
const round = (value: number): number => Math.round(value);

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

function hexToRgb(hex: string): [number, number, number] {
  const value = normalizeHex(hex) ?? '#000000';
  return [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const channel = (n: number): string =>
    round(clamp(n, 0, 255))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: (max === 0 ? 0 : delta / max) * 100, v: max * 100 };
}

function hsvToRgb({ h, s, v }: Hsv): [number, number, number] {
  const sn = s / 100;
  const vn = v / 100;
  const c = vn * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = vn - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const hexToHsv = (hex: string): Hsv => rgbToHsv(...hexToRgb(hex));
const hsvToHex = (hsv: Hsv): string => rgbToHex(...hsvToRgb(hsv));

/** Relative-luminance WCAG contrast ratio between two hex colors. */
function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string): number => {
    const channel = (c: number): number => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const [r, g, b] = hexToRgb(hex);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white check color by the swatch's perceived luminance. */
function contrastColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#000000' : '#ffffff';
}

/**
 * A swatch trigger opening a palette-first surface. Curated swatches are a radiogroup, each named by its
 * meaning ("Indigo", "Team purple"), never a bare hex. When `allowCustom`, a "Custom…" disclosure reveals
 * the spectrum — a 2-D saturation/brightness field plus a hue slider, both pointer- and keyboard-driven —
 * with the hex field as the guaranteed non-pointer path. Color math runs in HSV and serializes to hex; the
 * value only ever holds a valid color. Committed custom colors join a deduped, last-8 recent row.
 * (Alpha and RGB/HSL text formats are documented follow-ups.)
 */
export function ColorPicker({
  value,
  defaultValue = '#4f46e5',
  onValueChange,
  onCommit,
  palette = DEFAULT_PALETTE,
  allowCustom = true,
  contrastAgainst,
  size = 'md',
  disabled = false,
  className,
  'aria-label': ariaLabel = 'Color',
}: ColorPickerProps) {
  const [current, setCurrent] = useControllableState({ value, defaultValue, onChange: onValueChange });

  const hasPalette = palette.length > 0;
  const [open, setOpen] = useState(false);
  const [hexText, setHexText] = useState(current);
  const [hexInvalid, setHexInvalid] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [showCustom, setShowCustom] = useState(!hasPalette);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(current));

  const spectrumVisible = allowCustom && (!hasPalette || showCustom);

  // Sets the value live but leaves the hex text alone — so typing in the hex field is never re-mangled.
  function setColor(next: string): void {
    setCurrent(next);
    setHexInvalid(false);
  }

  // Spectrum/palette/hue paths reflect the color back into the hex field as they set it.
  function apply(next: string): void {
    setColor(next);
    setHexText(next.toUpperCase());
  }

  function commit(next: string): void {
    apply(next);
    onCommit?.(next);
    setRecent(list => [next, ...list.filter(entry => entry !== next)].slice(0, 8));
  }

  function selectSwatch(hex: string): void {
    setHsv(hexToHsv(hex));
    commit(hex);
    setOpen(false);
  }

  function handleHexChange(next: string): void {
    setHexText(next);
    const normalized = normalizeHex(next);
    if (normalized) {
      setColor(normalized);
      setHsv(hexToHsv(normalized));
    } else {
      setHexInvalid(true);
    }
  }

  function commitHex(): void {
    const normalized = normalizeHex(hexText);
    if (normalized) commit(normalized);
    else {
      setHexText(current);
      setHexInvalid(false);
    }
  }

  function updateHsv(next: Hsv): void {
    setHsv(next);
    apply(hsvToHex(next));
  }

  // Pointer drag on the 2-D field (saturation ← x, brightness ← y) or the hue track (hue ← x).
  function startDrag(event: PointerEvent<HTMLDivElement>, axis: 'field' | 'hue'): void {
    if (disabled) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const base = hsv;
    let last = base;
    const move = (clientX: number, clientY: number): void => {
      last =
        axis === 'field'
          ? { h: base.h, s: clamp01((clientX - rect.left) / rect.width) * 100, v: (1 - clamp01((clientY - rect.top) / rect.height)) * 100 }
          : { h: clamp01((clientX - rect.left) / rect.width) * 360, s: base.s, v: base.v };
      updateHsv(last);
    };
    move(event.clientX, event.clientY);
    const onMove = (ev: globalThis.PointerEvent): void => move(ev.clientX, ev.clientY);
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      commit(hsvToHex(last));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function fieldKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.shiftKey ? 10 : 1;
    let { s, v } = hsv;
    if (event.key === 'ArrowLeft') s = clamp(s - step, 0, 100);
    else if (event.key === 'ArrowRight') s = clamp(s + step, 0, 100);
    else if (event.key === 'ArrowUp') v = clamp(v + step, 0, 100);
    else if (event.key === 'ArrowDown') v = clamp(v - step, 0, 100);
    else if (event.key === 'Enter') {
      event.preventDefault();
      commit(hsvToHex(hsv));
      return;
    } else {
      return;
    }
    event.preventDefault();
    updateHsv({ h: hsv.h, s, v });
  }

  function hueKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.shiftKey ? 10 : 1;
    let h = hsv.h;
    if (event.key === 'ArrowLeft') h = clamp(h - step, 0, 360);
    else if (event.key === 'ArrowRight') h = clamp(h + step, 0, 360);
    else if (event.key === 'Enter') {
      event.preventDefault();
      commit(hsvToHex(hsv));
      return;
    } else {
      return;
    }
    event.preventDefault();
    updateHsv({ ...hsv, h });
  }

  const pureHue = hsvToHex({ h: hsv.h, s: 100, v: 100 });
  const ratio = contrastAgainst ? contrastRatio(current, contrastAgainst) : null;
  const verdict = ratio == null ? null : ratio >= 4.5 ? 'pass' : ratio >= 3 ? 'large' : 'fail';

  return (
    <Popover.Root
      open={open}
      onOpenChange={next => {
        if (disabled) return;
        setOpen(next);
        if (next) {
          setHexText(current);
          setHexInvalid(false);
          setHsv(hexToHsv(current));
          setShowCustom(!hasPalette);
        }
      }}
    >
      <Popover.Trigger asChild>
        <button type='button' className={cn(styles.trigger, className)} data-size={size} disabled={disabled} aria-label={`${ariaLabel}: ${current}`} aria-haspopup='dialog'>
          <span className={styles.triggerSwatch} style={{ background: current }} />
          <span className={styles.triggerHex}>{current}</span>
          <span className={styles.triggerChevron} aria-hidden='true'>
            <ChevronDownIcon />
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content className={styles.content} align='start' sideOffset={4} role='dialog' aria-label={`Choose ${ariaLabel.toLowerCase()}`}>
          {hasPalette ? (
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
                        <CheckIcon strokeWidth={2.5} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {hasPalette && allowCustom ? (
            <button type='button' className={styles.customToggle} aria-expanded={showCustom} onClick={() => setShowCustom(shown => !shown)}>
              Custom…
            </button>
          ) : null}

          {spectrumVisible ? (
            <div className={styles.spectrum}>
              <div
                className={styles.field2d}
                role='slider'
                tabIndex={disabled ? -1 : 0}
                aria-label='Saturation and brightness'
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={round(hsv.s)}
                aria-valuetext={`Saturation ${round(hsv.s)}%, brightness ${round(hsv.v)}%`}
                style={{ backgroundColor: pureHue }}
                onPointerDown={event => startDrag(event, 'field')}
                onKeyDown={fieldKeyDown}
              >
                <span className={styles.field2dThumb} style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, background: current }} />
              </div>
              <div
                className={styles.hue}
                role='slider'
                tabIndex={disabled ? -1 : 0}
                aria-label='Hue'
                aria-valuemin={0}
                aria-valuemax={360}
                aria-valuenow={round(hsv.h)}
                aria-valuetext={`Hue ${round(hsv.h)} degrees`}
                onPointerDown={event => startDrag(event, 'hue')}
                onKeyDown={hueKeyDown}
              >
                <span className={styles.hueThumb} style={{ left: `${(hsv.h / 360) * 100}%`, background: pureHue }} />
              </div>
            </div>
          ) : null}

          <label className={styles.hexRow}>
            <span className={styles.hexPreview} style={{ background: hexInvalid ? 'transparent' : current }} />
            <input
              className={styles.hexInput}
              data-invalid={hexInvalid || undefined}
              value={hexText}
              aria-label='Hex color'
              spellCheck={false}
              autoCapitalize='off'
              inputMode='text'
              onChange={event => handleHexChange(event.target.value)}
              onBlur={commitHex}
              onKeyDown={event => {
                if (event.key === 'Enter') commitHex();
              }}
            />
          </label>

          {ratio != null ? (
            <div className={styles.contrast} data-verdict={verdict} role='status'>
              <span className={styles.contrastDot} style={{ background: current }} />
              {ratio.toFixed(2)}:1 · {verdict === 'pass' ? 'AA' : verdict === 'large' ? 'AA large text' : 'below 3:1'}
            </div>
          ) : null}

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
