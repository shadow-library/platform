/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Authenticated } from '@shadow-library/auth/module';
import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AiModelOption, AiModelsResponse } from './ai.dto';
import { getGroupDefaults } from './defaults';
import { MODEL_REGISTRY } from './models';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Authenticated()
@HttpController('/api/v1/ai')
export class AiController {
  @Get('/models')
  @RespondFor(200, AiModelsResponse)
  listModels(): AiModelsResponse {
    const registry: AiModelOption[] = MODEL_REGISTRY.map(m => ({
      id: m.id,
      provider: m.provider,
      label: m.id,
      kind: m.kind,
      enabled: true,
      contextWindow: m.contextWindow,
      inputPricePerMToken: m.inputPricePerMToken,
      outputPricePerMToken: m.outputPricePerMToken,
      supportsTools: m.supportsTools,
      supportsStructuredOutput: m.supportsStructuredOutput,
    }));

    // The author picks a model per group, not per fine-grained role. `embedding` is locked (its vector
    // dimension is bound to the pgvector schema), so it isn't offered. The response's `role` field
    // carries the group key (`writing` | `planning` | `review` | `chat` | `helper` | `image`).
    const groupDefaults = getGroupDefaults();
    const defaults = Object.entries(groupDefaults)
      .filter(([group]) => group !== 'embedding')
      .map(([group, resolved]) => ({ role: group, provider: resolved.provider, model: resolved.model }));

    return { profile: process.env['AI_PROFILE'] ?? 'production', models: registry, defaults };
  }
}
