/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Authenticated } from '@shadow-library/auth/module';
import { Config } from '@shadow-library/common';
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

// Subprocess providers aren't in MODEL_REGISTRY (they shell out to a CLI). They're surfaced as pickable
// options whose `enabled` reflects the server flag that gates them, and whose `id` is the CLI model alias.
const SUBPROCESS_OPTIONS: { id: string; provider: string; label: string; flag: 'ai.claude-code.enabled' | 'ai.codex.enabled' | 'ai.grok-build.enabled' }[] = [
  // The `id` is passed to the CLI as its model alias (`claude --model <id>` / codex + grok-build default).
  // `fable`/`opus`/`sonnet`/`haiku` are the aliases the `claude` CLI accepts for its latest models.
  { id: 'fable', provider: 'anthropic-claude-code', label: 'Claude Code · Fable', flag: 'ai.claude-code.enabled' },
  { id: 'opus', provider: 'anthropic-claude-code', label: 'Claude Code · Opus', flag: 'ai.claude-code.enabled' },
  { id: 'sonnet', provider: 'anthropic-claude-code', label: 'Claude Code · Sonnet', flag: 'ai.claude-code.enabled' },
  { id: 'haiku', provider: 'anthropic-claude-code', label: 'Claude Code · Haiku', flag: 'ai.claude-code.enabled' },
  // The `id` is passed to `codex exec --model <id>`.
  { id: 'gpt-5.5', provider: 'openai-codex', label: 'Codex · GPT-5.5', flag: 'ai.codex.enabled' },
  { id: 'gpt-5.5-mini', provider: 'openai-codex', label: 'Codex · GPT-5.5 mini', flag: 'ai.codex.enabled' },
  { id: 'gpt-4.4', provider: 'openai-codex', label: 'Codex · GPT-4.4', flag: 'ai.codex.enabled' },
  { id: 'grok-build', provider: 'xai-grok-build', label: 'Grok Build (CLI)', flag: 'ai.grok-build.enabled' },
];

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

    const subprocess: AiModelOption[] = SUBPROCESS_OPTIONS.map(s => ({
      id: s.id,
      provider: s.provider,
      label: s.label,
      kind: 'llm',
      enabled: Config.get(s.flag),
      supportsTools: false,
      supportsStructuredOutput: false,
    }));

    // The author picks a model per group, not per fine-grained role. `embedding` is locked (its vector
    // dimension is bound to the pgvector schema), so it isn't offered. The response's `role` field
    // carries the group key (`writing` | `planning` | `review` | `chat` | `helper` | `image`).
    const groupDefaults = getGroupDefaults();
    const defaults = Object.entries(groupDefaults)
      .filter(([group]) => group !== 'embedding')
      .map(([group, resolved]) => ({ role: group, provider: resolved.provider, model: resolved.model }));

    return { profile: process.env['AI_PROFILE'] ?? 'production', models: [...registry, ...subprocess], defaults };
  }
}
