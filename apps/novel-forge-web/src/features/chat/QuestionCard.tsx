import { useId } from 'react';

import { type QuestionBlock, type QuestionOption } from './chat-view';
import styles from './Chat.module.css';

export interface QuestionCardProps {
  question: QuestionBlock;
  /** A later turn answered it: the options stay readable but can no longer be picked. */
  settled: boolean;
  disabled: boolean;
  onPick: (option: QuestionOption) => void;
  onUndecided: () => void;
}

export function QuestionCard({ question, settled, disabled, onPick, onUndecided }: QuestionCardProps): React.JSX.Element {
  const titleId = useId();
  const locked = settled || disabled;
  return (
    <section className={styles.question} aria-labelledby={titleId} data-settled={settled || undefined}>
      <span id={titleId} className={styles.questionTitle}>
        {question.question}
      </span>
      {question.why && <span className={styles.questionWhy}>{question.why}</span>}
      <div className={styles.questionOptions}>
        {question.options.map(option => (
          <button key={option.title} type="button" className={styles.option} disabled={locked} onClick={() => onPick(option)}>
            <span className={styles.optionHead}>
              <span className={styles.optionTitle}>{option.title}</span>
              {option.recommended && <span className={styles.badgeAccent}>My pick</span>}
            </span>
            {option.why && <span className={styles.optionWhy}>{option.why}</span>}
            {option.tradeOff && <span className={styles.caption}>Trade-off: {option.tradeOff}</span>}
          </button>
        ))}
      </div>
      {!settled && (
        <span className={styles.questionWhy}>
          Or answer in your own words below ·{' '}
          <button type="button" className={styles.textLink} disabled={disabled} onClick={onUndecided}>
            Undecided for now
          </button>
        </span>
      )}
    </section>
  );
}
