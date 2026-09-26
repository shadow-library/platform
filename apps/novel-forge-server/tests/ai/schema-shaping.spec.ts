import { describe, expect, it, mock } from 'bun:test';

import { type BaseMessage } from '@langchain/core/messages';

import { ModelRouterService } from '@modules/ai/model-router.service';
import { notesOrganisePrompt } from '@modules/ai/prompts/notes-organise.prompt';
import { NotesOrganiseSchema } from '@modules/ai/schemas/notes-organise.schema';
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
  const hosted = toHostedPromptSchema(NotesOrganiseSchema);
  const serialized = JSON.stringify(hosted);

  it('should retain the field descriptions a hosted model is steered by', () => {
    expect(serialized).toContain('the story as the notes place it in time, in story order');
    expect(serialized).toContain('a hard constraint the notes state that holds from chapter one; never a secret');
    expect(serialized).toContain('the heading of the section on that page it would go under');
  });

  it('should retain the value constraints AJV judges the reply against', () => {
    const page = propertyAt(hosted, ['pages'])['items'] as Record<string, unknown>;
    expect(propertyAt(page, ['sections'])).toMatchObject({ minItems: 1 });
    expect(propertyAt(page, ['title'])).toMatchObject({ minLength: 1 });
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
      content: JSON.stringify({
        reading: 'A courier learns who owns the letters.',
        timeline: [],
        pages: [],
        records: [],
        rules: [],
        questions: [],
        suggestions: [],
        coachMessage: 'ok',
      }),
    }));
    const router = new ModelRouterService({} as never, stubDatabaseService(), stubQuotaService());
    (router as unknown as Record<string, unknown>)['buildClient'] = () => ({ invoke });

    const prompt = { ...notesOrganisePrompt, template: { formatMessages: async () => [] } as never, postValidate: undefined };
    await router.structured(prompt, {}, { projectId: BigInt(1), promptKey: 'notes-organise', promptVersion: notesOrganisePrompt.version, role: 'bible' });

    const schemaMessage = String(invoke.mock.calls[0]?.[0]?.at(-1)?.content);
    expect(schemaMessage).toContain('JSON schema');
    expect(schemaMessage).toContain('the story as the notes place it in time, in story order');
    expect(schemaMessage).toContain('"minItems":1');
  });
});
