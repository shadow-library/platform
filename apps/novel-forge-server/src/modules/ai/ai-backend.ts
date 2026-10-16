import { Config } from '@shadow-library/common';

export type AiBackend = 'synapse' | 'legacy';

export const AI_BACKENDS: readonly AiBackend[] = ['synapse', 'legacy'];

/** Only an explicit `synapse` selects it: a test that never loads `bootstrap.ts` stays on the legacy path. */
export function isSynapseBackend(): boolean {
  return Config.get('ai.backend') === 'synapse';
}
