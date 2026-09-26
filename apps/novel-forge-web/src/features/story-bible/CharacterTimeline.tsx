import { type ReactElement, useMemo } from 'react';

import { Alert, Spinner } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';
import { useEntityTimelineQuery } from '@/lib/apis';
import { timelineRows } from '@/lib/character-timeline';

import styles from './BibleDetails.module.css';
import sharedStyles from './StoryBible.module.css';

export interface CharacterTimelineProps {
  novelId: string;
  entityKey: string;
  name: string;
  names: ReadonlyMap<string, string>;
}

export function CharacterTimeline({ novelId, entityKey, name, names }: CharacterTimelineProps): ReactElement {
  const timeline = useEntityTimelineQuery(novelId, entityKey);
  const rows = useMemo(() => timelineRows(timeline.data?.events ?? [], names), [timeline.data, names]);

  let body: ReactElement;
  if (timeline.isPending) body = <Spinner size="sm" label={`Loading how ${name} has changed`} />;
  else if (timeline.error)
    body = (
      <Alert intent="danger" title={`Couldn’t load how ${name} has changed`} action={{ label: 'Retry', onClick: () => void timeline.refetch() }}>
        {timeline.error.message}
      </Alert>
    );
  else if (rows.length === 0) body = <p className={sharedStyles.muted}>No changes recorded yet. They appear here after each chapter you finalize.</p>;
  else
    body = (
      <ol className={styles.timelineList}>
        {rows.map(row => (
          <li key={row.chapter} className={styles.timelineItem}>
            <span className={styles.timelineChapter}>Ch {row.chapter}</span>
            <span>
              {row.lines.join(' ')} {row.provisional && <StatusChip intent="warning">Waiting for your review</StatusChip>}
            </span>
          </li>
        ))}
      </ol>
    );

  return (
    <section className={styles.timeline} aria-label={`How ${name} has changed`}>
      <div className={styles.timelineHead}>
        <h3 className={styles.timelineTitle}>How {name} has changed</h3>
        <span className={styles.timelineHint}>Updated after each chapter you finalize</span>
      </div>
      {body}
    </section>
  );
}
