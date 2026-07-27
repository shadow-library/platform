/**
 * Importing npm packages
 */
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { EmptyState, Input } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { BookmarkIcon, CloseIcon, ShieldIcon } from '@/components/icons';
import { Cover } from '@/components/novel';
import { libraryQueryOptions, progressQueryOptions, sessionQueryOptions, useToggleLibraryMutation } from '@/lib/apis';
import { type LibraryEntry } from '@/lib/apis/types';

import styles from './library-screen.module.css';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The library shelf from the mockups: saved novels with reading-progress overlays, searchable, with a
 * guest sync note. Local-first — guests keep a device shelf; a session syncs it to the server.
 */
export function LibraryScreen(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const session = useQuery(sessionQueryOptions());
  const library = useQuery(libraryQueryOptions(Boolean(session.data)));
  const progress = useQuery(progressQueryOptions(Boolean(session.data)));
  const toggleLibrary = useToggleLibraryMutation(Boolean(session.data));

  const entries = library.data ?? [];
  const term = query.trim().toLowerCase();
  const filtered = entries.filter(entry => !term || entry.novel.title.toLowerCase().includes(term) || entry.novel.author.toLowerCase().includes(term));
  const signedOut = session.data === null;

  return (
    <div className={`${styles.page} wn-fade`}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Library</h1>
          <p className={styles.subtitle}>{entries.length.toLocaleString()} saved novels · recently opened first</p>
        </div>
      </div>

      {signedOut && (
        <div className={styles.guestNote}>
          <ShieldIcon size={16} />
          <span>
            Saved on this device. <Link to="/login">Sign in</Link> to sync across devices.
          </span>
        </div>
      )}

      {entries.length > 0 && (
        <div className={styles.search}>
          <Input value={query} onValueChange={setQuery} placeholder="Search your library…" clearable aria-label="Search library" />
        </div>
      )}

      {entries.length === 0 && (
        <EmptyState
          illustration={<BookmarkIcon size={26} />}
          title="Nothing here yet"
          description="Tap the bookmark on any novel to add it to your library and pick up where you left off."
          action={{ label: 'Browse novels', onClick: () => void navigate({ to: '/browse' }) }}
        />
      )}

      {entries.length > 0 && filtered.length === 0 && <EmptyState size="inline" title={`No novels match “${query}”`} description="Try a different title or author." />}

      <div className={styles.grid}>
        {filtered.map(entry => (
          <ShelfCard
            key={entry.novelSlug}
            entry={entry}
            pct={progress.data?.[entry.novelSlug]?.position ?? 0}
            ordinal={progress.data?.[entry.novelSlug]?.ordinal}
            onRemove={() => toggleLibrary.mutate(entry.novel)}
          />
        ))}
      </div>
    </div>
  );
}

function ShelfCard(props: { entry: LibraryEntry; pct: number; ordinal?: number; onRemove: () => void }): React.JSX.Element {
  const { novel } = props.entry;
  const onRemove = (event: React.MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    props.onRemove();
  };

  return (
    <Link to="/read/$slug/$ordinal" params={{ slug: novel.slug, ordinal: String(props.ordinal ?? 1) }} className={styles.gridCard}>
      <Cover cover={novel.cover} title={novel.title}>
        <button type="button" aria-label="Remove from library" className={styles.removeBtn} onClick={onRemove}>
          <CloseIcon size={14} />
        </button>
        <span className={styles.gridProgress}>
          <span className={styles.gridTrack}>
            <span className={styles.gridFill} style={{ width: `${props.pct}%`, display: 'block' }} />
          </span>
        </span>
      </Cover>
      <span className={styles.gridMeta}>{props.ordinal ? `Ch. ${props.ordinal.toLocaleString()} · ${props.pct}%` : 'Not started'}</span>
    </Link>
  );
}
