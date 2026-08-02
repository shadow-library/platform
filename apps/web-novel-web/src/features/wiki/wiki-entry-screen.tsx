/**
 * Importing npm packages
 */
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useRouter } from '@tanstack/react-router';
import { cn } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { BackIcon, LockIcon } from '@/components/icons';
import { wikiEntryQueryOptions } from '@/lib/apis';
import { type WikiFacet } from '@/lib/apis/types';

import { WikiPortrait, WikiTypeBadge } from './wiki-entry-card';
import styles from './wiki.module.css';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * A wiki entry's detail: portrait, type, its facets rendered as titled prose sections in `sortOrder`, an
 * image gallery, and the `hiddenFacetCount` affordance. A 404 (unknown entry, or one still spoiler-locked —
 * the server answers both identically) bubbles to the router's default error boundary exactly like an
 * unknown novel does, so there is no bespoke not-found handling here.
 */
const route = getRouteApi('/_shell/novels/$slug_/wiki_/$entryKey');

function facetTitle(facetKey: string): string {
  return facetKey
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .map(word => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function facetParagraphs(content: string): string[] {
  return content
    .split(/\n+/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
}

export function WikiEntryScreen(): React.JSX.Element {
  const { slug, entryKey } = route.useParams();
  const router = useRouter();
  const entry = useQuery(wikiEntryQueryOptions(slug, entryKey));

  if (!entry.data) return <div className={styles.content} />;
  const data = entry.data;

  return (
    <div className={cn(styles.content, 'wn-fade')}>
      <button type="button" className={styles.backLink} onClick={() => router.history.back()}>
        <BackIcon size={16} /> Back
      </button>

      <div className={styles.detailHead}>
        <div className={styles.detailPortrait}>
          <WikiPortrait name={data.name} imageUrl={data.imageUrl} />
        </div>
        <div className={styles.detailBody}>
          <h1 className={styles.detailName}>{data.name}</h1>
          <WikiTypeBadge type={data.type} size="md" />
        </div>
      </div>

      {data.facets.map(facet => (
        <FacetSection key={facet.facetKey} facet={facet} />
      ))}

      {data.images.length > 0 && (
        <section className={styles.facetSection}>
          <h2 className={styles.facetTitle}>Gallery</h2>
          <div className={styles.gallery}>
            {data.images.map((image, index) => (
              <div key={`${image.imageUrl}-${index}`} className={styles.galleryTile}>
                <img src={image.imageUrl} alt={image.caption ?? data.name} className={styles.galleryImg} />
                {image.caption && <span className={styles.galleryCaption}>{image.caption}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {data.hiddenFacetCount > 0 && (
        <div className={styles.hiddenBanner}>
          <LockIcon size={15} />
          <span>
            {data.hiddenFacetCount.toLocaleString()} more {data.hiddenFacetCount === 1 ? 'section unlocks' : 'sections unlock'} as you read further.
          </span>
        </div>
      )}

      <div className={styles.previewFoot}>
        <Link to="/novels/$slug/wiki" params={{ slug }} className={styles.backLink}>
          Browse the full wiki
        </Link>
      </div>
    </div>
  );
}

function FacetSection({ facet }: { facet: WikiFacet }): React.JSX.Element {
  return (
    <section className={styles.facetSection}>
      <h2 className={styles.facetTitle}>{facetTitle(facet.facetKey)}</h2>
      <div className={styles.facetBody}>
        {facetParagraphs(facet.content).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}
