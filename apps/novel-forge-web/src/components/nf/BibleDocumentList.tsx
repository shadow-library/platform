import { type ReactElement, useState } from 'react';

import { Button } from '@shadow-library/ui';

import { ChevronDownIcon, SparkIcon } from '@/components/icons';
import { type BibleDocListItem, type BibleSection, useBibleDocQuery, useBibleReadinessQuery, useListBibleDocsQuery } from '@/lib/apis';
import { docAddress, docLengthLabel, emptyToggleLabel, groupBibleDocs, topicsByDocument } from '@/lib/bible-documents';

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

interface DocumentCardProps {
  doc: BibleDocListItem;
  topics: readonly string[];
  onOpen: () => void;
}

function DocumentCard({ doc, topics, onOpen }: DocumentCardProps): ReactElement {
  const excerpt = doc.isEmpty ? 'Nothing written here yet.' : doc.excerpt;
  return (
    <button type="button" className={styles.card} data-empty={doc.isEmpty || undefined} aria-label={`${doc.title}, ${docLengthLabel(doc)}`} onClick={onOpen}>
      <span className={styles.title}>{doc.title}</span>
      {excerpt && <span className={styles.excerpt}>{excerpt}</span>}
      <span className={styles.meta}>
        {topics.map(topic => (
          <StatusChip key={topic} intent="accent">
            {topic}
          </StatusChip>
        ))}
        <StatusChip intent={doc.isEmpty ? 'warning' : 'neutral'}>{docLengthLabel(doc)}</StatusChip>
        <time className={styles.updated} dateTime={doc.updatedAt}>
          {new Date(doc.updatedAt).toLocaleDateString()}
        </time>
      </span>
    </button>
  );
}

/**
 * The prose half of the bible. Without it a `bible_document` write has no surface at all, which is how a
 * whole power system could be applied and still leave this screen reading empty.
 */
export function BibleDocumentList({ novelId }: BibleDocumentListProps): ReactElement | null {
  const [open, setOpen] = useState<OpenDoc | null>(null);
  const [revealedSections, setRevealedSections] = useState<ReadonlySet<BibleSection>>(new Set());
  const [tidying, setTidying] = useState(false);
  const docs = useListBibleDocsQuery(novelId);
  const readiness = useBibleReadinessQuery(novelId);
  const body = useBibleDocQuery(novelId, open?.section, open?.slug);

  if (docs.isLoading || docs.error || !docs.data || docs.data.docs.length === 0) return null;

  const groups = groupBibleDocs(docs.data.docs);
  const topics = topicsByDocument(readiness.data?.roles);
  const toggleEmpty = (section: BibleSection): void =>
    setRevealedSections(prev => {
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
        {groups.map(group => {
          const revealed = revealedSections.has(group.section);
          const shown = revealed ? [...group.filled, ...group.empty] : group.filled;
          return (
            <section key={group.section} className={styles.group} aria-label={group.label}>
              <h3 className={styles.groupLabel}>
                {group.label}
                <span className={styles.groupCount}>{group.filled.length}</span>
              </h3>

              {shown.length > 0 && (
                <ul className={styles.grid}>
                  {shown.map(doc => (
                    <li key={docAddress(doc)} className={styles.cell}>
                      <DocumentCard doc={doc} topics={topics.get(docAddress(doc)) ?? []} onOpen={() => openDoc(doc, group.label)} />
                    </li>
                  ))}
                </ul>
              )}

              {group.empty.length > 0 && (
                <button type="button" className={styles.emptyToggle} aria-expanded={revealed} data-expanded={revealed || undefined} onClick={() => toggleEmpty(group.section)}>
                  <ChevronDownIcon size={12} />
                  {emptyToggleLabel(group.empty.length, revealed)}
                </button>
              )}
            </section>
          );
        })}
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
