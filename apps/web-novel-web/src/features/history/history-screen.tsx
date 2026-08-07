import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { EmptyState, Input } from '@shadow-library/ui';

import { HistoryIcon, PlayIcon } from '@/components/icons';
import { Cover } from '@/components/novel';
import { catalogQueryOptions, clearProgressMirror, coverFor, progressKeys, type ProgressMap, progressQueryOptions, sessionQueryOptions } from '@/lib/apis';
import { type NovelCover, type NovelSummary, type ReadingProgress } from '@/lib/apis/types';

import styles from './history-screen.module.css';

interface HistoryItem {
  slug: string;
  ordinal: number;
  pct: number;
  when: string;
  title: string;
  cover: NovelCover;
}

interface HistoryGroup {
  day: string;
  items: HistoryItem[];
}

const DAY_MS = 86_400_000;

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayLabel(date: Date, now: Date): string {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (days <= 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: sameYear ? undefined : 'numeric' }).toUpperCase();
}

function relativeWhen(iso: string, now: Date): string {
  const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString('en-US');
}

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function toItem(entry: ReadingProgress, novel: NovelSummary | undefined, now: Date): HistoryItem {
  return {
    slug: entry.novelSlug,
    ordinal: entry.ordinal,
    pct: Math.round(entry.position),
    when: relativeWhen(entry.updatedAt, now),
    title: novel?.title ?? titleFromSlug(entry.novelSlug),
    cover: novel?.cover ?? coverFor(entry.novelSlug),
  };
}

function buildGroups(entries: ReadingProgress[], resolve: (slug: string) => NovelSummary | undefined, now: Date): HistoryGroup[] {
  const groups: HistoryGroup[] = [];
  let currentKey = '';
  let current: HistoryGroup | undefined;
  for (const entry of entries) {
    const date = new Date(entry.updatedAt);
    const key = dayKey(date);
    if (!current || key !== currentKey) {
      current = { day: dayLabel(date, now), items: [] };
      groups.push(current);
      currentKey = key;
    }
    current.items.push(toItem(entry, resolve(entry.novelSlug), now));
  }
  return groups;
}

export function HistoryScreen(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useQuery(sessionQueryOptions());
  const progress = useQuery(progressQueryOptions(session.data?.userId));
  const catalog = useQuery(catalogQueryOptions({ limit: 100 }));

  const bySlug = useMemo(() => new Map((catalog.data?.items ?? []).map(novel => [novel.slug, novel])), [catalog.data]);
  const term = query.trim().toLowerCase();

  const groups = useMemo<HistoryGroup[]>(() => {
    if (!progress.data) return [];
    const now = new Date();
    const resolve = (slug: string): NovelSummary | undefined => bySlug.get(slug);
    const entries = Object.values(progress.data)
      .filter(entry => !term || (resolve(entry.novelSlug)?.title ?? titleFromSlug(entry.novelSlug)).toLowerCase().includes(term))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return buildGroups(entries, resolve, now);
  }, [progress.data, bySlug, term]);

  const total = progress.data ? Object.keys(progress.data).length : 0;
  const hasHistory = total > 0;
  const noMatch = hasHistory && groups.length === 0;

  const clearAll = (): void => {
    clearProgressMirror(session.data?.userId);
    queryClient.setQueryData<ProgressMap>(progressKeys.all(session.data?.userId), {});
  };

  return (
    <div className={`${styles.page} wn-fade`}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Reading history</h1>
          <p className={styles.subtitle}>Chapters you&apos;ve recently opened on this device</p>
        </div>
        {hasHistory && (
          <button type="button" className={styles.clearBtn} onClick={clearAll}>
            Clear all
          </button>
        )}
      </div>

      {hasHistory && (
        <div className={styles.search}>
          <Input value={query} onValueChange={setQuery} placeholder="Search history…" clearable aria-label="Search reading history" />
        </div>
      )}

      {!hasHistory && (
        <EmptyState
          illustration={<HistoryIcon size={26} />}
          title="No reading history"
          description="Chapters you read will appear here so you can jump back in."
          action={{ label: 'Browse novels', onClick: () => void navigate({ to: '/browse' }) }}
        />
      )}

      {noMatch && <EmptyState size="inline" title={`No history matches “${query}”`} description="Try a different title." />}

      {groups.map(group => (
        <section key={group.day} className={styles.group}>
          <h2 className={styles.dayLabel}>{group.day}</h2>
          <div className={styles.rows}>
            {group.items.map(item => (
              <HistoryRow key={item.slug} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function HistoryRow({ item }: { item: HistoryItem }): React.JSX.Element {
  return (
    <Link to="/read/$slug/$ordinal" params={{ slug: item.slug, ordinal: String(item.ordinal) }} className={styles.row}>
      <span className={styles.thumb}>
        <Cover cover={item.cover} title={item.title} showTitle={false} />
      </span>
      <span className={styles.rowBody}>
        <span className={styles.rowTitle}>{item.title}</span>
        <span className={styles.rowChapter}>Ch. {item.ordinal.toLocaleString()}</span>
        <span className={styles.rowMeta}>
          {item.when} · {item.pct}% through
        </span>
      </span>
      <span className={styles.playBtn} aria-hidden="true">
        <PlayIcon size={15} />
      </span>
    </Link>
  );
}
