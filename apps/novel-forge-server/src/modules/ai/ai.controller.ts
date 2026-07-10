/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Config } from '@shadow-library/common';
import { Get, HttpController, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AiModelOption, AiModelsResponse } from './ai.dto';
import { getProfileDefaults } from './defaults';
import { MODEL_REGISTRY } from './models';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// Subprocess providers aren't in MODEL_REGISTRY (they shell out to a CLI). They're surfaced as pickable
// options whose `enabled` reflects the server flag that gates them, and whose `id` is the CLI model alias.
const SUBPROCESS_OPTIONS: { id: string; provider: string; label: string; flag: 'ai.claude-code.enabled' | 'ai.codex.enabled' }[] = [
  // The `id` is passed to the CLI as its model alias (`claude --model <id>` / codex default).
  { id: 'sonnet', provider: 'anthropic-claude-code', label: 'Claude Code · Sonnet', flag: 'ai.claude-code.enabled' },
  { id: 'haiku', provider: 'anthropic-claude-code', label: 'Claude Code · Haiku', flag: 'ai.claude-code.enabled' },
  { id: 'codex', provider: 'openai-codex', label: 'Codex (CLI)', flag: 'ai.codex.enabled' },
];

@HttpController('/ai')
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

    const subprocess: AiModelOption[] = SUBPROCESS_OPTIONS.map(s => ({
      id: s.id,
      provider: s.provider,
      label: s.label,
      kind: 'llm',
      enabled: Config.get(s.flag),
      supportsTools: false,
      supportsStructuredOutput: false,
    }));

    const profileDefaults = getProfileDefaults();
    const defaults = Object.entries(profileDefaults).map(([role, resolved]) => ({ role, provider: resolved.provider, model: resolved.model }));

    return { profile: process.env['AI_PROFILE'] ?? 'production', models: [...registry, ...subprocess], defaults };
  }
}
