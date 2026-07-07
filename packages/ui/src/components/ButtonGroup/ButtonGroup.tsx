/**
 * Importing npm packages
 */
import { type FocusEvent, forwardRef, type KeyboardEvent, useEffect, useMemo, useRef } from 'react';

/**
 * Importing user defined packages
 */
import { cn, mergeRefs } from '@/lib';

import { ButtonGroupContext, type ButtonGroupContextValue } from './ButtonGroup.context';
import styles from './ButtonGroup.module.css';
import { type ButtonGroupProps } from './ButtonGroup.types';

/**
 * Declaring the constants
 */

/** Direct children that participate in roving focus — enabled buttons/links only. */
function getRovingItems(container: HTMLElement): HTMLElement[] {
  return Array.from(container.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.matches('button, a, [role="button"]') && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true',
  );
}

/**
 * Fuses related Buttons into a single control through border and radius arithmetic — no new tokens.
 * The group sets one `variant`/`size` that every member inherits (a child's own props are ignored).
 * Pass `role="toolbar"` for a spaced icon cluster with roving-tabindex arrow-key navigation.
 */
export const ButtonGroup = forwardRef<HTMLDivElement, ButtonGroupProps>(function ButtonGroup(
  { variant = 'secondary', size = 'md', attached = true, orientation = 'horizontal', disabled = false, role, className, children, onKeyDown, onFocus, ...props },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isToolbar = role === 'toolbar';
  const contextValue = useMemo<ButtonGroupContextValue>(() => ({ variant, size }), [variant, size]);

  // A fully disabled group is made inert (removed from tab/interaction) and dimmed once by the
  // container — never per child, so the opacity does not stack.
  useEffect(() => {
    containerRef.current?.toggleAttribute('inert', disabled);
  }, [disabled]);

  // Toolbar clusters are one tab stop: the first member is tabbable, the rest wait for the arrows.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isToolbar) return;
    getRovingItems(container).forEach((el, index) => {
      el.tabIndex = index === 0 ? 0 : -1;
    });
  }, [isToolbar]);

  useEffect(() => {
    const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV;
    if (nodeEnv === 'production') return;
    const container = containerRef.current;
    if (!container) return;
    const groupRole = container.getAttribute('role');
    if ((groupRole === 'group' || groupRole === 'toolbar') && !container.hasAttribute('aria-label') && !container.hasAttribute('aria-labelledby'))
      console.warn('ButtonGroup: a role="%s" group needs an `aria-label` or `aria-labelledby` describing the set.', groupRole);
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    onKeyDown?.(event);
    if (!isToolbar || event.defaultPrevented) return;
    const container = containerRef.current;
    if (!container) return;
    const items = getRovingItems(container);
    if (items.length === 0) return;

    const current = items.indexOf(document.activeElement as HTMLElement);
    const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
    const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
    let index: number | null = null;
    if (event.key === nextKey) index = current < 0 ? 0 : (current + 1) % items.length;
    else if (event.key === prevKey) index = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = items.length - 1;
    if (index === null) return;

    event.preventDefault();
    const target = items[index];
    if (!target) return;
    for (const el of items) el.tabIndex = el === target ? 0 : -1;
    target.focus();
  }

  // Keep the tab stop on whichever member the user actually reaches (e.g. by clicking).
  function handleFocus(event: FocusEvent<HTMLDivElement>): void {
    onFocus?.(event);
    if (!isToolbar) return;
    const container = containerRef.current;
    if (!container) return;
    const items = getRovingItems(container);
    const focused = event.target as HTMLElement;
    if (!items.includes(focused)) return;
    for (const el of items) el.tabIndex = el === focused ? 0 : -1;
  }

  const semanticProps = {
    role: role ?? (attached ? 'group' : undefined),
    ...(isToolbar ? { 'aria-orientation': orientation } : {}),
  };

  return (
    <ButtonGroupContext.Provider value={contextValue}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the container always carries a group/toolbar role; the handlers implement toolbar roving-tabindex */}
      <div
        ref={mergeRefs(ref, containerRef)}
        className={cn(styles.root, className)}
        data-attached={attached ? 'true' : 'false'}
        data-orientation={orientation}
        data-disabled={disabled || undefined}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        {...semanticProps}
        {...props}
      >
        {children}
      </div>
    </ButtonGroupContext.Provider>
  );
});
