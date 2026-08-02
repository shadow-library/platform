/**
 * Importing npm packages
 */
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Avatar, Input } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { ChevronRightIcon, HistoryIcon, SearchIcon } from '@/components/icons';
import { CATALOG_GENRES, CATALOG_TAGS, catalogQueryOptions, type NovelSummary } from '@/lib/apis';
import { readLocal, writeLocal } from '@/lib/local-store';

import styles from './search-overlay.module.css';

/**
 * Defining types
 */
export interface SearchOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Declaring the constants
 *
 * The command-bar the top-bar search button and the global "/" hotkey open. Empty query → recent (device
 * local) + trending suggestions; a live query → a debounced catalog lookup plus the genres/tags that match
 * the term. Recents are a plain device-local list (search terms aren't per-account state like the library),
 * seeded empty and SSR-safe through `local-store`. The panel only exists while `open`, so autofocus, the
 * catalog query, and the recents read all key off the reader deliberately opening it.
 */
const RECENTS_STORAGE_KEY = 'webnovel:search-recents';
const RECENTS_LIMIT = 6;
const RESULTS_LIMIT = 6;
const DEBOUNCE_MS = 180;
const TRENDING = CATALOG_TAGS.slice(0, 8);

/** Trending-up glyph — not part of the shared icon set, kept local to this overlay. */
function TrendingIcon({ size = 18 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 6l-9.5 9.5-5-5L1 18" />
      <path d="M17 6h6v6" />
    </svg>
  );
}

function readRecents(): string[] {
  return readLocal<string[]>(RECENTS_STORAGE_KEY, []);
}

/** Push a term to the front, de-duplicated case-insensitively, capped — the most-recent-first history. */
function recordRecent(term: string): void {
  const value = term.trim();
  if (!value) return;
  const next = [value, ...readRecents().filter(entry => entry.toLowerCase() !== value.toLowerCase())].slice(0, RECENTS_LIMIT);
  writeLocal(RECENTS_STORAGE_KEY, next);
}

export function SearchOverlay({ open, onOpenChange }: SearchOverlayProps): React.JSX.Element | null {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [recents, setRecents] = useState<string[]>([]);

  const term = debounced.trim();
  const catalog = useQuery({ ...catalogQueryOptions({ q: term, limit: RESULTS_LIMIT }), enabled: open && term.length > 0 });

  // Debounce the query so a burst of keystrokes fires one catalog lookup, not one per character.
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  // Opening resets the field, pulls the latest device-local recents, and lands focus in the input.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setDebounced('');
    setRecents(readRecents());
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  // Escape closes even while the input holds focus — the listener is on the window, not the field.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  const close = (): void => onOpenChange(false);

  const goSearch = (value: string): void => {
    recordRecent(value);
    void navigate({ to: '/browse', search: { q: value } });
    close();
  };

  const goGenre = (genre: string): void => {
    recordRecent(genre);
    void navigate({ to: '/browse', search: { genre } });
    close();
  };

  const openNovel = (novel: NovelSummary): void => {
    if (term) recordRecent(term);
    void navigate({ to: '/novels/$slug', params: { slug: novel.slug } });
    close();
  };

  const lower = term.toLowerCase();
  const novels = catalog.data?.items ?? [];
  const genres = term ? CATALOG_GENRES.filter(genre => genre.toLowerCase().includes(lower)).slice(0, 6) : [];
  const tags = term ? CATALOG_TAGS.filter(tag => tag.toLowerCase().includes(lower)).slice(0, 6) : [];
  const authors = [...new Set(novels.map(novel => novel.author))].filter(author => author && author !== 'Unknown author').slice(0, 3);
  const noMatch = term.length > 0 && !catalog.isLoading && novels.length === 0 && genres.length === 0 && tags.length === 0;

  return (
    <div className={styles.scrim} onClick={event => event.target === event.currentTarget && close()} role="presentation">
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Search">
        <div className={styles.header}>
          <div className={styles.field}>
            <Input
              ref={inputRef}
              size="lg"
              clearable
              prefix={<SearchIcon size={18} />}
              value={query}
              onValueChange={setQuery}
              placeholder="Search novels, authors, genres, tags…"
              aria-label="Search"
            />
          </div>
          <button type="button" className={styles.cancel} onClick={close}>
            Cancel
          </button>
        </div>
        <div className={styles.body}>
          {term.length === 0 ? (
            <EmptyState recents={recents} trending={TRENDING} onPick={goSearch} />
          ) : noMatch ? (
            <div className={styles.none}>
              <h3 className={styles.noneTitle}>No matches for “{term}”</h3>
              <p className={styles.noneText}>Check your spelling or try a broader term.</p>
            </div>
          ) : (
            <Results novels={novels} authors={authors} genres={genres} tags={tags} onOpenNovel={openNovel} onSearch={goSearch} onGenre={goGenre} />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState(props: { recents: string[]; trending: string[]; onPick: (term: string) => void }): React.JSX.Element {
  return (
    <>
      {props.recents.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionLabel}>Recent searches</div>
          <div className={styles.chips}>
            {props.recents.map(entry => (
              <button key={entry} type="button" className={styles.chip} onClick={() => props.onPick(entry)}>
                <HistoryIcon size={13} />
                {entry}
              </button>
            ))}
          </div>
        </section>
      )}
      <section className={styles.section}>
        <div className={styles.sectionLabel}>Trending searches</div>
        <div className={styles.chips}>
          {props.trending.map(entry => (
            <button key={entry} type="button" className={styles.trendChip} onClick={() => props.onPick(entry)}>
              <TrendingIcon size={13} />
              {entry}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function Results(props: {
  novels: NovelSummary[];
  authors: string[];
  genres: string[];
  tags: string[];
  onOpenNovel: (novel: NovelSummary) => void;
  onSearch: (term: string) => void;
  onGenre: (genre: string) => void;
}): React.JSX.Element {
  return (
    <>
      {props.novels.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionLabel}>Novels</div>
          {props.novels.map(novel => (
            <button key={novel.slug} type="button" className={styles.novelRow} onClick={() => props.onOpenNovel(novel)}>
              <span className={styles.cover} style={{ background: `linear-gradient(150deg, ${novel.cover.from}, ${novel.cover.to})` }} />
              <span className={styles.novelBody}>
                <span className={styles.novelTitle}>{novel.title}</span>
                <span className={styles.novelMeta}>{[novel.author, novel.genres[0], `${novel.chapterCount.toLocaleString()} ch`].filter(Boolean).join(' · ')}</span>
                <span className={styles.novelSyn}>{novel.synopsis}</span>
              </span>
              <ChevronRightIcon size={16} />
            </button>
          ))}
        </section>
      )}
      {props.authors.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionLabel}>Authors</div>
          {props.authors.map(author => (
            <button key={author} type="button" className={styles.authorRow} onClick={() => props.onSearch(author)}>
              <Avatar name={author} size="sm" />
              <span className={styles.authorName}>{author}</span>
            </button>
          ))}
        </section>
      )}
      {(props.genres.length > 0 || props.tags.length > 0) && (
        <section className={styles.section}>
          <div className={styles.sectionLabel}>Genres &amp; tags</div>
          <div className={styles.chips}>
            {props.genres.map(genre => (
              <button key={genre} type="button" className={styles.chip} onClick={() => props.onGenre(genre)}>
                {genre}
              </button>
            ))}
            {props.tags.map(tag => (
              <button key={tag} type="button" className={styles.tagChip} onClick={() => props.onSearch(tag)}>
                #{tag}
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
