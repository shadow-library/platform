import { type ReactElement, useState } from 'react';

import { type BibleSection, useBibleDocQuery, useListBibleDocsQuery } from '@/lib/apis';

import styles from './BibleDocumentList.module.css';
import { ReadingSheet } from './ReadingSheet';

interface OpenDoc {
  section: BibleSection;
  slug: string;
}

export interface BibleDocumentListProps {
  novelId: string;
}

/**
 * The prose half of the bible. Without it a `bible_document` write has no surface at all, which is how a
 * whole power system could be applied and still leave this screen reading empty.
 */
export function BibleDocumentList({ novelId }: BibleDocumentListProps): ReactElement | null {
  const [open, setOpen] = useState<OpenDoc | null>(null);
  const docs = useListBibleDocsQuery(novelId);
  const body = useBibleDocQuery(novelId, open?.section, open?.slug);

  if (docs.isLoading || docs.error || !docs.data || docs.data.docs.length === 0) return null;

  return (
    <>
      <ul className={styles.list}>
        {docs.data.docs.map(doc => (
          <li key={`${doc.section}/${doc.slug}`}>
            <button type="button" className={styles.row} onClick={() => setOpen({ section: doc.section, slug: doc.slug })}>
              <span className={styles.slug}>{doc.slug}</span>
              <span className={styles.section}>{doc.section}</span>
              <time className={styles.updated} dateTime={doc.updatedAt}>
                {new Date(doc.updatedAt).toLocaleDateString()}
              </time>
            </button>
          </li>
        ))}
      </ul>

      <ReadingSheet
        open={open !== null}
        onOpenChange={next => !next && setOpen(null)}
        title={open ? `${open.section}/${open.slug}` : ''}
        value={body.isLoading ? 'Loading…' : (body.data?.body ?? null)}
        placeholder="This document has no body yet."
      />
    </>
  );
}
