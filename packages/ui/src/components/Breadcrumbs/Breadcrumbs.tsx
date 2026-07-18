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
import styles from './Breadcrumbs.module.css';
import { type BreadcrumbsItemProps, type BreadcrumbsProps } from './Breadcrumbs.types';

/**
 * Declaring the constants
 */
function SeparatorIcon() {
  return (
    <svg className={styles.separator} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

/** A single crumb — a ghost-pill link, or plain text with aria-current when `current`. */
const BreadcrumbsItem = forwardRef<HTMLAnchorElement, BreadcrumbsItemProps>(function BreadcrumbsItem({ current = false, asChild = false, className, children, ...props }, ref) {
  if (current) {
    return (
      <span className={cn(styles.current, className)} aria-current="page">
        {children}
      </span>
    );
  }
  const Comp = asChild ? Slot : 'a';
  return (
    <Comp ref={ref} className={cn(styles.link, className)} {...props}>
      {children}
    </Comp>
  );
});

/**
 * The WAI-ARIA breadcrumb pattern: a `<nav aria-label="Breadcrumb">` around an ordered list, current
 * page carrying aria-current. Separators are decorative aria-hidden chevrons (never text "/"). Past
 * `maxVisible` levels the middle collapses into a "…" button that opens a menu of the hidden ancestors,
 * always preserving the first crumb and the last two.
 */
const BreadcrumbsRoot = forwardRef<HTMLElement, BreadcrumbsProps>(function Breadcrumbs({ maxVisible = 4, className, children, ...props }, ref) {
  const items = Children.toArray(children).filter(isValidElement) as ReactElement<BreadcrumbsItemProps>[];

  const first = items[0];
  const collapsed = items.length > maxVisible && first != null;
  const hidden = collapsed ? items.slice(1, items.length - 2) : [];
  const visible: (ReactElement<BreadcrumbsItemProps> | 'overflow')[] = collapsed ? [first, 'overflow', ...items.slice(-2)] : items;

  return (
    <nav ref={ref} className={cn(styles.root, className)} aria-label="Breadcrumb" {...props}>
      <ol className={styles.list}>
        {visible.map((item, index) => (
          <li key={`crumb-${index}`} className={styles.crumb}>
            {index > 0 ? <SeparatorIcon /> : null}
            {item === 'overflow' ? (
              <Popover>
                <Popover.Trigger asChild>
                  <button type="button" className={styles.overflow} aria-label={`Show ${hidden.length} hidden levels`}>
                    …
                  </button>
                </Popover.Trigger>
                <Popover.Content className={styles.overflowMenu} style={{ padding: 4, minWidth: 180 }} align="start" aria-label="Hidden levels">
                  {hidden.map((crumb, hiddenIndex) => (
                    <a key={`hidden-${hiddenIndex}`} href={crumb.props.href} className={styles.overflowItem}>
                      {crumb.props.children}
                    </a>
                  ))}
                </Popover.Content>
              </Popover>
            ) : (
              item
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
});

export const Breadcrumbs = Object.assign(BreadcrumbsRoot, {
  Item: BreadcrumbsItem,
});
