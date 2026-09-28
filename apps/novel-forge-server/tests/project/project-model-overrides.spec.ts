import { describe, expect, it } from 'bun:test';

import { ProjectService } from '@modules/project/project/project.service';

const TEXT_MODEL = { provider: 'openrouter', model: 'anthropic/claude-sonnet-5' };
const IMAGE_MODEL = { provider: 'openrouter', model: 'x-ai/grok-imagine-image-2.0' };

function makeService(): { service: ProjectService; writes: unknown[] } {
  const writes: unknown[] = [];
  const db = {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        writes.push(values);
        const rows = Promise.resolve([{ id: 5n, config: null, instructions: null, coverImagePath: null, ...values }]);
        return { where: () => ({ returning: () => Object.assign(rows, { catch: () => rows }) }) };
      },
    }),
  };
  const noop = {} as never;
  const storage = { getPublicUrl: () => undefined } as never;
  return { service: new ProjectService({ getPostgresClient: () => db } as never, noop, storage, noop, noop, noop, noop), writes };
}

describe('ProjectService.update — model overrides', () => {
  it('should refuse an image model pinned on a text role without writing', async () => {
    const { service, writes } = makeService();

    await expect(service.update(5n, { config: { models: { generation: IMAGE_MODEL } } })).rejects.toMatchObject({ code: 'AI_002' });
    expect(writes).toEqual([]);
  });

  it('should refuse a text model pinned on the image role without writing', async () => {
    const { service, writes } = makeService();

    await expect(service.update(5n, { config: { models: { image: TEXT_MODEL } } })).rejects.toMatchObject({ code: 'AI_002' });
    expect(writes).toEqual([]);
  });

  it('should accept a model whose kind matches its role', async () => {
    const { service, writes } = makeService();

    await service.update(5n, { config: { models: { generation: TEXT_MODEL, image: IMAGE_MODEL } } });

    expect(writes).toHaveLength(1);
  });
});
