import { Slot, Slottable } from '@radix-ui/react-slot';
import { createContext, forwardRef, type MouseEvent, useCallback, useContext, useMemo, useState } from 'react';

import { cn } from '@/lib';

import styles from './BottomNavigation.module.css';
import { type BottomNavigationItemProps, type BottomNavigationProps } from './BottomNavigation.types';

interface BottomNavigationContextValue {
  selected: string | undefined;
  select: (value: string) => void;
}

const BottomNavigationContext = createContext<BottomNavigationContextValue | null>(null);

/** A `nav` landmark of plain tab stops, not a tablist: the selected item carries `aria-current="page"`. Render below the md breakpoint. */
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
