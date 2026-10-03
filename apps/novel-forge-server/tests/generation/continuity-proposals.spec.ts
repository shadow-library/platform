import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { makeGenerationService, render } from './generation-fixtures';

function makeService(rows: { chapter: number }[]) {
  const queries: { where?: SQL }[] = [];
  const db = {
    query: {
      continuityProposals: {
        findMany: async (query: { where?: SQL }) => {
          queries.push(query);
          return rows;
        },
      },
    },
  };
  return { service: makeGenerationService(db), queries };
}

describe('GenerationService.listContinuityProposals', () => {
  it('should return the rows the query finds', async () => {
    const rows = [{ chapter: 2 }, { chapter: 5 }];
    const { service } = makeService(rows);

    expect(await service.listContinuityProposals(1n, 'pending')).toBe(rows as never);
  });

  it('should scope the query to the project and the requested status', async () => {
    const { service, queries } = makeService([]);

    await service.listContinuityProposals(7n, 'applied');

    const { sql, params } = render(queries[0]?.where);
    expect(sql).toContain('"project_id" = $1');
    expect(sql).toContain('"status" = $2');
    expect(params).toEqual([7n, 'applied']);
  });
});
