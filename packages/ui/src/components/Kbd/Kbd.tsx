/**
 * Importing npm packages
 */
import { forwardRef, useEffect, useState } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './Kbd.module.css';
import { type KbdProps } from './Kbd.types';

/**
 * Declaring the constants
 */
interface Cap {
  glyph: string;
  spoken: string;
  rank: number;
}

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac OS X/.test(navigator.userAgent);
}

/** Resolve one token to its glyph + spoken form; `rank` sorts modifiers into ⌃ ⌥ ⇧ ⌘ order before keys. */
function resolveToken(token: string, mac: boolean): Cap {
  switch (token) {
    case 'mod':
    case 'cmd':
    case 'meta':
    case 'command':
      return mac ? { glyph: '⌘', spoken: 'Command', rank: 3 } : { glyph: 'Ctrl', spoken: 'Control', rank: 3 };
    case 'ctrl':
    case 'control':
      return { glyph: mac ? '⌃' : 'Ctrl', spoken: 'Control', rank: 0 };
    case 'alt':
    case 'option':
      return mac ? { glyph: '⌥', spoken: 'Option', rank: 1 } : { glyph: 'Alt', spoken: 'Alt', rank: 1 };
    case 'shift':
      return { glyph: '⇧', spoken: 'Shift', rank: 2 };
    case 'enter':
    case 'return':
      return { glyph: '↵', spoken: 'Enter', rank: 4 };
    case 'backspace':
      return { glyph: '⌫', spoken: 'Backspace', rank: 4 };
    case 'delete':
    case 'del':
      return { glyph: '⌦', spoken: 'Delete', rank: 4 };
    case 'escape':
    case 'esc':
      return { glyph: 'Esc', spoken: 'Escape', rank: 4 };
    case 'tab':
      return { glyph: 'Tab', spoken: 'Tab', rank: 4 };
    case 'space':
      return { glyph: 'Space', spoken: 'Space', rank: 4 };
    case 'up':
      return { glyph: '↑', spoken: 'Up', rank: 4 };
    case 'down':
      return { glyph: '↓', spoken: 'Down', rank: 4 };
    case 'left':
      return { glyph: '←', spoken: 'Left', rank: 4 };
    case 'right':
      return { glyph: '→', spoken: 'Right', rank: 4 };
    default:
      return { glyph: token.length === 1 ? token.toUpperCase() : token.charAt(0).toUpperCase() + token.slice(1), spoken: token.toUpperCase(), rank: 4 };
  }
}

function parseKeys(keys: string, mac: boolean): Cap[] {
  return keys
    .split('+')
    .map(part => part.trim().toLowerCase())
    .filter(Boolean)
    .map((token, index) => ({ token, index }))
    .map(({ token, index }) => ({ ...resolveToken(token, mac), index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
}

/**
 * A keyboard shortcut in a costume — static text, never interactive or focusable. Renders a semantic
 * `<kbd>`. The `keys` binding string maps to platform glyphs (⌘ on macOS, Ctrl elsewhere), modifiers
 * ordered ⌃ ⌥ ⇧ ⌘, symbols over words. Boxed by default; `bare` for tooltips and menu rows. A spoken
 * accessible name is supplied so ⌘ reads "Command", not "place of interest" — pass `aria-hidden` when
 * the host control already announces the shortcut.
 */
export const Kbd = forwardRef<HTMLElement, KbdProps>(function Kbd({ keys, bare = false, mac, className, children, ...props }, ref) {
  // `detectMac` reads `navigator`, which is absent (or reflects the server OS) during SSR. Render the
  // non-Mac glyphs on the server and the first client render, then resolve the real platform after
  // mount so hydration always matches. Callers can pass `mac` to pin it deterministically.
  const [detectedMac, setDetectedMac] = useState(false);
  useEffect(() => {
    if (mac === undefined) setDetectedMac(detectMac());
  }, [mac]);
  const isMac = mac ?? detectedMac;
  const caps = keys != null ? parseKeys(keys, isMac) : [];
  const spoken = caps.length > 0 ? caps.map(cap => cap.spoken).join(' ') : undefined;

  return (
    <kbd ref={ref} className={cn(styles.root, className)} data-bare={bare || undefined} aria-label={spoken} {...props}>
      {keys != null
        ? caps.map((cap, index) => (
            <span key={`${cap.glyph}-${index}`} className={styles.cap}>
              {cap.glyph}
            </span>
          ))
        : children}
    </kbd>
  );
});
