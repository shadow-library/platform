import { cloneElement, type ReactElement, type ReactNode, useId } from 'react';

import { Input, SegmentedControl } from '@shadow-library/ui';

import { SearchIcon } from '@/components/icons';
import { formatCount, resolveCollectionView, seeAllCount, shouldRenderSection, shouldRenderSegments } from '@/lib/collection-page';

import styles from './CollectionPage.module.css';

export interface CollectionFilter {
  /** Visually hidden label text for the field — screen readers get this, the placeholder is not a label. */
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export interface CollectionSegment {
  value: string;
  label: string;
  count?: number;
}

export interface CollectionSegments {
  /** Accessible name of the radio group. */
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  items: CollectionSegment[];
}

export interface CollectionPageProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Size of the **unfiltered** collection — shown beside the title and the trigger for the `empty` slot. */
  total?: number;
  actions?: ReactNode;
  filter?: CollectionFilter;
  segments?: CollectionSegments;
  /** A page-level banner — a stale-link warning, a counts strip. Pins below the toolbar rather than scrolling away with the body. */
  notice?: ReactNode;
  /** Rendered instead of the toolbar and body when `total` is 0. */
  empty?: ReactNode;
  children: ReactNode;
}

function CollectionPageRoot({ title, subtitle, total, actions, filter, segments, notice, empty, children }: CollectionPageProps): ReactElement {
  const filterId = useId();
  const view = resolveCollectionView(total, empty != null);
  const showSegments = segments != null && shouldRenderSegments(segments.items.length);
  const showToolbar = filter != null || showSegments;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{title}</h1>
            {total !== undefined && <span className={styles.count}>{formatCount(total)}</span>}
          </div>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>

      {notice && <div className={styles.notice}>{notice}</div>}

      {view.kind === 'empty' ? (
        <div className={styles.empty}>{empty}</div>
      ) : (
        <>
          {showToolbar && (
            <div className={styles.toolbar}>
              {filter && (
                <>
                  <label className="sr-only" htmlFor={filterId}>
                    {filter.label}
                  </label>
                  <Input
                    id={filterId}
                    className={styles.filter}
                    type="search"
                    size="sm"
                    clearable
                    prefix={<SearchIcon size={14} />}
                    placeholder={filter.placeholder}
                    value={filter.value}
                    onValueChange={filter.onValueChange}
                  />
                </>
              )}
              {showSegments && segments && (
                <SegmentedControl size="sm" aria-label={segments.label} value={segments.value} onValueChange={segments.onValueChange}>
                  {segments.items.map(item => (
                    <SegmentedControl.Item key={item.value} value={item.value} className={styles.segment}>
                      <span className={styles.segmentLabel}>{item.label}</span>
                      {item.count !== undefined && <span className={styles.segmentCount}>{formatCount(item.count)}</span>}
                    </SegmentedControl.Item>
                  ))}
                </SegmentedControl>
              )}
            </div>
          )}
          <div className={styles.body}>{children}</div>
        </>
      )}
    </div>
  );
}

export interface CollectionSectionProps {
  label: string;
  total: number;
  /** How many of `total` the body below actually renders; a shortfall reveals the "See all" link. */
  shown?: number;
  /** Receives the section's **total**, not the remainder: the label the board draws is "See all 18". */
  seeAll?: (total: number) => ReactNode;
  children: ReactNode;
}

function CollectionSection({ label, total, shown, seeAll, children }: CollectionSectionProps): ReactElement | null {
  const headingId = useId();
  if (!shouldRenderSection(total)) return null;
  const seeAllTotal = shown === undefined ? null : seeAllCount(total, shown);

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionLabel} id={headingId}>
          {label}
        </h2>
        <span className={styles.sectionCount}>{formatCount(total)}</span>
        <span className={styles.sectionRule} aria-hidden="true" />
        {seeAllTotal !== null && seeAll && <span className={styles.sectionSeeAll}>{seeAll(seeAllTotal)}</span>}
      </div>
      {children}
    </section>
  );
}

export type RowActionReveal = 'hover' | 'always';

export interface CollectionRowsProps {
  /** Whether row actions wait for a pointer. `always` suits a list whose actions are the reason it exists. */
  actionReveal?: RowActionReveal;
  children: ReactNode;
}

function CollectionRows({ actionReveal = 'hover', children }: CollectionRowsProps): ReactElement {
  return (
    <ul className={styles.rows} data-reveal={actionReveal}>
      {children}
    </ul>
  );
}

type RowLink = ReactElement<{ className?: string; children?: ReactNode }>;

export interface CollectionRowProps {
  /** The `Link` the row navigates by — cloned with the row's own class and content. Omit it and the row stops being a link, which is how an inline rename reaches its input. */
  link?: RowLink;
  /** Fixed-width lead-in: a chapter number, a status dot, an avatar. */
  leading?: ReactNode;
  /** Never clamped or ellipsised — a row's name may be an identifier whose every character is meaning. */
  title: ReactNode;
  /** The second line of the main stack — a queue reason, a summary. */
  caption?: ReactNode;
  /** Holds a long `caption` to two lines. */
  clampCaption?: boolean;
  /** Chips that sit after the main stack. */
  trailing?: ReactNode;
  /** Right-most tertiary text — a relative time, a word count. */
  meta?: ReactNode;
  /** `RowAction` buttons. They render beside the link, never inside it. */
  actions?: ReactNode;
}

function CollectionRow({ link, leading, title, caption, clampCaption, trailing, meta, actions }: CollectionRowProps): ReactElement {
  const content = (
    <>
      {leading && <span className={styles.rowLeading}>{leading}</span>}
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{title}</span>
        {caption && (
          <span className={styles.rowCaption} data-clamp={clampCaption || undefined}>
            {caption}
          </span>
        )}
      </span>
      {trailing}
      {meta && <span className={styles.rowMeta}>{meta}</span>}
    </>
  );

  return (
    <li className={styles.row} data-actions={actions ? 'true' : undefined}>
      {link ? cloneElement(link, { className: [link.props.className, styles.rowLink].filter(Boolean).join(' ') }, content) : <div className={styles.rowContent}>{content}</div>}
      {actions && <div className={styles.rowActions}>{actions}</div>}
    </li>
  );
}

export const CollectionPage = Object.assign(CollectionPageRoot, { Section: CollectionSection, Rows: CollectionRows, Row: CollectionRow });
