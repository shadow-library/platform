import { AppError } from '@shadow-library/common';

import { PROMPT_REGISTRY } from '../../ai/prompts';
import { blueprintStep, BlueprintStepRegistry, validateBlueprintSteps } from '../engine/blueprint-step.registry';
import { conceptsStep } from './concepts.step';
import { enginePass } from './engine.step';
import { heartStep } from './heart.step';
import { oppositionStep } from './opposition.step';
import { powerStep } from './power.step';
import { premiseStep } from './premise.step';
import { protagonistStep } from './protagonist.step';
import { promiseStep } from './promise.step';
import { startStep } from './start.step';
import { tasteStep } from './taste.step';
import { titleStep } from './title.step';
import { worldStep } from './world.step';

export const BLUEPRINT_STEPS = [
  blueprintStep(startStep),
  blueprintStep(tasteStep),
  blueprintStep(conceptsStep),
  blueprintStep(premiseStep),
  blueprintStep(heartStep),
  blueprintStep(promiseStep),
  blueprintStep(titleStep),
  blueprintStep(enginePass),
  blueprintStep(protagonistStep),
  blueprintStep(oppositionStep),
  blueprintStep(worldStep),
  blueprintStep(powerStep),
];

const issues = validateBlueprintSteps(BLUEPRINT_STEPS, PROMPT_REGISTRY);
if (issues.length > 0) throw AppError.internal(`Blueprint step registry is invalid: ${issues.join('; ')}`);

export const BLUEPRINT_STEP_REGISTRY = new BlueprintStepRegistry(BLUEPRINT_STEPS);
