import { AppError } from '@shadow-library/common';

import { PROMPT_REGISTRY } from '../../ai/prompts';
import { blueprintStep, BlueprintStepRegistry, validateBlueprintSteps } from '../engine/blueprint-step.registry';
import { conceptsStep } from './concepts.step';
import { heartStep } from './heart.step';
import { premiseStep } from './premise.step';
import { promiseStep } from './promise.step';
import { startStep } from './start.step';
import { tasteStep } from './taste.step';
import { titleStep } from './title.step';

export const BLUEPRINT_STEPS = [
  blueprintStep(startStep),
  blueprintStep(tasteStep),
  blueprintStep(conceptsStep),
  blueprintStep(premiseStep),
  blueprintStep(heartStep),
  blueprintStep(promiseStep),
  blueprintStep(titleStep),
];

const issues = validateBlueprintSteps(BLUEPRINT_STEPS, PROMPT_REGISTRY);
if (issues.length > 0) throw AppError.internal(`Blueprint step registry is invalid: ${issues.join('; ')}`);

export const BLUEPRINT_STEP_REGISTRY = new BlueprintStepRegistry(BLUEPRINT_STEPS);
