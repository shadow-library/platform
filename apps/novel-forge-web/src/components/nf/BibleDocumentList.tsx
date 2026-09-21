import { type ReactElement, useState } from 'react';

import { Button } from '@shadow-library/ui';

import { ChevronDownIcon, SparkIcon } from '@/components/icons';
import { type BibleDocListItem, type BibleSection, useBibleDocQuery, useListBibleDocsQuery } from '@/lib/apis';
import { emptyToggleLabel, groupBibleDocs } from '@/lib/bible-documents';

import { BibleDocumentSheet } from './BibleDocumentSheet';
import styles from './BibleDocumentList.module.css';
import { BibleTidyDialog } from './BibleTidyDialog';
import { StatusChip } from './StatusChip';

interface OpenDoc {
  section: BibleSection;
  slug: string;
  title: string;
  sectionLabel: string;
  wordCount: number;
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
  const [revealed, setRevealed] = useState<ReadonlySet<BibleSection>>(new Set());
  const [tidying, setTidying] = useState(false);
  const docs = useListBibleDocsQuery(novelId);
  const body = useBibleDocQuery(novelId, open?.section, open?.slug);

  if (docs.isLoading || docs.error || !docs.data || docs.data.docs.length === 0) return null;

  const groups = groupBibleDocs(docs.data.docs);
  const toggleEmpty = (section: BibleSection): void =>
    setRevealed(prev => {
      const next = new Set(prev);
      if (!next.delete(section)) next.add(section);
      return next;
    });
  const openDoc = (doc: BibleDocListItem, sectionLabel: string): void =>
    setOpen({ section: doc.section, slug: doc.slug, title: doc.title, sectionLabel, wordCount: doc.wordCount });

  return (
    <>
      <div className={styles.toolbar}>
        <Button variant="secondary" size="sm" prefix={<SparkIcon />} onClick={() => setTidying(true)}>
          Tidy up
        </Button>
      </div>

      <div className={styles.groups}>
        {groups.map(group => (
          <section key={group.section} className={styles.group}>
            <h3 className={styles.groupLabel}>{group.label}</h3>

            {group.filled.length > 0 && (
              <ul className={styles.list}>
                {group.filled.map(doc => (
                  <li key={`${doc.section}/${doc.slug}`}>
                    <button type="button" className={styles.row} onClick={() => openDoc(doc, group.label)}>
                      <span className={styles.rowHead}>
                        <span className={styles.title}>{doc.title}</span>
                        <time className={styles.updated} dateTime={doc.updatedAt}>
                          {new Date(doc.updatedAt).toLocaleDateString()}
                        </time>
                      </span>
                      {doc.excerpt && <span className={styles.excerpt}>{doc.excerpt}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {group.empty.length > 0 && (
              <>
                {revealed.has(group.section) && (
                  <ul className={styles.list}>
                    {group.empty.map(doc => (
                      <li key={`${doc.section}/${doc.slug}`}>
                        <button type="button" className={styles.row} onClick={() => openDoc(doc, group.label)}>
                          <span className={styles.rowHead}>
                            <span className={styles.title}>{doc.title}</span>
                            <StatusChip intent="neutral">Empty</StatusChip>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  className={styles.emptyToggle}
                  aria-expanded={revealed.has(group.section)}
                  data-expanded={revealed.has(group.section) || undefined}
                  onClick={() => toggleEmpty(group.section)}
                >
                  <ChevronDownIcon size={12} />
                  {emptyToggleLabel(group.empty.length, revealed.has(group.section))}
                </button>
              </>
            )}
          </section>
        ))}
      </div>

      <BibleDocumentSheet
        key={open ? `${open.section}/${open.slug}` : 'closed'}
        open={open !== null}
        onOpenChange={next => !next && setOpen(null)}
        title={open?.title ?? ''}
        sectionLabel={open?.sectionLabel ?? ''}
        wordCount={open?.wordCount}
        loading={body.isLoading}
        body={body.data?.body}
      />

      <BibleTidyDialog novelId={novelId} open={tidying} onOpenChange={setTidying} />
    </>
  );
}
