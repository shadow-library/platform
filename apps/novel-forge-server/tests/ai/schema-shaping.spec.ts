import { describe, expect, it, mock } from 'bun:test';

import { type BaseMessage } from '@langchain/core/messages';

import { ModelRouterService } from '@modules/ai/model-router.service';
import { blueprintTastePrompt } from '@modules/ai/prompts/blueprint-taste.prompt';
import { BlueprintTasteSchema } from '@modules/ai/schemas/blueprint-taste.schema';
import { toHostedPromptSchema } from '@modules/ai/schemas/validate';

function stubDatabaseService(): never {
  const noopInsert = { values: () => ({ onConflictDoNothing: () => Promise.resolve() }) };
  const db = { query: { llmCache: { findFirst: async () => undefined } }, insert: () => noopInsert };
  return { getPostgresClient: () => db } as never;
}

function stubQuotaService(): never {
  return { enforce: async () => undefined } as never;
}

function propertyAt(schema: Record<string, unknown>, path: string[]): Record<string, unknown> {
  return path.reduce((node, key) => (node['properties'] as Record<string, Record<string, unknown>>)[key] as Record<string, unknown>, schema);
}

describe('toHostedPromptSchema', () => {
  const hosted = toHostedPromptSchema(BlueprintTasteSchema);
  const serialized = JSON.stringify(hosted);

  it('should retain the field descriptions a hosted model is steered by', () => {
    expect(serialized).toContain('never repeat a pair the author has already been asked');
    expect(serialized).toContain('never a genre word or a craft term');
    expect(serialized).toContain('two to four words naming the taste this side stands for');
  });

  it('should retain the value constraints AJV judges the reply against', () => {
    const pair = propertyAt(hosted, ['pairs'])['items'] as Record<string, unknown>;
    expect(propertyAt(hosted, ['pairs'])).toMatchObject({ minItems: 1 });
    expect(propertyAt(pair, ['a', 'label'])).toMatchObject({ minLength: 1 });
  });

  it('should omit the keywords the AJV pass never enforces', () => {
    expect(serialized).not.toContain('"$schema"');
    expect(serialized).not.toContain('"default"');
  });

  it('should dereference every $ref and drop the class-schema ids', () => {
    expect(serialized).not.toContain('"$ref"');
    expect(serialized).not.toContain('"$id"');
    expect(serialized).not.toContain('"definitions"');
  });
});

describe('ModelRouterService.buildMessages', () => {
  it('should show a hosted provider the descriptions and constraints it will be judged against', async () => {
    const side = { text: 'the heir walks away from the throne room', label: 'quiet refusal' };
    const invoke = mock<(messages: BaseMessage[]) => Promise<{ content: string }>>(async () => ({
      content: JSON.stringify({ pairs: [{ a: side, b: side }], giveUpReasons: [], coachMessage: 'ok' }),
    }));
    const router = new ModelRouterService({} as never, stubDatabaseService(), stubQuotaService(), { defaultsFor: async () => undefined } as never);
    (router as unknown as Record<string, unknown>)['buildClient'] = () => ({ invoke });

    const prompt = { ...blueprintTastePrompt, template: { formatMessages: async () => [] } as never, postValidate: undefined };
    await router.structured(prompt, {}, { projectId: BigInt(1), promptKey: 'blueprint-taste', promptVersion: blueprintTastePrompt.version, role: 'blueprint' });

    const schemaMessage = String(invoke.mock.calls[0]?.[0]?.at(-1)?.content);
    expect(schemaMessage).toContain('JSON schema');
    expect(schemaMessage).toContain('never repeat a pair the author has already been asked');
    expect(schemaMessage).toContain('"minItems":1');
  });
});
