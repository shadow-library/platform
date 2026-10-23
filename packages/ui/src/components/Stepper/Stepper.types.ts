import { type ReactNode } from 'react';

export type StepperOrientation = 'horizontal' | 'vertical';

export type StepState = 'completed' | 'current' | 'upcoming' | 'error' | 'skipped';

export interface StepperStepProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  /** Optional steps can be skipped; skipping marks a neutral dash, and Finish reports it. */
  optional?: boolean;
  /** Sync or async gate run when leaving the step forward; `false` blocks advance. */
  validate?: () => boolean | Promise<boolean>;
  /** Downstream step ids reset to upcoming when this step's answer changes (revisit). */
  invalidates?: string[];
  onFinish?: () => void | Promise<void>;
  children?: ReactNode;
}

export interface StepperProps {
  /** Controlled current step index (0-based). */
  current?: number;
  /** Initial step index (uncontrolled). @default 0 */
  defaultCurrent?: number;
  /** Fires when the current step changes. */
  onCurrentChange?: (index: number) => void;
  /** Linear flows gate forward movement on validation; backward is always free. @default true */
  linear?: boolean;
  /** Indicator layout. @default 'horizontal' */
  orientation?: StepperOrientation;
  status?: ReactNode;
  /** Label for the Continue button. @default 'Continue' */
  continueLabel?: ReactNode;
  /** Label for the terminal button on the last step. @default 'Finish' */
  finishLabel?: ReactNode;
  children: ReactNode;
  className?: string;
}
