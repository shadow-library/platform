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
  const catalog = useQuery(catalogQueryOptions({ limit: 1 }));
  const genres = catalog.data?.genres ?? [];

  return (
    <div className={`${styles.page} wn-fade`}>
      <h1 className={styles.title}>Genres &amp; tags</h1>
      <p className={styles.subtitle}>Browse the catalog by what you’re in the mood for</p>

      <div className={styles.grid}>
        {genres.map(genre => (
          <Link key={genre} to="/browse" search={{ genre }} className={styles.genreCard}>
            <span className={styles.genreName}>{genre}</span>
            <span className={styles.genreCount}>Explore novels</span>
          </Link>
        ))}
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
