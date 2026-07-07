/**
 * Importing npm packages
 */
import { Children, isValidElement, type ReactElement, type ReactNode, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import { Button } from '../Button';
import styles from './Stepper.module.css';
import { type StepperProps, type StepperStepProps, type StepState } from './Stepper.types';

/**
 * Declaring the constants
 */
const STATE_WORD: Record<StepState, string> = { completed: 'completed', current: 'current', upcoming: 'upcoming', error: 'needs review', skipped: 'skipped' };

/** Marker component — the parent reads its props and renders the current step's children. */
export function StepperStep(_: StepperStepProps): null {
  return null;
}

function isStepElement(node: ReactNode): node is ReactElement<StepperStepProps> {
  return isValidElement(node) && node.type === StepperStep;
}

function CheckGlyph() {
  return (
    <svg viewBox='0 0 16 16' width='14' height='14' fill='none' stroke='currentColor' strokeWidth={2.25} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <path d='M3.5 8.5l3 3 6-6.5' />
    </svg>
  );
}

/**
 * Multi-step flow progress with a validation-gated state machine — the indicator, content region, and
 * wizard footer shipped together so the grammar can't drift between flows. Forward movement is gated on
 * per-step validation; backward movement is always free and preserves step data. Revisiting a step
 * resets its declared downstream dependencies to upcoming (the invalidation contract). State is carried
 * by glyphs (check / number / ! / dash), never color alone. A headless `useStepper` is a follow-up.
 */
function StepperRoot({
  current,
  defaultCurrent = 0,
  onCurrentChange,
  linear = true,
  orientation = 'horizontal',
  status,
  continueLabel = 'Continue',
  finishLabel = 'Finish',
  children,
  className,
}: StepperProps) {
  const steps = Children.toArray(children)
    .filter(isStepElement)
    .map(child => child.props);
  const total = steps.length;

  const isControlled = current !== undefined;
  const [internal, setInternal] = useState(defaultCurrent);
  const index = Math.min(isControlled ? current : internal, Math.max(0, total - 1));

  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const firstMount = useRef(true);

  // Move focus to each new step's content region on transition (the div is keyed by index, so this
  // callback ref fires per step) — never strand the user on a stale Continue button.
  function focusContent(node: HTMLElement | null): void {
    if (!node) return;
    if (firstMount.current) {
      firstMount.current = false;
      return;
    }
    node.focus();
  }

  function goTo(next: number): void {
    if (next < 0 || next >= total) return;
    if (!isControlled) setInternal(next);
    onCurrentChange?.(next);
  }

  function stateOf(step: StepperStepProps, i: number): StepState {
    if (errors.has(step.id)) return 'error';
    if (i === index) return 'current';
    if (skipped.has(step.id)) return 'skipped';
    if (completed.has(step.id)) return 'completed';
    return 'upcoming';
  }

  function reachable(step: StepperStepProps, i: number): boolean {
    if (!linear) return true;
    return i <= index || completed.has(step.id) || skipped.has(step.id);
  }

  async function onContinue(): Promise<void> {
    const step = steps[index];
    if (!step) return;
    if (step.validate) {
      setBusy(true);
      const ok = await step.validate();
      setBusy(false);
      if (!ok) return; // the step focuses its own first invalid field
    }
    setCompleted(prev => new Set(prev).add(step.id));
    setErrors(prev => {
      const next = new Set(prev);
      next.delete(step.id);
      return next;
    });
    // Invalidation contract — revisiting this step resets its declared dependents.
    if (step.invalidates?.length) {
      setCompleted(prev => {
        const next = new Set(prev);
        for (const id of step.invalidates ?? []) next.delete(id);
        return next;
      });
    }
    if (index === total - 1) {
      await step.onFinish?.();
      return;
    }
    goTo(index + 1);
  }

  function onSkip(): void {
    const step = steps[index];
    if (!step) return;
    setSkipped(prev => new Set(prev).add(step.id));
    goTo(index + 1);
  }

  function onStepClick(step: StepperStepProps, i: number): void {
    if (i === index || !reachable(step, i)) return;
    goTo(i);
  }

  const currentStep = steps[index];
  const isLast = index === total - 1;
  const defaultStatus = `Step ${index + 1} of ${total}`;

  return (
    <div className={cn(styles.root, className)} data-orientation={orientation}>
      <nav className={styles.indicator} aria-label='Progress'>
        <ol className={styles.list}>
          {steps.map((step, i) => {
            const state = stateOf(step, i);
            const canClick = reachable(step, i) && i !== index;
            const label = `${typeof step.label === 'string' ? step.label : `Step ${i + 1}`}, step ${i + 1} of ${total}, ${STATE_WORD[state]}`;
            return (
              <li key={step.id} className={styles.stepItem}>
                {i > 0 ? <span className={styles.connector} data-done={completed.has(steps[i - 1]?.id ?? '') || undefined} aria-hidden='true' /> : null}
                <button
                  type='button'
                  className={styles.step}
                  data-state={state}
                  aria-current={i === index ? 'step' : undefined}
                  aria-disabled={canClick || i === index ? undefined : true}
                  aria-label={label}
                  onClick={() => onStepClick(step, i)}
                >
                  <span className={styles.dot} data-state={state} aria-hidden='true'>
                    {state === 'completed' ? <CheckGlyph /> : state === 'error' ? '!' : state === 'skipped' ? '–' : i + 1}
                  </span>
                  <span className={styles.labels}>
                    <span className={styles.label}>{step.label}</span>
                    {step.hint != null || step.optional ? <span className={styles.hint}>{step.hint ?? 'Optional'}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section key={index} ref={focusContent} className={styles.content} tabIndex={-1} aria-label={typeof currentStep?.label === 'string' ? currentStep.label : 'Step content'}>
        {currentStep?.children}
      </section>

      <div className={styles.footer}>
        <Button variant='secondary' onClick={() => goTo(index - 1)} disabled={index === 0}>
          Back
        </Button>
        <span className={styles.status} aria-live='polite'>
          {status ?? defaultStatus}
        </span>
        <span className={styles.footerActions}>
          {currentStep?.optional && !isLast ? (
            <Button variant='ghost' onClick={onSkip}>
              Skip
            </Button>
          ) : null}
          <Button variant='primary' loading={busy} onClick={onContinue}>
            {isLast ? finishLabel : continueLabel}
          </Button>
        </span>
      </div>
    </div>
  );
}

export const Stepper = Object.assign(StepperRoot, { Step: StepperStep });
