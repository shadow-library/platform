import { AppError } from '@shadow-library/common';

import { PROMPT_REGISTRY } from '../../ai/prompts';
import { blueprintStep, BlueprintStepRegistry, validateBlueprintSteps } from '../engine/blueprint-step.registry';
import { startStep } from './start.step';

export const BLUEPRINT_STEPS = [blueprintStep(startStep)];

const issues = validateBlueprintSteps(BLUEPRINT_STEPS, PROMPT_REGISTRY);
if (issues.length > 0) throw AppError.internal(`Blueprint step registry is invalid: ${issues.join('; ')}`);

export const BLUEPRINT_STEP_REGISTRY = new BlueprintStepRegistry(BLUEPRINT_STEPS);
