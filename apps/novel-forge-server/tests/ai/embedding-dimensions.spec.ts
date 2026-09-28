import { describe, expect, it } from 'bun:test';

import { schema } from '@server/database';
import { PRODUCTION_GROUP_DEFAULTS, UNRESTRICTED_GROUP_DEFAULTS } from '@modules/ai/defaults';
import { MODEL_MAP, MODEL_REGISTRY } from '@modules/ai/models';

const VECTOR_COLUMNS = [schema.chapterChunks.embedding, schema.loreChunks.embedding];

function columnType(model: string): string | undefined {
  const entry = MODEL_MAP[model];
  return entry?.kind === 'embedding' ? `vector(${entry.dimensions})` : undefined;
}

describe('embedding model registry', () => {
  it('should size the default embedding model to every pgvector column', () => {
    for (const defaults of [PRODUCTION_GROUP_DEFAULTS, UNRESTRICTED_GROUP_DEFAULTS]) {
      const type = columnType(defaults.embedding.model);
      for (const column of VECTOR_COLUMNS) expect(column.getSQLType()).toBe(type as string);
    }
  });

  it('should register only embedding models whose output fits the pgvector columns', () => {
    const embeddingModels = MODEL_REGISTRY.filter(entry => entry.kind === 'embedding').map(entry => entry.id);

    expect(embeddingModels.map(columnType)).toEqual(embeddingModels.map(() => VECTOR_COLUMNS[0]?.getSQLType()));
  });
});
