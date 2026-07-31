/**
 * Importing npm packages
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { catalogQueryOptions, FIXTURE_TAGS } from '@/lib/apis';

import styles from './genres-screen.module.css';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The genres & tags hub: a grid of genre cards (each deep-links into the filtered catalog) and a popular
 * tag cloud, per the genres mockup.
 */
export function GenresScreen(): React.JSX.Element {
  const catalog = useQuery(catalogQueryOptions({ limit: 100 }));
  const genres = catalog.data?.genres ?? [];

  // Per-genre counts are derived from the catalog until the server exposes them directly.
  const counts = new Map<string, number>();
  for (const novel of catalog.data?.items ?? []) {
    for (const genre of novel.genres) counts.set(genre, (counts.get(genre) ?? 0) + 1);
  }

  return (
    <div className={`${styles.page} wn-fade`}>
      <h1 className={styles.title}>Genres &amp; tags</h1>
      <p className={styles.subtitle}>Browse the catalog by what you’re in the mood for</p>

      <div className={styles.grid}>
        {genres.map(genre => {
          const count = counts.get(genre) ?? 0;
          return (
            <Link key={genre} to="/browse" search={{ genre }} className={styles.genreCard}>
              <span className={styles.genreName}>{genre}</span>
              <span className={styles.genreCount}>
                {count} {count === 1 ? 'novel' : 'novels'}
              </span>
            </Link>
          );
        })}
      </div>

      <h2 className={styles.tagsTitle}>Popular tags</h2>
      <div className={styles.tags}>
        {FIXTURE_TAGS.map(tag => (
          <Link key={tag} to="/browse" search={{ q: tag }} className={styles.tagChip}>
            #{tag}
          </Link>
        ))}
      </div>
    </div>
  );
}
