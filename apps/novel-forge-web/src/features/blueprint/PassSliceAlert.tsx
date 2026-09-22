import { type ReactElement } from 'react';
import { Alert } from '@shadow-library/ui';

export interface PassSliceAlertProps {
  /** `step.sliceMoved`: the screen is locked and a later whole-pass rerun reworked the part it was locked from. */
  moved: boolean;
  /** Replaces the draft with what the round now offers. Omit while a round is running, so nothing is adopted mid-flight. */
  onAdopt?: () => void;
}

/** Shown on a screen fed by a pass, so an answer is never quietly replaced by options it was not locked from. */
export function PassSliceAlert({ moved, onAdopt }: PassSliceAlertProps): ReactElement | null {
  if (!moved) return null;
  return (
    <Alert intent="warning" title="These options changed after you locked this step" action={onAdopt ? { label: 'Use the new version', onClick: onAdopt } : undefined}>
      One generation writes several screens, and the whole of it has been run again since you answered here. What you decided still stands until you lock again — take the new
      version to answer from what is on screen now.
    </Alert>
  );
}
