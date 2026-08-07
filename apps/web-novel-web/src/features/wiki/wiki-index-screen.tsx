import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { cn } from '@shadow-library/ui';

import { BackIcon, BookIcon, LockIcon } from '@/components/icons';
import { getProgress, novelQueryOptions, sessionQueryOptions, wikiIndexQueryOptions } from '@/lib/apis';

import { WIKI_TYPE_LABEL, WikiEntryCard } from './wiki-entry-card';
import styles from './wiki.module.css';

const route = getRouteApi('/_shell/novels/$slug_/wiki');

export function WikiIndexScreen(): React.JSX.Element {
  const { slug } = route.useParams();
  const router = useRouter();
  const novel = useQuery(novelQueryOptions(slug));
  const wiki = useQuery(wikiIndexQueryOptions(slug));
  const session = useQuery(sessionQueryOptions());
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const availableTypes = useMemo(() => [...new Set((wiki.data?.items ?? []).map(item => item.type))], [wiki.data]);
  const items = useMemo(() => {
    const all = wiki.data?.items ?? [];
    return typeFilter ? all.filter(item => item.type === typeFilter) : all;
  }, [wiki.data, typeFilter]);

  if (!wiki.data) return <div className={styles.content} />;

  const progress = getProgress(slug, session.data?.userId);
  const lockedCount = wiki.data.lockedCount;
  const noWikiAtAll = wiki.data.items.length === 0 && lockedCount === 0;
  const everythingLocked = wiki.data.items.length === 0 && lockedCount > 0;

  return (
    <div className={cn(styles.content, 'wn-fade')}>
      <button type="button" className={styles.backLink} onClick={() => router.history.back()}>
        <BackIcon size={16} /> Back
      </button>

      <div className={styles.header}>
        <h1 className={styles.title}>{novel.data ? `${novel.data.title} — Wiki` : 'Wiki'}</h1>
        <p className={styles.subtitle}>Characters, factions, locations, and lore — unlocked as you read.</p>
      </div>

      {lockedCount > 0 && !everythingLocked && (
        <div className={styles.lockedBanner}>
          <LockIcon size={16} />
          <span>
            {lockedCount.toLocaleString()} more {lockedCount === 1 ? 'entry unlocks' : 'entries unlock'} as you read.
          </span>
        </div>
      )}

      {noWikiAtAll && (
        <div className={styles.emptyBox}>
          <div className={styles.emptyTitle}>No wiki yet</div>
          <p className={styles.emptyText}>This novel doesn’t have a lore wiki yet — check back later.</p>
        </div>
      )}

      {everythingLocked && (
        <div className={styles.emptyBox}>
          <div className={styles.emptyTitle}>Nothing unlocked yet</div>
          <p className={styles.emptyText}>
            {lockedCount.toLocaleString()} wiki {lockedCount === 1 ? 'entry exists' : 'entries exist'} for this novel, but stay spoiler-locked until you read further.
          </p>
        </div>
      )}

      {!noWikiAtAll && !everythingLocked && (
        <>
          {availableTypes.length > 1 && (
            <div className={styles.typeRow}>
              <button type="button" className={cn(styles.typeChip, typeFilter === null && styles.typeChipActive)} onClick={() => setTypeFilter(null)}>
                All
              </button>
              {availableTypes.map(type => (
                <button key={type} type="button" className={cn(styles.typeChip, typeFilter === type && styles.typeChipActive)} onClick={() => setTypeFilter(type)}>
                  {WIKI_TYPE_LABEL[type]}
                </button>
              ))}
            </div>
          )}

          <div className={styles.grid}>
            {items.map(entry => (
              <WikiEntryCard key={entry.entryKey} slug={slug} entry={entry} />
            ))}
          </div>
        </>
      )}

      {(noWikiAtAll || everythingLocked) && (
        <div className={styles.previewFoot}>
          <Link to="/read/$slug/$ordinal" params={{ slug, ordinal: String(progress?.ordinal ?? 1) }} className={styles.backLink}>
            <BookIcon size={16} /> {progress ? 'Continue reading' : 'Start reading'}
          </Link>
        </div>
      )}
    </div>
  );
}
