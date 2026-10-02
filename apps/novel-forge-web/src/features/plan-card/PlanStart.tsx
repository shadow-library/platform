import { useId, useState } from 'react';
import { Button, Textarea } from '@shadow-library/ui';

import { OptionCard } from '@/features/shared';

import styles from './PlanStart.module.css';

export interface PlanDirection {
  key: string;
  title: string;
  /** What happens in it. */
  what: string;
  /** Which of the story's obligations it pays off or moves. */
  pays?: string;
  costs?: string;
}

export interface PlanStartProps {
  chapter: number;
  /** The chat's suggested directions; optional — the author can skip them. */
  directions?: readonly PlanDirection[];
  /** The direction a plan is being made from, shown picked. */
  picked?: string;
  /** A plan action is already starting; every path waits for it. */
  busy?: boolean;
  onPickDirection?: (direction: PlanDirection) => void;
  onPlanFromIntent: (intent: string) => void;
  onEmptyPlan: () => void;
  onWriteMyself: () => void;
}

type Phase = 'choose' | 'intent' | 'manual';

export function PlanStart({ chapter, directions = [], picked, busy, onPickDirection, onPlanFromIntent, onEmptyPlan, onWriteMyself }: PlanStartProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('choose');
  const [intent, setIntent] = useState('');
  const intentId = useId();

  if (phase === 'intent')
    return (
      <div className={styles.start}>
        <form
          aria-label={`Your idea for chapter ${chapter}`}
          className={styles.panel}
          onSubmit={event => {
            event.preventDefault();
            if (intent.trim()) onPlanFromIntent(intent.trim());
          }}
        >
          <label htmlFor={intentId} className={styles.label}>
            What happens in chapter {chapter}
          </label>
          <Textarea id={intentId} minRows={3} autoFocus value={intent} onValueChange={setIntent} placeholder="She sells the lamp, and regrets it by nightfall." />
          <div className={styles.row}>
            <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!intent.trim()}>
              Make the plan
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPhase('choose')}>
              Back
            </Button>
            <span className={styles.aside}>No directions, no questions — straight to a plan card.</span>
          </div>
        </form>
      </div>
    );

  if (phase === 'manual')
    return (
      <div className={styles.start}>
        <section aria-label={`Write chapter ${chapter} yourself`} className={styles.panel}>
          <span className={styles.panelTitle}>Chapter {chapter} — your draft</span>
          <span className={styles.body}>
            Opens the chapter in an empty editor, saved as you type. When you’re done, Approve and Finalize work the same as for a written chapter. A plan is optional; adding one
            lets the checks see what the chapter meant to do.
          </span>
          <div className={styles.row}>
            <Button variant="primary" size="sm" onClick={onWriteMyself}>
              Open the editor
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPhase('choose')}>
              Back
            </Button>
          </div>
        </section>
      </div>
    );

  return (
    <div className={styles.start}>
      {directions.length > 0 && (
        <div role="group" aria-label={`Ways chapter ${chapter} could go`} className={styles.grid}>
          {directions.map((direction, index) => (
            <OptionCard
              key={direction.key}
              title={direction.title}
              description={direction.what}
              selected={picked === direction.key}
              disabled={busy || !onPickDirection}
              onSelect={() => onPickDirection?.(direction)}
            >
              <span className={styles.aside}>Option {String.fromCharCode(65 + index)}</span>
              {direction.pays && <span className={styles.aside}>Pays off: {direction.pays}</span>}
              {direction.costs && <span className={styles.aside}>Costs: {direction.costs}</span>}
            </OptionCard>
          ))}
        </div>
      )}
      <div role="group" aria-label="Or plan it your way" className={styles.grid}>
        <button type="button" className={styles.alt} disabled={busy} onClick={() => setPhase('intent')}>
          <span className={styles.altTitle}>I know what happens</span>
          <span className={styles.aside}>Say it in a line; I’ll turn it into a plan you can edit.</span>
        </button>
        <button type="button" className={styles.alt} disabled={busy} onClick={onEmptyPlan}>
          <span className={styles.altTitle}>Write the plan myself</span>
          <span className={styles.aside}>An empty plan card. The writer uses what you put in it.</span>
        </button>
        <button type="button" className={styles.alt} disabled={busy} onClick={() => setPhase('manual')}>
          <span className={styles.altTitle}>Write it myself</span>
          <span className={styles.aside}>An empty chapter. No plan needed — add one later if you like.</span>
        </button>
      </div>
    </div>
  );
}
