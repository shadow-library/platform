import { describe, expect, it } from 'bun:test';
import { PgDialect } from 'drizzle-orm/pg-core';

import { buildKindFilter } from '@modules/ai/retrieval/retrieval.service';
import { searchLoreTool } from '@modules/ai/tools/tools/search-lore.tool';

const dialect = new PgDialect();
const INJECTION = "x']::varchar[]) UNION SELECT secret_key FROM api_keys --";

describe('buildKindFilter', () => {
  it('should bind every kind as a parameter, keeping the malicious value out of the SQL text', () => {
    const { sql, params } = dialect.sqlToQuery(buildKindFilter(['character', INJECTION]));

    expect(params).toEqual(['character', INJECTION]);
    expect(sql).toBe('AND lc.kind in ($1, $2)');
    expect(sql).toMatch(/\$\d+/);
    expect(sql).not.toContain(INJECTION);
    expect(sql).not.toContain('UNION SELECT');
    expect(sql).not.toContain("'");
  });

  it('should return an empty fragment when kinds is undefined', () => {
    expect(dialect.sqlToQuery(buildKindFilter()).sql).toBe('');
  });

  it('should return an empty fragment when kinds is empty', () => {
    expect(dialect.sqlToQuery(buildKindFilter([])).sql).toBe('');
  });
});

describe('searchLoreTool.inputSchema', () => {
  it('should accept normal lore kinds', () => {
    const result = searchLoreTool.inputSchema.safeParse({ query: 'who leads the northern faction', kinds: ['character', 'bible_doc'] });
    expect(result.success).toBe(true);
  });

  it('should reject an injection-shaped kind', () => {
    const result = searchLoreTool.inputSchema.safeParse({ query: 'who leads the northern faction', kinds: [INJECTION] });
    expect(result.success).toBe(false);
  });
});
