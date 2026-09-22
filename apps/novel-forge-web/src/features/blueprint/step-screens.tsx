import { type ReactElement } from 'react';

import { type StepScreenProps } from './blueprint-steps';
import { ConceptsStep } from './ConceptsStep';
import { HeartStep } from './HeartStep';
import { PremiseStep } from './PremiseStep';
import { PromiseStep } from './PromiseStep';
import { StartStep } from './StartStep';
import { TasteStep } from './TasteStep';
import { TitleStep } from './TitleStep';

export type StepScreenRenderer = (props: StepScreenProps) => ReactElement;

/** The screen each step key renders. A step the server registers before its screen exists is simply absent here. */
export const BLUEPRINT_STEP_SCREENS: Record<string, StepScreenRenderer> = {
  start: props => <StartStep {...props} />,
  taste: props => <TasteStep {...props} />,
  concepts: props => <ConceptsStep {...props} />,
  premise: props => <PremiseStep {...props} />,
  heart: props => <HeartStep {...props} />,
  promise: props => <PromiseStep {...props} />,
  title: props => <TitleStep {...props} />,
};

export function blueprintStepScreen(key: string): StepScreenRenderer | null {
  return BLUEPRINT_STEP_SCREENS[key] ?? null;
}
