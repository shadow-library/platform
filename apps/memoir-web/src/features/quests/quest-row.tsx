import { type ReactElement } from 'react';
import { Badge, IconButton, Progress } from '@shadow-library/ui';

import { MoreIcon } from '@/components/icons';
import { type QuestOccurrence, STATE_LABELS } from '@/lib/data';

import { isResolved, occurrenceCheckLabel, occurrenceMeta, outcomeTone, thresholdMetricName, thresholdPercent } from './quest-presenters';
import styles from './quest-row.module.css';

export interface QuestRowProps {
  occurrence: QuestOccurrence;
  unsaved?: boolean;
  onComplete: (occurrence: QuestOccurrence) => void;
  onOpenActions: (occurrence: QuestOccurrence) => void;
}

function thresholdReached(occurrence: QuestOccurrence): boolean {
  const { threshold } = occurrence;
  return threshold !== null && threshold.comparison === 'gte' && threshold.current >= threshold.target && !isResolved(occurrence.state);
}

export function QuestRow({ occurrence, unsaved = false, onComplete, onOpenActions }: QuestRowProps): ReactElement {
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
        {percent === null || !occurrence.threshold ? null : (
          <div className={styles.threshold}>
            <Progress value={percent} max={100} size="sm" label={`${thresholdMetricName(occurrence.threshold.metricKey)} progress`} />
          </div>
        )}
        {thresholdReached(occurrence) ? <p className={styles.meta}>Target reached — check it off when you’re ready.</p> : null}
        {unsaved ? <p className={styles.unsaved}>Your last change to this quest wasn’t saved.</p> : null}
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
