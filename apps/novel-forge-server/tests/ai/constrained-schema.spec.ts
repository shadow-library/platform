import { describe, expect, it } from 'bun:test';

import { buildChatRefinePrompt, PROMPT_REGISTRY } from '@modules/ai/prompts';
import { BibleContradictionSchema } from '@modules/ai/schemas/bible-contradiction.schema';
import { toConstrainedSchema, toHostedPromptSchema } from '@modules/ai/schemas/validate';

type Json = Record<string, unknown>;

describe('toConstrainedSchema', () => {
  const override = { items: { anyOf: [{ type: 'object', properties: { op: { enum: ['x'] } } }] } };

  it('should override the nested property its path addresses and leave the rest of the schema as hosted', () => {
    const hosted = toHostedPromptSchema(BibleContradictionSchema);
    const constrained = toConstrainedSchema(BibleContradictionSchema, { 'contradictions[].changeSet': override });
    const item = (schema: Json): Json => ((schema['properties'] as Json)['contradictions'] as Json)['items'] as Json;

    expect(((item(constrained)['properties'] as Json)['changeSet'] as Json)['items']).toEqual(override.items);
    expect({ ...(item(constrained)['properties'] as Json), changeSet: null }).toEqual({ ...(item(hosted)['properties'] as Json), changeSet: null });
  });

  it('should refuse a top-level path for a field that exists only nested, so a name match never reaches it by accident', () => {
    expect(() => toConstrainedSchema(BibleContradictionSchema, { changeSet: override })).toThrow();
    expect(() => toConstrainedSchema(BibleContradictionSchema, { 'contradictions[].missing': override })).toThrow();
  });

  it('should keep every constrained schema free of the regex escapes an Ollama grammar cannot compile, since it would drop the schema silently', () => {
    const patterns: string[] = [];
    const collect = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(collect);
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key === 'pattern') patterns.push(String(value));
        collect(value);
      }
    };
    const chatPrompt = buildChatRefinePrompt('project');
    for (const module of [...Object.values(PROMPT_REGISTRY), chatPrompt]) collect(toConstrainedSchema(module.schema, module.constrainedProperties));

    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.filter(pattern => /\\[sSdDwWbB]/.test(pattern))).toEqual([]);
  });
});
