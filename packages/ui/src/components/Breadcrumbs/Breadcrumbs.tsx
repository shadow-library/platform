import { Slot } from '@radix-ui/react-slot';
import { Children, type ComponentPropsWithoutRef, forwardRef, isValidElement, type ReactElement, useContext } from 'react';

import { cn } from '@/lib';

import { Popover } from '../Popover';
import { BreadcrumbsOverflowContext } from './Breadcrumbs.context';
import styles from './Breadcrumbs.module.css';
import { type BreadcrumbsItemProps, type BreadcrumbsProps } from './Breadcrumbs.types';

function SeparatorIcon() {
  return (
    <svg className={styles.separator} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

const BreadcrumbsItem = forwardRef<HTMLAnchorElement, BreadcrumbsItemProps>(function BreadcrumbsItem({ current = false, asChild = false, className, children, ...props }, ref) {
  // Inside the "…" popover the same crumb skins itself as a menu row, so collapsing an ancestor never
  // rebuilds it — asChild router links keep their href and client-side navigation.
  const overflowed = useContext(BreadcrumbsOverflowContext);
  if (current) {
    const { href: _href, target: _target, rel: _rel, download: _download, hrefLang: _hrefLang, ping: _ping, referrerPolicy: _referrerPolicy, type: _type, ...spanProps } = props;
    return (
      <span className={cn(styles.current, className)} aria-current="page" {...(spanProps as ComponentPropsWithoutRef<'span'>)}>
        {children}
      </span>
    );
  }
  const Comp = asChild ? Slot : 'a';
  return (
    <Comp ref={ref} className={cn(overflowed ? styles.overflowItem : styles.link, className)} {...props}>
      {children}
    </Comp>
  );
});

/**
 * `<nav aria-label="Breadcrumb">` around an ordered list; past `maxVisible` the middle collapses into a "…" menu, always keeping the first crumb and the last two. Long
 * labels ellipsise, ancestors first; give a crumb a `title` when its full text matters.
 */
const BreadcrumbsRoot = forwardRef<HTMLElement, BreadcrumbsProps>(function Breadcrumbs({ maxVisible = 4, hideAncestorsBelow, className, children, ...props }, ref) {
  const items = Children.toArray(children).filter(isValidElement) as ReactElement<BreadcrumbsItemProps>[];

  const first = items[0];
  const collapsed = items.length > maxVisible && first != null;
  const hidden = collapsed ? items.slice(1, items.length - 2) : [];
  const visible: (ReactElement<BreadcrumbsItemProps> | 'overflow')[] = collapsed ? [first, 'overflow', ...items.slice(-2)] : items;

  return (
    <nav ref={ref} className={cn(styles.root, className)} aria-label="Breadcrumb" data-hide-ancestors-below={hideAncestorsBelow} {...props}>
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
                  <BreadcrumbsOverflowContext.Provider value={true}>{hidden}</BreadcrumbsOverflowContext.Provider>
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
