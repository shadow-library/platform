import { describe, expect, it, mock } from 'bun:test';

import { ProjectOwnershipGuard } from '@modules/project/project-ownership.middleware';

const UNDO_ROUTE = '/api/v1/projects/:projectId/proposals/:proposalId/ops/:opIndex/undo';
const REDO_ROUTE = '/api/v1/projects/:projectId/proposals/:proposalId/ops/:opIndex/redo';

function fakeGuard(reachable: boolean) {
  const project = { ownerKind: 'user', ownerId: 1n, organisationId: null, sharedWithOrg: false };
  const db = { query: { projects: { findFirst: () => ({ prepare: () => ({ execute: async () => project }) }) } } };
  const access = { canReach: mock(async () => reachable) };
  const actors = { current: () => ({ kind: 'user', id: 2n }) };
  return new ProjectOwnershipGuard(actors as never, access as never, { getPostgresClient: () => db } as never);
}

describe('ProjectOwnershipGuard', () => {
  it('should refuse a per-change undo or redo on a project the caller cannot reach, as not found', async () => {
    const guard = fakeGuard(false);

    for (const path of [UNDO_ROUTE, REDO_ROUTE]) {
      const handler = guard.generate({ path } as never) as unknown as (request: unknown) => Promise<void>;
      await expect(handler({ params: { projectId: 7n, proposalId: 300n, opIndex: 0 } })).rejects.toMatchObject({ code: 'PRJ_001' });
    }
  });

  it('should let a per-change undo through on a project the caller owns', async () => {
    const handler = fakeGuard(true).generate({ path: UNDO_ROUTE } as never) as unknown as (request: unknown) => Promise<void>;

    await expect(handler({ params: { projectId: 7n, proposalId: 300n, opIndex: 0 } })).resolves.toBeUndefined();
  });
});
