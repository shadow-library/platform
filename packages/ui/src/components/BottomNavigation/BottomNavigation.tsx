/**
 * Importing npm packages
 */
import { Slot, Slottable } from '@radix-ui/react-slot';
import { createContext, forwardRef, type MouseEvent, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './BottomNavigation.module.css';
import { type BottomNavigationItemProps, type BottomNavigationProps } from './BottomNavigation.types';

/**
 * Defining types
 */
interface BottomNavigationContextValue {
  selected: string | undefined;
  select: (value: string) => void;
}

/**
 * Declaring the constants
 */
const BottomNavigationContext = createContext<BottomNavigationContextValue | null>(null);

/**
 * The mobile app-shell's primary navigation: a bottom-pinned bar of 3–5 top-level destinations,
 * each an icon over an always-visible label. It is a `nav` landmark of plain tab stops (not a
 * tablist) — the selected item carries `aria-current="page"`. The bar pads itself past the home
 * indicator; pair `asChild` items with router links so destinations are real navigations.
 * The desktop siblings are `Sidebar` and `TopNavigation`; render this below the md breakpoint.
 */
const BottomNavigationRoot = forwardRef<HTMLElement, BottomNavigationProps>(function BottomNavigation(
  { value, defaultValue, onValueChange, fixed = true, 'aria-label': ariaLabel = 'Primary', className, children, ...props },
  ref,
) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const isControlled = value !== undefined;
  const selected = isControlled ? value : uncontrolled;

  const select = useCallback(
    (next: string): void => {
      if (!isControlled) setUncontrolled(next);
      onValueChange?.(next);
    },
    [isControlled, onValueChange],
  );
  const context = useMemo(() => ({ selected, select }), [selected, select]);

  return (
    <nav ref={ref} className={cn(styles.root, className)} aria-label={ariaLabel} data-fixed={fixed || undefined} {...props}>
      <BottomNavigationContext.Provider value={context}>{children}</BottomNavigationContext.Provider>
    </nav>
  );
});

const BottomNavigationItem = forwardRef<HTMLButtonElement, BottomNavigationItemProps>(function BottomNavigationItem(
  { value, icon, label, badge, asChild = false, type, className, onClick, children, ...props },
  ref,
) {
  const context = useContext(BottomNavigationContext);
  const selected = context?.selected === value;

  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    onClick?.(event);
    if (!event.defaultPrevented) context?.select(value);
  }

  const content = (
    <>
      <span className={styles.iconWrap}>
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
        {badge != null ? <span className={styles.badge}>{badge}</span> : null}
      </span>
      <span className={styles.label}>{label}</span>
    </>
  );

  const shared = {
    className: cn(styles.item, className),
    'data-selected': selected || undefined,
    'aria-current': selected ? ('page' as const) : undefined,
    onClick: handleClick,
  };

  // asChild renders the consumer's element (e.g. a router link) and slots the icon/label into it.
  if (asChild) {
    return (
      <Slot ref={ref} {...shared} {...props}>
        <Slottable>{children}</Slottable>
        {content}
      </Slot>
    );
  }

  return (
    <button ref={ref} type={type ?? 'button'} {...shared} {...props}>
      {content}
    </button>
  );
});

export const BottomNavigation = Object.assign(BottomNavigationRoot, { Item: BottomNavigationItem });
