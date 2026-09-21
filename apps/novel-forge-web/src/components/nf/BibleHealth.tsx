import { type ReactElement } from 'react';

import { type BibleHealth as BibleHealthSummary, topicCoverageLabel } from '@/lib/bible-documents';
import { suggestionsLabel } from '@/lib/bible-readiness';

import styles from './BibleHealth.module.css';
import { StatusChip } from './StatusChip';

export interface BibleHealthProps {
  health: BibleHealthSummary;
  /** Advisory readiness notes for a bible that is already ready to draft. */
  suggestions?: readonly string[];
}

interface Stat {
  label: string;
  value: number;
}

export function BibleHealth({ health, suggestions = [] }: BibleHealthProps): ReactElement {
  const stats: Stat[] = [
    { label: health.pages === 1 ? 'page' : 'pages', value: health.pages },
    { label: health.entities === 1 ? 'entity' : 'entities', value: health.entities },
    { label: health.facts === 1 ? 'fact' : 'facts', value: health.facts },
    { label: 'empty', value: health.emptyPages },
  ];

  return (
    <div className={styles.health} role="group" aria-label="Story Bible at a glance">
      <dl className={styles.stats}>
        {stats.map(stat => (
          <div key={stat.label} className={styles.stat}>
            <dt className={styles.statLabel}>{stat.label}</dt>
            <dd className={styles.statValue}>{stat.value}</dd>
          </div>
        ))}
        {health.topics && (
          <div className={styles.stat}>
            <dt className={styles.statLabel}>topics covered</dt>
            <dd className={styles.statValue}>
              {health.topics.covered}/{health.topics.total}
            </dd>
          </div>
        )}
      </dl>
      {health.topics && (
        <StatusChip intent={health.topics.missing.length === 0 ? 'success' : 'warning'} dot className={styles.topics}>
          {topicCoverageLabel(health.topics)}
        </StatusChip>
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
