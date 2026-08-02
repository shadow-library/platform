/**
 * Importing npm packages
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { cn } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { LockIcon } from '@/components/icons';
import { wikiIndexQueryOptions } from '@/lib/apis';

import { WikiEntryCard } from './wiki-entry-card';
import styles from './wiki.module.css';

/**
 * Defining types
 */
export interface WikiPreviewProps {
  slug: string;
  /** Cap on how many cards the strip shows before "Browse full wiki" — the index route has the rest. */
  limit?: number;
}

/**
 * Declaring the constants
 *
 * The novel screen's "Wiki" tab: a compact preview of the unlocked roster with the same two empty states as
 * the full index (no wiki at all vs. wiki exists but locked), always ending in a link to the full wiki index.
 */
export function WikiPreview({ slug, limit = 8 }: WikiPreviewProps): React.JSX.Element {
  const wiki = useQuery(wikiIndexQueryOptions(slug));

  if (!wiki.data) return <div />;

  const { items, lockedCount } = wiki.data;
  const noWikiAtAll = items.length === 0 && lockedCount === 0;
  const everythingLocked = items.length === 0 && lockedCount > 0;
  const visible = items.slice(0, limit);

  if (noWikiAtAll) {
    return (
      <div className={styles.emptyBox}>
        <div className={styles.emptyTitle}>No wiki yet</div>
        <p className={styles.emptyText}>This novel doesn’t have a lore wiki yet — check back later.</p>
      </div>
    );
  }

  if (everythingLocked) {
    return (
      <div className={styles.emptyBox}>
        <div className={styles.emptyTitle}>Nothing unlocked yet</div>
        <p className={styles.emptyText}>
          {lockedCount.toLocaleString()} wiki {lockedCount === 1 ? 'entry exists' : 'entries exist'} for this novel, but stay spoiler-locked until you read further.
        </p>
      </div>
    );
  }

  return (
    <div>
      {lockedCount > 0 && (
        <div className={styles.lockedBanner}>
          <LockIcon size={16} />
          <span>
            {lockedCount.toLocaleString()} more {lockedCount === 1 ? 'entry unlocks' : 'entries unlock'} as you read.
          </span>
        </div>
      )}
      <div className={cn(styles.hscroll, 'wn-hscroll')}>
        {visible.map(entry => (
          <WikiEntryCard key={entry.entryKey} slug={slug} entry={entry} className={styles.previewCard} />
        ))}
      </div>
      <div className={styles.previewFoot}>
        <Link to="/novels/$slug/wiki" params={{ slug }} className={styles.backLink}>
          Browse full wiki
        </Link>
      </div>
    </div>
  );
}
