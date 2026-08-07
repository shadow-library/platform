import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { BookmarkFilledIcon, BookmarkIcon, CheckIcon } from '@/components/icons';
import { isInLibrary, libraryQueryOptions, sessionQueryOptions, useToggleLibraryMutation } from '@/lib/apis';
import { type NovelSummary } from '@/lib/apis/types';

import { Cover, RatingRow, StatusBadge } from './cover';
import styles from './novel.module.css';

export interface NovelCardProps {
  novel: NovelSummary;
  downloaded?: boolean;
}

/**
 * The poster card from the browse grid mockups: 3/4 cover, bookmark toggle top-left, downloaded tick
 * top-right, then author, rating and status underneath.
 */
export function NovelCard({ novel, downloaded }: NovelCardProps): React.JSX.Element {
  const session = useQuery(sessionQueryOptions());
  const library = useQuery(libraryQueryOptions(session.data?.userId));
  const toggleLibrary = useToggleLibraryMutation(session.data?.userId);
  const inLibrary = isInLibrary(library.data, novel.slug);

  const onToggle = (event: React.MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    toggleLibrary.mutate(novel);
  };

  return (
    <Link to="/novels/$slug" params={{ slug: novel.slug }} className={styles.card}>
      <Cover cover={novel.cover} title={novel.title}>
        <button type="button" onClick={onToggle} aria-label={inLibrary ? 'Remove from library' : 'Add to library'} className={styles.bookmarkBtn}>
          {inLibrary ? <BookmarkFilledIcon size={15} className={styles.bookmarkOn} /> : <BookmarkIcon size={15} />}
        </button>
        {downloaded && (
          <span title="Downloaded" className={styles.downloadedMark}>
            <CheckIcon size={13} />
          </span>
        )}
      </Cover>
      <span className={styles.cardMeta}>
        <span className={styles.cardAuthor}>{novel.author}</span>
        <RatingRow rating={novel.rating} suffix={`${novel.chapterCount.toLocaleString()} ch`} />
        <StatusBadge status={novel.status} />
      </span>
    </Link>
  );
}
