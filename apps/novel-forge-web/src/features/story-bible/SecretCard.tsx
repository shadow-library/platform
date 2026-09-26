import { type ReactElement } from 'react';

import { Button } from '@shadow-library/ui';

import { LockIcon } from '@/components/icons';
import { StatusChip } from '@/components/nf';
import { type FactResponse } from '@/lib/apis';
import { secretRevealLabel, secretTitle } from '@/lib/bible-secrets';

import { SecretStates } from './SecretStates';
import styles from './StoryBible.module.css';

export const TERMS_SHOWN = 3;

export function RevealChip({ fact }: { fact: FactResponse }): ReactElement {
  return (
    <StatusChip intent="warning">
      <LockIcon size={11} />
      {secretRevealLabel(fact)}
    </StatusChip>
  );
}

interface TermChipsProps {
  terms: readonly string[];
  limit?: number;
}

export function TermChips({ terms, limit }: TermChipsProps): ReactElement {
  const shown = limit === undefined ? terms : terms.slice(0, limit);
  const rest = terms.length - shown.length;
  return (
    <>
      {shown.map(term => (
        <StatusChip key={term} intent="neutral">
          {term}
        </StatusChip>
      ))}
      {rest > 0 && <StatusChip intent="neutral">+{rest}</StatusChip>}
    </>
  );
}

interface SecretCardProps {
  novelId: string;
  fact: FactResponse;
  onEdit: (fact: FactResponse) => void;
}

export function SecretCard({ novelId, fact, onEdit }: SecretCardProps): ReactElement {
  const title = secretTitle(fact.factKey);
  const terms = fact.terms ?? [];

  return (
    <article className={styles.secretCard} aria-label={title}>
      <div className={styles.secretCardHead}>
        <h4 className={styles.secretTitle}>{title}</h4>
        <RevealChip fact={fact} />
        <Button variant="secondary" size="sm" onClick={() => onEdit(fact)} aria-label={`Edit ${title}`}>
          Edit
        </Button>
      </div>
      <SecretStates novelId={novelId} fact={fact} />
      {terms.length > 0 && (
        <div className={styles.terms}>
          <span className={styles.label}>Never named early</span>
          <TermChips terms={terms} limit={TERMS_SHOWN} />
        </div>
      )}
    </article>
  );
}
