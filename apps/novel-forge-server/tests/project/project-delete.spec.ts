import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { schema } from '@server/database';

import { type WorkflowRunService } from '@modules/ai/graphs/workflow-run.service';
import { ProjectService } from '@modules/project/project/project.service';

import { matchesWhere } from '../sql-filter';

type Row = Record<string, unknown>;

function fakeProjects(projects: Row[], runs: Row[]) {
  const tables = new Map<unknown, Row[]>([
    [schema.projects, projects],
    [schema.workflowRuns, runs],
    [schema.authoringClaims, []],
  ]);
  const rows = (table: unknown): Row[] => tables.get(table) ?? [];
  const matching = (table: unknown, condition: SQL) => rows(table).filter(row => matchesWhere(row, condition));
  const events: string[] = [];
  const tx = {
    select: () => ({
      from: (table: unknown) => ({ where: (condition: SQL) => Object.assign(Promise.resolve(matching(table, condition)), { for: async () => matching(table, condition) }) }),
    }),
    delete: (table: unknown) => ({
      where: (condition: SQL) => {
        const deleted = matching(table, condition);
        tables.set(
          table,
          rows(table).filter(row => !deleted.includes(row)),
        );
        return Object.assign(Promise.resolve(), { returning: async () => deleted });
      },
    }),
  };
  const db = {
    transaction: async (run: (handle: unknown) => Promise<unknown>) => {
      const result = await run(tx);
      events.push('commit');
      return result;
    },
  };
  const workflowRuns = { cancel: (runId: string) => (events.push(`abort ${runId}`), true) } as unknown as WorkflowRunService;
  const noop = {} as never;
  const service = new ProjectService({ getPostgresClient: () => db } as never, noop, noop, noop, noop, noop, workflowRuns);
  return { service, events };
}

describe('ProjectService.delete', () => {
  it("should abort the project's running workflow runs once the delete commits", async () => {
    const runs = [
      { id: 'run-live', projectId: 7n, status: 'running' },
      { id: 'run-settled', projectId: 7n, status: 'completed' },
      { id: 'run-elsewhere', projectId: 8n, status: 'running' },
    ];
    const { service, events } = fakeProjects([{ id: 7n }, { id: 8n }], runs);

    await service.delete(7n);

    expect(events).toEqual(['commit', 'abort run-live']);
  });

  it('should abort nothing when the project does not exist', async () => {
    const { service, events } = fakeProjects([], [{ id: 'run-live', projectId: 7n, status: 'running' }]);

    await expect(service.delete(7n)).rejects.toMatchObject({ code: 'PRJ_001' });
    expect(events).toEqual(['commit']);
  });
});
