import { useId, useState } from 'react';
import { Button } from '@shadow-library/ui';

import { type QuestionBlock, type QuestionOption } from './chat-view';
import styles from './Chat.module.css';

export interface QuestionCardViewProps {
  question: QuestionBlock;
  eyebrow: string;
  selected?: number;
  settled: boolean;
  disabled: boolean;
  onSelect: (index: number) => void;
  onConfirm: (option: QuestionOption) => void;
  onUndecided: () => void;
  onOwnWords: () => void;
}

export function QuestionCardView({ question, eyebrow, selected, settled, disabled, onSelect, onConfirm, onUndecided, onOwnWords }: QuestionCardViewProps): React.JSX.Element {
  const eyebrowId = useId();
  const titleId = useId();
  const locked = settled || disabled;
  const chosen = selected === undefined ? undefined : question.options[selected];
  return (
    <section className={styles.question} aria-labelledby={`${eyebrowId} ${titleId}`} data-settled={settled || undefined}>
      <span id={eyebrowId} className={`nf-eyebrow ${styles.questionEyebrow}`}>
        {eyebrow}
      </span>
      <span id={titleId} className={styles.questionTitle}>
        {question.question}
      </span>
      {question.why && <span className={styles.questionWhy}>{question.why}</span>}
      <div className={styles.questionOptions}>
        {question.options.map((option, index) => (
          <button key={option.title} type="button" className={styles.option} aria-pressed={selected === index} disabled={locked} onClick={() => onSelect(index)}>
            <span className={styles.optionHead}>
              <span className={styles.optionTitle}>{option.title}</span>
              {option.recommended && <span className={styles.badgeAccent}>Claude’s pick</span>}
            </span>
            {option.why && <span className={styles.optionWhy}>{option.why}</span>}
            {option.tradeOff && <span className={`${styles.caption} ${styles.optionTradeOff}`}>Trade-off: {option.tradeOff}</span>}
          </button>
        ))}
      </div>
      {!settled && (
        <div className={styles.questionFoot}>
          <div className={styles.row}>
            <Button size="sm" variant="ghost" onClick={onOwnWords}>
              Answer in my own words
            </Button>
            <Button size="sm" variant="ghost" disabled={disabled} onClick={onUndecided}>
              Undecided for now
            </Button>
          </div>
          <Button size="sm" variant="primary" className={styles.questionConfirm} disabled={disabled || !chosen} onClick={() => chosen && onConfirm(chosen)}>
            <span className={styles.questionConfirmLabel}>{chosen ? `Answer: ${chosen.title}` : 'Choose an option'}</span>
          </Button>
        </div>
      )}
    </section>
  );
}

export interface QuestionCardProps {
  question: QuestionBlock;
  eyebrow: string;
  /** A later turn answered it: the options stay readable but can no longer be picked. */
  settled: boolean;
  disabled: boolean;
  onPick: (option: QuestionOption) => void;
  onUndecided: () => void;
  onOwnWords: () => void;
}

export function QuestionCard({ onPick, settled, ...props }: QuestionCardProps): React.JSX.Element {
  const [selected, setSelected] = useState<number>();
  return (
    <QuestionCardView
      {...props}
      settled={settled}
      selected={settled ? undefined : selected}
      onSelect={index => setSelected(current => (current === index ? undefined : index))}
      onConfirm={onPick}
    />
  );
}
