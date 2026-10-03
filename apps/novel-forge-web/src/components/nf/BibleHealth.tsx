import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Button } from '@shadow-library/ui';

import { SparkIcon } from '@/components/icons';

import { type BibleUnresolvedReferenceResponse } from '@/lib/apis';
import { type BibleHealth as BibleHealthSummary, emptyPlaceholdersLabel, unresolvedReferencesLabel } from '@/lib/bible-documents';
import { secretTitle } from '@/lib/bible-secrets';

import styles from './BibleHealth.module.css';

export interface BibleHealthProps {
  novelId: string;
  health: BibleHealthSummary;
  unresolvedReferences?: readonly BibleUnresolvedReferenceResponse[];
  onTidy?: () => void;
}

interface Stat {
  label: string;
  value: number;
  /** Left off the compact phone strip, which keeps only what the author acts on. */
  secondary?: boolean;
}

export function BibleHealth({ novelId, health, unresolvedReferences = [], onTidy }: BibleHealthProps): ReactElement {
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
      {unresolvedReferences.length > 0 && (
        <details className={styles.references}>
          <summary className={styles.referencesToggle}>{unresolvedReferencesLabel(unresolvedReferences.length)}</summary>
          <ul className={styles.referenceList}>
            {unresolvedReferences.map(reference => (
              <li key={`${reference.factKey}/${reference.subject}`}>
                <Link to="/novels/$novelId/story-bible" params={{ novelId }} search={{ view: 'secrets', fact: reference.factKey }} className={styles.referenceLink}>
                  {secretTitle(reference.factKey)}
                </Link>{' '}
                names “{reference.subject}”, which is no longer in the bible.
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
