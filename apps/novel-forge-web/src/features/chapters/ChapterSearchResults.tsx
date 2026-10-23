import { ChevronRightIcon, Pagination } from '@shadow-library/ui';

import { QueryState } from '@/components/nf';
import { useSearchChaptersQuery } from '@/lib/apis';
import { CHAPTER_PAGE_SIZE } from '@/lib/chapter-list';

import { activateOnKey, formatChapterNumber } from './chapter-format';
import styles from './chapters.module.css';

interface ChapterSearchResultsProps {
  novelId: string;
  query: string;
  pov?: string;
  thread?: string;
  page: number;
  onPage: (page: number) => void;
  onOpen: (chapter: number) => void;
}

export function ChapterSearchResults({ novelId, query, pov, thread, page, onPage, onOpen }: ChapterSearchResultsProps): React.JSX.Element {
  const searchQuery = useSearchChaptersQuery(novelId, { q: query, pov, thread, limit: CHAPTER_PAGE_SIZE, offset: (page - 1) * CHAPTER_PAGE_SIZE });
  const hits = searchQuery.data?.items ?? [];
  const total = searchQuery.data?.total ?? 0;
  return (
    <QueryState
      isLoading={searchQuery.isLoading}
      error={searchQuery.error}
      isEmpty={hits.length === 0}
      emptyTitle={`No chapter mentions “${query}”`}
      emptyDescription="Search looks through the prose of every chapter you can read here."
    >
      <>
        <ul className={styles.listBody} aria-label={`Chapters mentioning “${query}”`} aria-busy={searchQuery.isPlaceholderData || undefined}>
          {hits.map(hit => {
            const open = (): void => onOpen(hit.number);
            return (
              <li key={hit.number}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Open chapter ${hit.number}: ${hit.title ?? 'Untitled chapter'}`}
                  className={`nf-selrow ${styles.row} ${styles.rowWritten}`}
                  onClick={open}
                  onKeyDown={activateOnKey(open)}
                >
                  <span className={styles.rowNum}>{formatChapterNumber(hit.number)}</span>
                  <span className={styles.hitMain}>
                    <span className={`${styles.rowTitle} ${hit.title ? '' : styles.rowTitleUntitled}`}>{hit.title ?? 'Untitled chapter'}</span>
                    <span className={styles.hitSnippet}>{hit.snippet}</span>
                  </span>
                  <span className={styles.rowMeta}>
                    <span className={styles.rowOrigin} />
                    <span className={styles.rowWords}>{hit.matchCount === 1 ? '1 match' : `${hit.matchCount.toLocaleString()} matches`}</span>
                    <span className={styles.rowStatus} />
                  </span>
                  <span className={styles.rowActions} />
                  <ChevronRightIcon size={16} className={styles.rowChevron} />
                </div>
              </li>
            );
          })}
        </ul>
        {total > CHAPTER_PAGE_SIZE && <Pagination className={styles.pagination} page={page} total={total} pageSize={CHAPTER_PAGE_SIZE} onPageChange={onPage} />}
      </>
    </QueryState>
  );
}
