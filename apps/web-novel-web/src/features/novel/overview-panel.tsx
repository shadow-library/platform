import { CONTENT_RATING_LEVEL_LABELS, type ContentRating, type ContentRatingDimension } from '@shadow-library/sdk';
import { cn } from '@shadow-library/ui';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { AlertIcon, ChevronDownIcon, ImageIcon } from '@/components/icons';
import { NovelCard } from '@/components/novel';
import { type NovelCharacter, type NovelDetail, type NovelIllustration } from '@/lib/apis/types';

import styles from './novel-screen.module.css';

export function OverviewPanel({ novel }: { novel: NovelDetail }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const characters = novel.characters ?? [];
  const illustrations = novel.illustrations ?? [];
  const related = novel.related ?? [];
  const visibleIllustrations = illustrations.slice(0, 6);
  const extraIllustrations = illustrations.length - visibleIllustrations.length;

  return (
    <div>
      {novel.mature && (
        <div className={styles.matureWarn}>
          <AlertIcon size={17} />
          <span>
            <strong>Mature content.</strong> This novel contains themes intended for adult readers.
          </span>
        </div>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Synopsis</h2>
        <p className={cn(styles.synopsis, !expanded && 'wn-clamp3')}>{novel.synopsis}</p>
        <button type="button" className={styles.readMore} onClick={() => setExpanded(value => !value)}>
          {expanded ? 'Show less' : 'Read more'}
          <ChevronDownIcon size={15} className={expanded ? styles.chevronUp : undefined} />
        </button>
        <div className={styles.tagRow}>
          {novel.tags.map(tag => (
            <Link key={tag} to="/browse" search={{ tag }} className={styles.tagChip}>
              #{tag}
            </Link>
          ))}
        </div>
      </section>

      <ContentRatingsSection novel={novel} />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Characters</h2>
        {characters.length === 0 ? (
          <div className={styles.emptyBox}>No character profiles have been added for this novel yet.</div>
        ) : (
          <div className={cn(styles.hscroll, 'wn-hscroll')}>
            {characters.map(character => (
              <CharacterCard key={character.name} character={character} />
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Illustrations</h2>
          {extraIllustrations > 0 && <span className={styles.sectionMeta}>+{extraIllustrations} more</span>}
        </div>
        {illustrations.length === 0 ? (
          <div className={cn(styles.emptyBox, styles.emptyBoxIcon)}>
            <ImageIcon size={26} />
            <span>No illustrations for this novel yet.</span>
          </div>
        ) : (
          <div className={styles.illGrid}>
            {visibleIllustrations.map(illustration => (
              <IllustrationTile key={illustration.id} illustration={illustration} />
            ))}
          </div>
        )}
      </section>

      {related.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Readers also enjoyed</h2>
          <div className={cn(styles.hscroll, 'wn-hscroll')}>
            {related.map(item => (
              <div key={item.slug} className={styles.relatedCard}>
                <NovelCard novel={item} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const RATING_DIMENSION_LABELS: Record<ContentRatingDimension, string> = { sexualContent: 'Sexual content', violence: 'Violence', darkContent: 'Dark content' };

/** Every dimension is optional and absence means unrated, never "none" — see `ContentRating` in `@shadow-library/sdk`. */
function ContentRatingsSection({ novel }: { novel: ContentRating }): React.JSX.Element {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Content ratings</h2>
      <div className={styles.tagRow}>
        {(Object.keys(RATING_DIMENSION_LABELS) as ContentRatingDimension[]).map(dimension => {
          const level = novel[dimension];
          return (
            <span key={dimension} className={styles.tagChip}>
              {RATING_DIMENSION_LABELS[dimension]}: {level ? CONTENT_RATING_LEVEL_LABELS[level] : 'Unrated'}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function CharacterCard({ character }: { character: NovelCharacter }): React.JSX.Element {
  const [from, to] = character.color ?? ['#6366f1', '#312e81'];
  return (
    <div className={styles.charCard}>
      <div className={styles.charTile} style={{ background: `linear-gradient(158deg, ${from} 0%, ${to} 100%)` }}>
        <span className={styles.charGlyph}>{character.name.charAt(0)}</span>
      </div>
      <div className={styles.charName}>{character.name}</div>
      <div className={styles.charRole}>{character.role}</div>
    </div>
  );
}

function IllustrationTile({ illustration }: { illustration: NovelIllustration }): React.JSX.Element {
  const [from, to] = illustration.color ?? ['#6366f1', '#312e81'];
  return (
    <div className={styles.illTile} style={{ background: `linear-gradient(158deg, ${from} 0%, ${to} 100%)` }} title={illustration.caption}>
      <ImageIcon size={26} className={styles.illGlyph} />
      {illustration.caption && <span className={styles.illCaption}>{illustration.caption}</span>}
    </div>
  );
}
