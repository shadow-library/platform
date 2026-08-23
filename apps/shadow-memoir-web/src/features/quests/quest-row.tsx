import { type ReactElement } from 'react';
import { Badge, IconButton, Progress } from '@shadow-library/ui';

import { MoreIcon } from '@/components/icons';
import { type QuestOccurrence, STATE_LABELS } from '@/lib/data';

import { isResolved, occurrenceCheckLabel, occurrenceMeta, outcomeTone, thresholdPercent } from './quest-presenters';
import styles from './quest-row.module.css';

export interface QuestRowProps {
  occurrence: QuestOccurrence;
  onComplete: (occurrence: QuestOccurrence) => void;
  onOpenActions: (occurrence: QuestOccurrence) => void;
}

export function QuestRow({ occurrence, onComplete, onOpenActions }: QuestRowProps): ReactElement {
  const tone = outcomeTone(occurrence.state);
  const done = tone === 'kept' || tone === 'partial';
  const percent = thresholdPercent(occurrence);

  return (
    <li className={styles.row} data-tone={tone}>
      <button
        type="button"
        className={styles.check}
        aria-pressed={done}
        aria-label={occurrenceCheckLabel(occurrence)}
        onClick={() => onComplete(occurrence)}
        disabled={isResolved(occurrence.state)}
      >
        <span className={styles.checkMark} aria-hidden>
          {tone === 'kept' ? '✓' : tone === 'partial' ? '◐' : ''}
        </span>
      </button>
      <div className={styles.body}>
        <p className={styles.title}>{occurrence.questName}</p>
        <p className={styles.meta}>{occurrenceMeta(occurrence)}</p>
        {percent === null ? null : (
          <div className={styles.threshold}>
            <Progress value={percent} max={100} size="sm" label={`${occurrence.threshold?.metric} progress`} />
          </div>
        )}
      </div>
      <div className={styles.trailing}>
        {isResolved(occurrence.state) && !done ? (
          <Badge variant="outline" size="sm">
            {STATE_LABELS[occurrence.state]}
          </Badge>
        ) : null}
        {occurrence.locked ? (
          <Badge variant="soft" intent="neutral" size="sm">
            Locked
          </Badge>
        ) : null}
        {occurrence.queued ? (
          <Badge variant="soft" intent="neutral" size="sm">
            Queued
          </Badge>
        ) : null}
        <IconButton variant="ghost" size="sm" aria-label={`Actions for ${occurrence.questName}`} icon={<MoreIcon size={18} />} onClick={() => onOpenActions(occurrence)} />
      </div>
    </li>
  );
}
