/**
 * Importing npm packages
 */
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { Children, forwardRef, isValidElement, useContext } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import { AvatarGroupContext } from './Avatar.context';
import styles from './Avatar.module.css';
import { type AvatarGroupProps, type AvatarProps } from './Avatar.types';

/**
 * Declaring the constants
 */

/** First + last initial (single word → first two letters), uppercase, two max. */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) return '';
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  const last = words[words.length - 1] ?? first;
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

/** Stable tint per name — a char-code sum picks one of the two muted palettes. */
function getTint(name: string): 'indigo' | 'neutral' {
  let sum = 0;
  for (const char of name) sum += char.charCodeAt(0);
  return sum % 2 === 0 ? 'indigo' : 'neutral';
}

function DefaultIcon() {
  return (
    <svg viewBox='0 0 24 24' fill='currentColor' aria-hidden='true' width='60%' height='60%'>
      <path d='M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.6 0-8 1.8-8 4.5V20h16v-1.5c0-2.7-4.4-4.5-8-4.5Z' />
    </svg>
  );
}

/**
 * Represents a person, team, or workspace. Falls back image → deterministic initials → generic icon
 * via Radix Avatar (which delays the fallback ~300ms so fast networks never flash initials). Initials
 * are hashed to a fixed muted palette so a name always renders the same tint; the accessible name
 * comes from `alt ?? name` and folds in `presence`, while the visible glyph stays `aria-hidden`.
 */
export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { name = '', src, alt, size: sizeProp, shape = 'circle', presence, icon, className, ...props },
  ref,
) {
  const groupSize = useContext(AvatarGroupContext);
  const size = sizeProp ?? groupSize ?? 'md';
  const initials = getInitials(name);
  const base = alt ?? name;
  const accessibleName = base && presence ? `${base}, ${presence}` : base;

  return (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn(styles.root, className)}
      data-size={size}
      data-shape={shape}
      data-tint={getTint(name)}
      role={accessibleName ? 'img' : undefined}
      aria-label={accessibleName || undefined}
      aria-hidden={accessibleName ? undefined : true}
      {...props}
    >
      {src ? <AvatarPrimitive.Image className={styles.image} src={src} alt='' /> : null}
      <AvatarPrimitive.Fallback className={styles.fallback} delayMs={src ? 300 : undefined} aria-hidden='true'>
        {initials || icon || <DefaultIcon />}
      </AvatarPrimitive.Fallback>
      {presence ? <span className={styles.presence} data-presence={presence} aria-hidden='true' /> : null}
    </AvatarPrimitive.Root>
  );
});

/**
 * Stacks 3–5 avatars with a shared size, overlapping them left-over-right, and collapses the rest
 * into a "+N" counter. Order children by relevance (assignee first).
 */
export const AvatarGroup = forwardRef<HTMLDivElement, AvatarGroupProps>(function AvatarGroup({ max = 5, size = 'md', className, children, ...props }, ref) {
  const items = Children.toArray(children).filter(isValidElement);
  const visible = items.slice(0, max);
  const overflow = items.length - visible.length;

  return (
    <AvatarGroupContext.Provider value={size}>
      <div ref={ref} className={cn(styles.group, className)} {...props}>
        {visible}
        {overflow > 0 ? (
          <span className={cn(styles.root, styles.overflow)} data-size={size} data-shape='circle' role='img' aria-label={`${overflow} more`}>
            +{overflow}
          </span>
        ) : null}
      </div>
    </AvatarGroupContext.Provider>
  );
});
