import { describe, expect, it, mock } from 'bun:test';

import { type BaseMessage } from '@langchain/core/messages';

import { ModelRouterService } from '@modules/ai/model-router.service';
import { ideationTurnPrompt } from '@modules/ai/prompts/ideation-turn.prompt';
import { IdeationTurnSchema } from '@modules/ai/schemas/ideation.schema';
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
  const hosted = toHostedPromptSchema(IdeationTurnSchema);
  const serialized = JSON.stringify(hosted);

  it('should retain the field descriptions a hosted model is steered by', () => {
    expect(serialized).toContain('the coaching line copied character for character from the round input');
    expect(serialized).toContain('never invent an id, never merge two questions into one');
    expect(serialized).toContain('the lead-in only');
  });

  it('should retain the value constraints AJV judges the reply against', () => {
    const question = propertyAt(hosted, ['payload', 'questions'])['items'] as Record<string, unknown>;
    expect(propertyAt(question, ['options'])).toMatchObject({ minItems: 2 });
    expect(propertyAt(question, ['coaching'])).toMatchObject({ minLength: 1 });
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
    const invoke = mock<(messages: BaseMessage[]) => Promise<{ content: string }>>(async () => ({
      content: JSON.stringify({ reply: 'ok', payload: { kind: 'questions', questions: [] } }),
    }));
    const router = new ModelRouterService({} as never, stubDatabaseService(), stubQuotaService(), { defaultsFor: async () => undefined } as never);
    (router as unknown as Record<string, unknown>)['buildClient'] = () => ({ invoke });

    const prompt = { ...ideationTurnPrompt, template: { formatMessages: async () => [] } as never, postValidate: undefined };
    await router.structured(prompt, {}, { projectId: BigInt(1), promptKey: 'ideation-turn', promptVersion: ideationTurnPrompt.version, role: 'chat' });

    const schemaMessage = String(invoke.mock.calls[0]?.[0]?.at(-1)?.content);
    expect(schemaMessage).toContain('JSON schema');
    expect(schemaMessage).toContain('the coaching line copied character for character from the round input');
    expect(schemaMessage).toContain('"minItems":2');
  });
});
