import { type ReactElement, useId, useState } from 'react';

import { Button } from '@shadow-library/ui';

import { EyeIcon, EyeOffIcon, LockIcon } from '@/components/icons';
import { StatusChip } from '@/components/nf';
import { type FactResponse } from '@/lib/apis';
import { secretRevealLabel, secretTitle } from '@/lib/bible-secrets';
import { factHiddenFromWriter } from '@/lib/canon-facts';

import styles from './StoryBible.module.css';

export const TERMS_SHOWN = 3;

const CONCEALED_TRUTH = 'The truth stays out of the page until you choose to show it here.';

export function writerNoteText(fact: Pick<FactResponse, 'writerNote' | 'knowledge'>): string {
  if (factHiddenFromWriter(fact)) return 'Nothing — the writer never sees this until it is revealed.';
  return fact.writerNote?.trim() ?? '';
}

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
  fact: FactResponse;
  onEdit: (fact: FactResponse) => void;
}

/** Until it is shown the truth is not in the page at all — the blur covers fixed filler, so neither a screen reader nor a stray copy can spoil it. */
export function SecretCard({ fact, onEdit }: SecretCardProps): ReactElement {
  const [shown, setShown] = useState(false);
  const truthId = useId();
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
      <div className={styles.secretCols}>
        <div className={styles.secretCol}>
          <p className={styles.label}>What the writer is told</p>
          <p className={styles.secretText}>{writerNoteText(fact)}</p>
        </div>
        <div className={styles.secretCol}>
          <p className={styles.label}>The truth</p>
          <p id={truthId} className={shown ? styles.secretText : `${styles.secretText} ${styles.blurred}`} aria-hidden={!shown}>
            {shown ? fact.text : CONCEALED_TRUTH}
          </p>
          <div>
            <Button
              variant="ghost"
              size="sm"
              prefix={shown ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
              aria-controls={truthId}
              aria-expanded={shown}
              onClick={() => setShown(value => !value)}
            >
              {shown ? 'Hide truth' : 'Show truth'}
            </Button>
          </div>
        </div>
      </div>
      {terms.length > 0 && (
        <div className={styles.terms}>
          <span className={styles.label}>Never named early</span>
          <TermChips terms={terms} limit={TERMS_SHOWN} />
        </div>
      )}
    </article>
  );
}
