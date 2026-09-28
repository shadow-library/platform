import { describe, expect, it } from 'bun:test';
import { type AuthClient } from '@shadow-library/auth';
import { type ContextService } from '@shadow-library/fastify';

import { type Job } from '@server/database';

import { type Actor, type ActorService } from '@modules/actor';
import { emptyCallUsageTotals } from '@modules/ai/usage/call-usage';
import { type JobService } from '@modules/jobs/job.service';
import { JobsController } from '@modules/jobs/jobs.controller';
import { ProjectAccessService, type ProjectOwnership } from '@modules/project/project-access.service';

const JOB_ID = '00000000-0000-4000-8000-000000000001';
const OWNER: Actor = { kind: 'bot', id: 7n, organisationId: 3n };
const SHARED: ProjectOwnership = { ownerKind: 'bot', ownerId: 7n, organisationId: 3n, sharedWithOrg: true };
const job = { id: JOB_ID, projectId: 1n, kind: 'publish', status: 'done', payload: null } as Job.Row;

function controller(actor: Actor, project: ProjectOwnership | undefined, isCurator: boolean): JobsController {
  const jobService = {
    getWithProject: async (jobId: string) => (project && jobId === JOB_ID ? { job, project } : undefined),
    usageForJobs: async (ids: string[]) => new Map(ids.map(id => [id, emptyCallUsageTotals()])),
  };
  const context = { getAuthPrincipal: () => ({}) } as unknown as ContextService;
  const authClient = { check: async () => isCurator } as unknown as AuthClient;
  const actorService = { current: () => actor } as unknown as ActorService;
  return new JobsController(jobService as unknown as JobService, actorService, new ProjectAccessService(context, authClient));
}

describe('JobsController.getJob', () => {
  it('should let the owner read a job of its own project', async () => {
    const result = await controller(OWNER, SHARED, false).getJob({ jobId: JOB_ID });

    expect(result.id).toBe(JOB_ID);
  });

  it('should let a curator read a job of a project shared with their organisation', async () => {
    const curator: Actor = { kind: 'user', id: 11n, organisationId: 3n };

    const result = await controller(curator, SHARED, true).getJob({ jobId: JOB_ID });

    expect(result.id).toBe(JOB_ID);
  });

  it('should hide a job of a shared project from an organisation member who is not a curator', async () => {
    const member: Actor = { kind: 'user', id: 11n, organisationId: 3n };

    await expect(controller(member, SHARED, false).getJob({ jobId: JOB_ID })).rejects.toMatchObject({ code: 'JOB_001' });
  });

  it('should hide a job of an unshared project from a curator of the same organisation', async () => {
    const curator: Actor = { kind: 'user', id: 11n, organisationId: 3n };

    await expect(controller(curator, { ...SHARED, sharedWithOrg: false }, true).getJob({ jobId: JOB_ID })).rejects.toMatchObject({ code: 'JOB_001' });
  });

  it('should hide a job of a shared project from a curator of another organisation', async () => {
    const outsider: Actor = { kind: 'user', id: 11n, organisationId: 4n };

    await expect(controller(outsider, SHARED, true).getJob({ jobId: JOB_ID })).rejects.toMatchObject({ code: 'JOB_001' });
  });

  it('should report a missing job as not found', async () => {
    await expect(controller(OWNER, undefined, false).getJob({ jobId: JOB_ID })).rejects.toMatchObject({ code: 'JOB_001' });
  });
});
