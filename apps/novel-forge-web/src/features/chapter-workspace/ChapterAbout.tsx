import { useMemo } from 'react';

import { type DraftResponse, useBriefQuery, useFinalizeReviewQuery, useListEntitiesQuery } from '@/lib/apis';
import { aboutSections, aboutUpdatesNote, whoAppears } from '@/lib/chapter-about';

import styles from './ChapterDetails.module.css';

const UPDATES_NOTES = {
  suggestions: 'These are suggestions until you finalize — you decide which the Story Bible keeps.',
  kept: 'Finalized — the Story Bible kept these.',
  preparing: 'Reading what this chapter changes…',
  unread: 'What this chapter changes in the Story Bible is read once you approve it.',
  none: undefined,
} as const;

export interface ChapterAboutProps {
  novelId: string;
  draft: DraftResponse;
}

export function ChapterAbout({ novelId, draft }: ChapterAboutProps): React.JSX.Element {
  const chapter = draft.chapter;
  const briefQuery = useBriefQuery(novelId, chapter);
  const charactersQuery = useListEntitiesQuery(novelId, { type: 'character', limit: 500 });
  const reviewQuery = useFinalizeReviewQuery(novelId, chapter, draft.approvedRevision !== null);
  const names = useMemo(() => new Map((charactersQuery.data?.items ?? []).map(entity => [entity.entityKey, entity.name])), [charactersQuery.data?.items]);
  const people = whoAppears(briefQuery.data, names);
  const review = reviewQuery.data?.current ? reviewQuery.data : undefined;
  const sections = aboutSections(review);
  const note = UPDATES_NOTES[aboutUpdatesNote(reviewQuery.data)];

  return (
    <div className={styles.tab}>
      <section className={styles.section}>
        <span className={styles.cap}>Summary</span>
        <span className={draft.summary?.trim() ? undefined : styles.muted}>{draft.summary?.trim() || 'No summary yet — use Summary above to write one or ask the AI.'}</span>
      </section>
      {people.length > 0 && (
        <section className={styles.section}>
          <span className={styles.cap}>Who appears</span>
          <div className={styles.people}>
            {people.map(person => (
              <div key={person.key} className={styles.person}>
                <span className={styles.avatar} aria-hidden="true" />
                <span>
                  <b className={styles.name}>{person.name}</b> · {person.role}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {sections.map(section => (
        <section key={section.key} className={styles.section}>
          <span className={styles.cap}>{section.title}</span>
          {section.lines.map(line => (
            <span key={line.id}>
              {line.text}
              {line.inferred && <span className={styles.inferred}> (interpretation)</span>}
            </span>
          ))}
        </section>
      ))}
      {note && <div className={styles.hint}>{note}</div>}
    </div>
  );
}
