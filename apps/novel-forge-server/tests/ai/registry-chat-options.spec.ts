import { describe, expect, it } from 'bun:test';

import { UNRESTRICTED_LLM_ALLOWLIST } from '@modules/ai/defaults';
import { registryChatOptions } from '@modules/ai/model-catalog.service';

describe('registryChatOptions', () => {
  it('should offer a standard chat every registry LLM and an unrestricted one only the allowlist', () => {
    expect(registryChatOptions('standard')).toContain('anthropic/claude-haiku-4.5');
    expect(registryChatOptions('standard')).not.toContain('qwen3-embedding:0.6b');
    expect(registryChatOptions('unrestricted').sort()).toEqual([...UNRESTRICTED_LLM_ALLOWLIST].sort());
  });
});
