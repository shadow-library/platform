/**
 * Importing npm packages
 */
import { Slot } from '@radix-ui/react-slot';
import { Children, forwardRef, isValidElement, type ReactElement } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import { Popover } from '../Popover';
import styles from './TopNavigation.module.css';
import { type TopNavigationItemProps, type TopNavigationProps } from './TopNavigation.types';

/**
 * A destination link; the active one draws a 2px accent underline over the bar's bottom border and
 * carries aria-current (the underline is presentation only).
 */
const TopNavigationItem = forwardRef<HTMLAnchorElement, TopNavigationItemProps>(function TopNavigationItem(
  { active = false, asChild = false, className, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'a';
  return (
    <Comp ref={ref} className={cn(styles.link, className)} data-active={active || undefined} aria-current={active ? 'page' : undefined} {...props}>
      {children}
    </Comp>
  );
});

/**
 * A flat top navigation bar for shallow IA (≤ 7 destinations, no groups — use Sidebar when nesting
 * appears). A nav landmark of links with a single active underline; links past `maxVisible` collapse,
 * order preserved, into a "More" menu that keeps every destination in the accessibility tree. Bar is
 * surface-card with a border-default bottom edge (App Shell's header recipe).
 */
const TopNavigationRoot = forwardRef<HTMLElement, TopNavigationProps>(function TopNavigation(
  { brand, utility, maxVisible, className, children, 'aria-label': ariaLabel = 'Main', ...props },
  ref,
) {
  const items = Children.toArray(children).filter(isValidElement) as ReactElement<TopNavigationItemProps>[];
  const overflow = maxVisible != null && items.length > maxVisible ? items.slice(maxVisible) : [];
  const visible = overflow.length > 0 ? items.slice(0, maxVisible) : items;
  const overflowActive = overflow.some(item => item.props.active);

  return (
    <nav ref={ref} className={cn(styles.bar, className)} aria-label={ariaLabel} {...props}>
      {brand != null ? <div className={styles.brand}>{brand}</div> : null}
      <div className={styles.links}>
        {visible}
        {overflow.length > 0 ? (
          <Popover>
            <Popover.Trigger asChild>
              <button type='button' className={styles.link} data-active={overflowActive || undefined} aria-label='More links'>
                More
              </button>
            </Popover.Trigger>
            <Popover.Content className={styles.moreMenu} style={{ padding: 4, minWidth: 180 }} align='end' aria-label='More links'>
              {overflow.map(item => (
                <a
                  key={item.key}
                  href={item.props.href}
                  className={styles.moreItem}
                  data-active={item.props.active || undefined}
                  aria-current={item.props.active ? 'page' : undefined}
                >
                  {item.props.children}
                </a>
              ))}
            </Popover.Content>
          </Popover>
        ) : null}
      </div>
      {utility != null ? <div className={styles.utility}>{utility}</div> : null}
    </nav>
  );
});

export const TopNavigation = Object.assign(TopNavigationRoot, {
  Item: TopNavigationItem,
});
