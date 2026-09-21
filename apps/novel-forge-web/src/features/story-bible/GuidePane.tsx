import { Link } from '@tanstack/react-router';
import { type ReactElement, useMemo, useState } from 'react';

import { Button, toast } from '@shadow-library/ui';

import { CheckIcon, ChevronLeftIcon } from '@/components/icons';
import { BibleDocumentSheet } from '@/components/nf/BibleDocumentSheet';
import { Markdown, PaneError, PaneLoader, StatusChip } from '@/components/nf';
import { type BibleDocListItem, type EntityResponse, useBibleDocQuery, useUpsertBibleDocMutation } from '@/lib/apis';
import { BIBLE_DOC_SECTION_LABEL } from '@/lib/bible-documents';
import { guideChangedSince, leadSection, mentionedEntities } from '@/lib/bible-entries';
import { type BibleSearch } from '@/lib/bible-search';
import { secretCountLabel } from '@/lib/bible-secrets';
import { type BibleTopic, TOPIC_LABEL } from '@/lib/bible-topics';
import { formatWordCount } from '@/lib/field-card';

import { GuideEditDialog } from './BibleDialogs';
import { KindIcon } from './EntryList';
import styles from './StoryBible.module.css';

const SECRETS_STAY_PUT = 'They stay on their records and are hidden from the writer until revealed.';

export interface GuidePaneProps {
  novelId: string;
  doc: BibleDocListItem;
  topic: BibleTopic;
  covers: readonly string[];
  entities: readonly EntityResponse[];
  topicSecrets: number;
  backSearch: BibleSearch;
}

export function GuidePane({ novelId, doc, topic, covers, entities, topicSecrets, backSearch }: GuidePaneProps): ReactElement {
  const docQuery = useBibleDocQuery(novelId, doc.section, doc.slug);
  const upsert = useUpsertBibleDocMutation(novelId);
  const [reading, setReading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [openedAt, setOpenedAt] = useState<string | undefined>();
  const [conflict, setConflict] = useState(false);
  const [checking, setChecking] = useState(false);
  const body = docQuery.data?.body ?? '';
  const { lead, truncated } = leadSection(body);
  const records = useMemo(() => mentionedEntities(body, entities), [body, entities]);

  const startEditing = (): void => {
    setOpenedAt(docQuery.data?.updatedAt);
    setConflict(false);
    setEditing(true);
  };

  const save = async (next: string, overwrite: boolean): Promise<void> => {
    setChecking(true);
    const fresh = await docQuery.refetch();
    setChecking(false);
    if (fresh.isError || !fresh.data) {
      toast.danger('Couldn’t check whether the guide changed — nothing was saved. Try again.');
      return;
    }
    if (!overwrite && guideChangedSince(openedAt, fresh.data.updatedAt)) {
      setConflict(true);
      return;
    }
    upsert.mutate(
      { section: doc.section, slug: doc.slug, frontmatter: fresh.data.frontmatter ?? undefined, body: next },
      {
        onSuccess: () => {
          toast.success(`Saved “${doc.title}”`);
          setEditing(false);
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  return (
    <section className={styles.pane} aria-label={doc.title}>
      <Link to="/novels/$novelId/story-bible" params={{ novelId }} search={backSearch} className={styles.paneBack}>
        <ChevronLeftIcon size={14} /> Back to the list
      </Link>

      <header className={styles.paneHeader}>
        <KindIcon kind="guide" large />
        <div className={styles.paneIdentity}>
          <h2 className={styles.paneTitle}>{doc.title}</h2>
          <div className={styles.paneChips}>
            <StatusChip intent="neutral">Guide</StatusChip>
            <StatusChip intent="neutral">{TOPIC_LABEL[topic]}</StatusChip>
            <StatusChip intent="neutral">{formatWordCount(doc.wordCount)}</StatusChip>
            <StatusChip intent="neutral">
              Updated <time dateTime={doc.updatedAt}>{new Date(doc.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</time>
            </StatusChip>
          </div>
        </div>
        <div className={styles.paneActions}>
          <Button variant="secondary" size="sm" disabled={!docQuery.data} onClick={startEditing}>
            Edit
          </Button>
        </div>
      </header>

      {covers.length > 0 && (
        <p className={styles.covers}>
          <CheckIcon size={14} />
          <span>
            Covers the <b>{covers.join(', ')}</b> {covers.length === 1 ? 'topic' : 'topics'} the writer needs before drafting.
          </span>
        </p>
      )}

      {docQuery.isLoading ? (
        <PaneLoader />
      ) : docQuery.error ? (
        <PaneError error={docQuery.error} />
      ) : (
        <>
          {lead ? <Markdown content={lead} className={styles.prose} /> : <p className={styles.muted}>This guide has no text yet.</p>}
          {truncated && (
            <button type="button" className={styles.linkButton} onClick={() => setReading(true)}>
              Read the whole guide
            </button>
          )}
        </>
      )}

      <div className={styles.twoCol}>
        <section className={styles.col} aria-label="Records it talks about">
          <h3 className={styles.label}>Records it talks about</h3>
          {records.length === 0 ? (
            <p className={styles.muted}>{docQuery.data ? 'This guide names no record.' : 'Reading the guide…'}</p>
          ) : (
            <div className={styles.chipLinks}>
              {records.map(entity => (
                <Link key={entity.entityKey} to="/novels/$novelId/story-bible" params={{ novelId }} search={{ entity: entity.entityKey }} className={styles.chipLink}>
                  {entity.name}
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className={styles.col} aria-label="Secrets in this topic">
          <h3 className={styles.label}>Secrets in this topic</h3>
          <p className={styles.muted}>
            {topicSecrets === 0
              ? `No secret sits on a ${TOPIC_LABEL[topic]} record.`
              : `${secretCountLabel(topicSecrets)} ${topicSecrets === 1 ? 'sits' : 'sit'} on ${TOPIC_LABEL[topic]} records. ${SECRETS_STAY_PUT}`}
          </p>
        </section>
      </div>

      <BibleDocumentSheet
        key={`${doc.section}/${doc.slug}`}
        open={reading}
        onOpenChange={setReading}
        title={doc.title}
        sectionLabel={BIBLE_DOC_SECTION_LABEL[doc.section]}
        wordCount={doc.wordCount}
        loading={docQuery.isLoading}
        body={body}
      />

      {editing && docQuery.data && (
        <GuideEditDialog
          title={doc.title}
          initialBody={body}
          conflict={conflict}
          pending={checking || upsert.isPending}
          onOpenChange={next => !next && setEditing(false)}
          onSubmit={(next, overwrite) => void save(next, overwrite)}
        />
      )}
    </section>
  );
}
