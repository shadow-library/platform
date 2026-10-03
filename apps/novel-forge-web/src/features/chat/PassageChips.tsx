import { IconButton } from '@shadow-library/ui';

import { CloseIcon } from '@/components/icons';
import { type ChatPassageContextResponse } from '@/lib/apis';
import { type PassageChip, passageRef } from '@/lib/passage-comments';

import styles from './Chat.module.css';

export interface ComposerPassagesProps {
  chips: readonly PassageChip[];
  onReveal: (chip: PassageChip) => void;
  onRemove: (id: string) => void;
}

export function ComposerPassages({ chips, onReveal, onRemove }: ComposerPassagesProps): React.JSX.Element {
  return (
    <ul className={styles.passages} aria-label="Passage comments">
      {chips.map(chip => {
        const { chapter, quote, comment } = chip.context;
        const label = passageRef(chapter, chip.firstParagraph, chip.lastParagraph);
        return (
          <li key={chip.id} className={styles.passage} data-stale={chip.stale || undefined}>
            <button type="button" className={styles.passageOpen} title={quote} onClick={() => onReveal(chip)}>
              <span className={styles.passageRef}>{label}</span>
              <span className={styles.passageText}>
                <span className={styles.passageQuote}>{quote}</span>
                {chip.stale ? <span className={styles.passageStale}>changed — select it again</span> : comment && <span className={styles.passageComment}>{comment}</span>}
              </span>
            </button>
            <IconButton variant="ghost" size="sm" aria-label={`Remove the comment on ${label}`} icon={<CloseIcon size={14} />} onClick={() => onRemove(chip.id)} />
          </li>
        );
      })}
    </ul>
  );
}

/** The passages a sent message commented on, above its bubble, numbered as the server anchored them. */
export function SentPassages({ contexts }: { contexts: readonly ChatPassageContextResponse[] }): React.JSX.Element {
  return (
    <ul className={styles.sentPassages} aria-label="Passages commented on">
      {contexts.map((context, index) => (
        <li key={`${index}:${context.start}`} className={styles.sentPassage}>
          <span className={styles.sentPassageHead}>
            <span className={styles.passageRef}>{passageRef(context.chapter, context.firstParagraph, context.lastParagraph)}</span>
            <span className={styles.passageQuote} title={context.quote}>
              {context.quote}
            </span>
          </span>
          {context.comment && <span className={styles.passageComment}>{context.comment}</span>}
        </li>
      ))}
    </ul>
  );
}
