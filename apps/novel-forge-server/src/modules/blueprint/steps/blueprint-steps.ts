import { AppError } from '@shadow-library/common';

import { PROMPT_REGISTRY } from '../../ai/prompts';
import { blueprintStep, BlueprintStepRegistry, validateBlueprintSteps } from '../engine/blueprint-step.registry';
import { arcsStep } from './arcs.step';
import { briefsStep } from './briefs.step';
import { castStep } from './cast.step';
import { checkStep } from './check.step';
import { conceptsStep } from './concepts.step';
import { enginePass } from './engine.step';
import { heartStep } from './heart.step';
import { oppositionStep } from './opposition.step';
import { powerStep } from './power.step';
import { placesStep } from './places.step';
import { premiseStep } from './premise.step';
import { protagonistStep } from './protagonist.step';
import { promiseStep } from './promise.step';
import { spinePass } from './spine-pass.step';
import { spineStep } from './spine.step';
import { startStep } from './start.step';
import { tasteStep } from './taste.step';
import { titleStep } from './title.step';
import { voiceStep } from './voice.step';
import { volumeOnePass } from './volume-one-pass.step';
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
  blueprintStep(spinePass),
  blueprintStep(spineStep),
  blueprintStep(volumeOnePass),
  blueprintStep(castStep),
  blueprintStep(placesStep),
  blueprintStep(arcsStep),
  blueprintStep(briefsStep),
  blueprintStep(voiceStep),
  blueprintStep(checkStep),
];

const issues = validateBlueprintSteps(BLUEPRINT_STEPS, PROMPT_REGISTRY);
if (issues.length > 0) throw AppError.internal(`Blueprint step registry is invalid: ${issues.join('; ')}`);

export const BLUEPRINT_STEP_REGISTRY = new BlueprintStepRegistry(BLUEPRINT_STEPS);
