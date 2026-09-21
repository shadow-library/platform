import { type ReactElement } from 'react';

import { Button } from '@shadow-library/ui';

import { SparkIcon } from '@/components/icons';

import { type BibleHealth as BibleHealthSummary, emptyPlaceholdersLabel, topicCoverageLabel } from '@/lib/bible-documents';
import { suggestionsLabel } from '@/lib/bible-readiness';

import styles from './BibleHealth.module.css';
import { StatusChip } from './StatusChip';

export interface BibleHealthProps {
  health: BibleHealthSummary;
  /** Advisory readiness notes for a bible that is already ready to draft. */
  suggestions?: readonly string[];
  onTidy?: () => void;
}

interface Stat {
  label: string;
  value: number;
  /** Left off the compact phone strip, which keeps only what the author acts on. */
  secondary?: boolean;
}

export function BibleHealth({ health, suggestions = [], onTidy }: BibleHealthProps): ReactElement {
  const stats: Stat[] = [
    { label: health.entries === 1 ? 'entry' : 'entries', value: health.entries, secondary: true },
    { label: health.records === 1 ? 'record' : 'records', value: health.records, secondary: true },
    { label: health.guides === 1 ? 'guide' : 'guides', value: health.guides, secondary: true },
    { label: health.secrets === 1 ? 'secret' : 'secrets', value: health.secrets },
  ];

  return (
    <div className={styles.health} role="group" aria-label="Story Bible at a glance">
      <dl className={styles.stats}>
        {stats.map(stat => (
          <div key={stat.label} className={styles.stat} data-secondary={stat.secondary || undefined}>
            <dt className={styles.statLabel}>{stat.label}</dt>
            <dd className={styles.statValue}>{stat.value}</dd>
          </div>
        ))}
      </dl>
      {health.topics && (
        <StatusChip intent={health.topics.missing.length === 0 ? 'success' : 'warning'} dot className={styles.topics}>
          {topicCoverageLabel(health.topics)}
        </StatusChip>
      )}
      <span className={styles.spacer} />
      {onTidy && (
        <span className={styles.tidy}>
          {health.emptyPages > 0 && <span className={styles.tidyLabel}>{emptyPlaceholdersLabel(health.emptyPages)}</span>}
          <Button variant="secondary" size="sm" prefix={<SparkIcon />} onClick={onTidy}>
            Tidy up
            {health.emptyPages > 0 && <span className={styles.tidyCount}> {health.emptyPages}</span>}
          </Button>
        </span>
      )}
      {suggestions.length > 0 && (
        <details className={styles.suggestions}>
          <summary className={styles.suggestionsToggle}>{suggestionsLabel(suggestions.length)}</summary>
          <ul className={styles.suggestionList}>
            {suggestions.map(suggestion => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
