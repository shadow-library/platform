import { describe, expect, it } from 'bun:test';

import { AppErrorCode } from '@server/classes';
import { type Job, type Ledger, schema } from '@server/database';

import { ActionJobService } from '@modules/actions/action-job.service';
import { OrganiseJobService } from '@modules/actions/organise-job.service';
import { PlanJobService } from '@modules/actions/plan-job.service';
import { HUB_ALLOWED_OPS, HUB_INSTRUCTIONS } from '@modules/ai/prompts/scope-playbooks';
import { type NotesOrganiseOutput } from '@modules/ai/schemas/notes-organise.schema';
import { JobExecutor } from '@modules/jobs/job.executor';
import { ORGANISE_CHANGE_OPS } from '@modules/notes';
import { ActionExecutorRegistry } from '@modules/refinement/action-registry';
import { startedJobs } from '@modules/refinement/serialise';

import { FakeAuthoringClaims } from '../jobs/authoring-claim-fixtures';
import { ledgerEntry } from '../ledger/ledger-fixtures';

const SESSION = '11111111-1111-4111-8111-111111111111';
const ORIGIN = { sessionId: SESSION, messageId: '4', proposalId: '9', opIndex: 1 };
const CARD = { proposalId: 9n, opIndex: 1, sessionId: SESSION, messageId: 4n };
const NOTES = Array.from({ length: 620 }, (_, index) => (index % 12 === 0 ? 'Ilse carries sealed letters up from the salt mine.' : 'word')).join(' ');

const ORGANISED: NotesOrganiseOutput = {
  reading: 'A courier in a salt-mine town learns who owns the letters she carries.',
  timeline: [
    { band: 'opening', event: 'Ilse carries a sealed letter up from the mine' },
    { band: 'ending', event: 'Ilse burns the guild ledger' },
  ],
  pages: [{ section: 'project', slug: 'cast', title: 'Cast', sections: [{ heading: 'Ilse', body: 'A courier who never opens what she carries.', source: 'notes' }] }],
  records: [{ name: 'Ilse', type: 'character', summary: 'A courier who never opens what she carries.', source: 'notes' }],
  rules: [{ rule: 'Ilse never opens a letter she carries' }],
  questions: [{ question: 'Who sent the first letter?', why: 'Chapter one opens on it.' }],
  suggestions: [],
  coachMessage: 'Your notes are clear on the opening.',
};

function job(overrides: Partial<Job.Row> = {}): Job.Row {
  return {
    id: 'job-1',
    projectId: 1n,
    kind: 'organise',
    target: 'proposal-9-1',
    status: 'in_progress',
    attempts: 0,
    lastError: null,
    payload: { origin: ORIGIN },
    progress: null,
    nextAttemptAt: null,
    cancelRequestedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

interface Stored {
  ledger?: Ledger.Entry[];
  staged?: { id: bigint }[];
  drafts?: { chapter: number }[];
  chapters?: { number: number }[];
  appliedOrganise?: { id: bigint }[];
  organiseDecision?: { createdAt: Date }[];
  briefs?: { chapter: number }[];
  runningPlans?: { payload: unknown }[];
  authorMessages?: string[];
  claimHeldBy?: 'plan' | 'generate';
}

/**
 * Answers the reads the action jobs make: the project, its ledger, its chapters and drafts, a card an earlier attempt staged, an applied
 * organise card and the organise decision, the job row a stage locks, and stored pages.
 */
function databaseOver(stored: Stored) {
  const rows = (result: unknown[]) => Object.assign(Promise.resolve(result), { limit: async () => result, orderBy: () => ({ limit: async () => result }), for: async () => [] });
  const db = {
    query: {
      projects: { findFirst: async () => ({ id: 1n }) },
      decisionLedgerEntries: { findMany: async () => stored.ledger ?? [] },
      chapters: { findMany: async () => stored.chapters ?? [] },
      drafts: { findMany: async () => stored.drafts ?? [] },
      briefs: { findFirst: async () => stored.briefs?.[0] },
      jobs: { findFirst: async () => stored.runningPlans?.[0] },
      chatMessages: { findMany: async () => (stored.authorMessages ?? []).map(content => ({ content })) },
      refinementProposals: { findFirst: async () => undefined },
    },
    select: () => ({
      from: (table: unknown) => ({
        innerJoin: () => ({ where: () => rows(stored.staged ?? []) }),
        where: () => {
          if (table === schema.refinementProposals) return rows(stored.appliedOrganise ?? []);
          if (table === schema.decisionLedgerEntries) return rows(stored.organiseDecision ?? []);
          return rows([]);
        },
      }),
    }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  return { getPostgresClient: () => db };
}

function recorder() {
  const progress: Record<string, unknown>[] = [];
  const settled: unknown[][] = [];
  const created: Record<string, unknown>[] = [];
  const models: Record<string, unknown>[] = [];
  const jobService = { progress: async (_id: string, value: Record<string, unknown>) => void progress.push(value) };
  const workflowRunService = {
    runChain: async (_projectId: bigint, _graph: string, _target: string, _input: unknown, fn: (runId: string) => Promise<unknown>) => ({
      runId: 'run-1',
      result: await fn('run-1'),
    }),
    settleJobRuns: async (...args: unknown[]) => void settled.push(args),
  };
  const proposals = { create: async (_projectId: bigint, input: Record<string, unknown>) => (created.push(input), { id: 42n }) };
  return { progress, settled, created, models, jobService, workflowRunService, proposals };
}

function organiser(stored: Stored) {
  const seen = recorder();
  const modelRouter = { structured: async (_prompt: unknown, _vars: unknown, telemetry: Record<string, unknown>) => (seen.models.push(telemetry), ORGANISED) };
  const service = new OrganiseJobService(
    databaseOver(stored) as never,
    seen.jobService as never,
    seen.workflowRunService as never,
    modelRouter as never,
    { resolve: async () => ({}) } as never,
    seen.proposals as never,
  );
  return { service, ...seen };
}

describe('OrganiseJobService', () => {
  it('should stage the organised notes as one card in the chat the action was accepted from', async () => {
    const { service, created, progress, models } = organiser({ ledger: [ledgerEntry({ topic: 'start.brief', statement: NOTES })] });

    await service.run(job());

    expect(models).toEqual([expect.objectContaining({ runId: 'run-1', promptKey: 'notes-organise' })]);
    expect(created).toEqual([expect.objectContaining({ sessionId: SESSION, messageId: 4n, kind: 'organise', runId: 'run-1', allowedOps: ORGANISE_CHANGE_OPS })]);
    expect((created[0]?.['changeSet'] as unknown[]).length).toBeGreaterThan(0);
    expect(progress.at(-1)).toMatchObject({ phase: 'staged', proposalId: '42' });
  });

  it('should not stage a second card when a retry finds the one its first attempt staged', async () => {
    const { service, created, progress, models, settled } = organiser({ staged: [{ id: 42n }] });

    await service.run(job({ attempts: 1 }));

    expect(models).toEqual([]);
    expect(created).toEqual([]);
    expect(settled).toEqual([['job-1', 'completed']]);
    expect(progress).toEqual([expect.objectContaining({ phase: 'staged', proposalId: '42' })]);
  });
});

describe('PlanJobService', () => {
  const GATE_PLAN = { op: 'brief.update', chapter: 3, body: 'Ilse reaches the gate.', title: 'The Gate' };

  function planner(stored: Stored) {
    const seen = recorder();
    const planned: unknown[][] = [];
    const planner = { plan: async (...args: unknown[]) => (planned.push(args), GATE_PLAN) };
    const service = new PlanJobService(databaseOver(stored) as never, seen.jobService as never, seen.workflowRunService as never, planner as never, seen.proposals as never);
    return { service, planned, ...seen };
  }

  it('should stage the plan for the next chapter as a card, never a write', async () => {
    const { service, created, planned } = planner({ drafts: [{ chapter: 1 }, { chapter: 2 }] });

    await service.run(job({ kind: 'plan', payload: { chapter: 3, intent: 'She reaches the gate', origin: ORIGIN } }));

    expect(planned).toEqual([[1n, { chapter: 3, intent: 'She reaches the gate' }, 'run-1']]);
    expect(created).toEqual([expect.objectContaining({ kind: 'chapter_plan', sessionId: SESSION, runId: 'run-1', changeSet: [GATE_PLAN], allowedOps: ['brief.update'] })]);
  });

  it('should hand the planner the author’s direction and empty-plan choice but never the job’s origin', async () => {
    const { service, planned } = planner({ drafts: [{ chapter: 1 }, { chapter: 2 }] });

    await service.run(job({ kind: 'plan', payload: { chapter: 3, direction: ' The mine floods ', empty: true, origin: ORIGIN } }));

    expect(planned).toEqual([[1n, { chapter: 3, direction: 'The mine floods', empty: true }, 'run-1']]);
  });

  it('should not plan again when a retry finds the card its first attempt staged', async () => {
    const { service, created, planned, settled, progress } = planner({ staged: [{ id: 42n }], drafts: [{ chapter: 1 }, { chapter: 2 }] });

    await service.run(job({ kind: 'plan', attempts: 1, payload: { chapter: 3 } }));

    expect(planned).toEqual([]);
    expect(created).toEqual([]);
    expect(settled).toEqual([['job-1', 'completed']]);
    expect(progress).toEqual([expect.objectContaining({ phase: 'staged', proposalId: '42' })]);
  });

  it('should answer with the card another attempt staged when its own staging conflicts', async () => {
    const stored: Stored = { drafts: [{ chapter: 1 }, { chapter: 2 }] };
    const seen = recorder();
    const planner = { plan: async () => GATE_PLAN };
    const proposals = {
      create: async () => {
        stored.staged = [{ id: 41n }];
        throw new Error('duplicate key value violates unique constraint "refinement_proposals_job_card_run_id_unique"');
      },
    };
    const service = new PlanJobService(databaseOver(stored) as never, seen.jobService as never, seen.workflowRunService as never, planner as never, proposals as never);

    await service.run(job({ kind: 'plan', payload: { chapter: 3 } }));

    expect(seen.progress.at(-1)).toMatchObject({ phase: 'staged', proposalId: '41' });
  });

  it('should refuse to stage a plan for a chapter a draft written while it was being made has moved past', async () => {
    const stored: Stored = { drafts: [{ chapter: 1 }, { chapter: 2 }] };
    const seen = recorder();
    const planner = { plan: async () => (stored.drafts?.push({ chapter: 3 }), GATE_PLAN) };
    const service = new PlanJobService(databaseOver(stored) as never, seen.jobService as never, seen.workflowRunService as never, planner as never, seen.proposals as never);

    await expect(service.run(job({ kind: 'plan', payload: { chapter: 3 } }))).rejects.toMatchObject({ code: 'PLN_008' });
    expect(seen.created).toEqual([]);
  });

  it('should refuse to plan a chapter a draft written while the job waited has moved past', async () => {
    const { service, created, planned } = planner({ drafts: [{ chapter: 1 }, { chapter: 2 }, { chapter: 3 }] });

    await expect(service.run(job({ kind: 'plan', payload: { chapter: 3 } }))).rejects.toMatchObject({ code: 'PLN_006' });
    expect(planned).toEqual([]);
    expect(created).toEqual([]);
  });
});

describe('ActionJobService', () => {
  function actions(stored: Stored & { dedupe?: boolean }) {
    const enqueued: unknown[][] = [];
    const runs: unknown[][] = [];
    const dispatched: string[] = [];
    const handlers = new Map<Job.Kind, unknown>();
    const registry = new ActionExecutorRegistry();
    const jobService = {
      enqueueJob: async (...args: unknown[]) => {
        if (stored.claimHeldBy === 'plan') stored.runningPlans = [{ payload: { chapter: 2 } }];
        if (stored.claimHeldBy) throw AppErrorCode.JOB_002.create();
        enqueued.push(args);
        return { id: 'job-1', outcome: stored.dedupe ? 'deduped' : 'inserted' };
      },
    };
    const jobExecutor = { dispatch: async (jobId: string) => void dispatched.push(jobId), registerHandler: (kind: Job.Kind, handler: unknown) => handlers.set(kind, handler) };
    const workflowRunService = { createRun: async (...args: unknown[]) => (runs.push(args), 'run-1') };
    const service = new ActionJobService(databaseOver(stored) as never, jobService as never, jobExecutor as never, workflowRunService as never, {} as never, {} as never, registry);
    service.onModuleInit();
    return { service, registry, enqueued, runs, dispatched, handlers };
  }

  it('should queue the next chapter’s plan as its own job and answer with its job and run', async () => {
    const { registry, enqueued, runs, dispatched } = actions({ drafts: [{ chapter: 1 }], authorMessages: ['Next chapter: Ilse reaches the salt gate at dawn.'] });

    const result = await registry.get('action.plan_chapter')?.(1n, { op: 'action.plan_chapter', intent: ' Ilse reaches the salt gate ' }, CARD);

    expect(result).toMatchObject({ jobId: 'job-1', runId: 'run-1' });
    expect(enqueued).toEqual([[1n, 'plan', 'proposal-9-1', { chapter: 2, intent: 'Ilse reaches the salt gate', origin: ORIGIN }]]);
    expect(runs).toEqual([[1n, 'chapter-plan', 'proposal-9-1', { chapter: 2, intent: 'Ilse reaches the salt gate' }, 'job-1']]);
    expect(dispatched).toEqual(['job-1']);
  });

  it('should queue the direction the author chose, or an empty plan, as the plan job’s request', async () => {
    const { registry, enqueued } = actions({ drafts: [{ chapter: 1 }] });

    await registry.get('action.plan_chapter')?.(1n, { op: 'action.plan_chapter', direction: 'The mine floods', empty: true }, CARD);

    expect(enqueued).toEqual([[1n, 'plan', 'proposal-9-1', { chapter: 2, direction: 'The mine floods', empty: true, origin: ORIGIN }]]);
  });

  it('should plan an intent the author never wrote as a direction, and let the author’s own direction win over it', async () => {
    const { registry, enqueued } = actions({ drafts: [{ chapter: 1 }], authorMessages: ['What should happen next?'] });

    await registry.get('action.plan_chapter')?.(1n, { op: 'action.plan_chapter', intent: 'She reaches the gate' }, CARD);
    await registry.get('action.plan_chapter')?.(1n, { op: 'action.plan_chapter', intent: 'She reaches the gate', direction: 'The mine floods' }, CARD);

    expect(enqueued.map(call => call[3])).toEqual([
      { chapter: 2, direction: 'She reaches the gate', origin: ORIGIN },
      { chapter: 2, direction: 'The mine floods', origin: ORIGIN },
    ]);
  });

  it('should find an intent the author stated in an earlier turn, however short, but not one they only wondered about', async () => {
    const plan = async (authorMessages: string[], intent: string) => {
      const { registry, enqueued } = actions({ drafts: [{ chapter: 1 }], authorMessages });
      await registry.get('action.plan_chapter')?.(1n, { op: 'action.plan_chapter', intent }, CARD);
      return enqueued[0]?.[3];
    };

    expect(await plan(['Yes, go ahead.', 'Next chapter: Ilse burns the ledger in the mine.'], 'Ilse burns the ledger')).toMatchObject({ intent: 'Ilse burns the ledger' });
    expect(await plan(['She sells the lamp.'], 'She sells the lamp')).toMatchObject({ intent: 'She sells the lamp' });
    expect(await plan(['Maybe Ilse burns the ledger?'], 'Ilse burns the ledger')).toMatchObject({ direction: 'Ilse burns the ledger' });
  });

  it('should refuse an empty plan for a chapter that already has one', async () => {
    const { registry, enqueued } = actions({ drafts: [{ chapter: 1 }], briefs: [{ chapter: 2 }] });

    await expect(registry.get('action.plan_chapter')?.(1n, { op: 'action.plan_chapter', empty: true }, CARD)).rejects.toMatchObject({ code: 'PLN_007' });
    expect(enqueued).toEqual([]);
  });

  it('should say so when another card’s plan is already being made, rather than folding into it', async () => {
    const { registry, enqueued } = actions({ drafts: [{ chapter: 1 }], runningPlans: [{ payload: { chapter: 2 } }] });

    await expect(registry.get('action.plan_chapter')?.(1n, { op: 'action.plan_chapter' }, CARD)).rejects.toMatchObject({ code: 'PLN_009', data: { chapter: '2' } });
    expect(enqueued).toEqual([]);
  });

  it('should name a plan already being made when the authoring claim refuses the job, and leave any other holder’s refusal as it is', async () => {
    const planning = actions({ drafts: [{ chapter: 1 }], claimHeldBy: 'plan' });
    const writing = actions({ drafts: [{ chapter: 1 }], claimHeldBy: 'generate' });

    await expect(planning.registry.get('action.plan_chapter')?.(1n, { op: 'action.plan_chapter' }, CARD)).rejects.toMatchObject({ code: 'PLN_009' });
    await expect(writing.registry.get('action.plan_chapter')?.(1n, { op: 'action.plan_chapter' }, CARD)).rejects.toMatchObject({ code: 'JOB_002' });
  });

  it('should refuse a plan card for any chapter but the next one', async () => {
    const { registry, enqueued } = actions({ drafts: [{ chapter: 1 }] });

    await expect(registry.get('action.plan_chapter')?.(1n, { op: 'action.plan_chapter', chapter: 5 }, CARD)).rejects.toMatchObject({ code: 'PLN_006' });
    expect(enqueued).toEqual([]);
  });

  it('should refuse to organise notes too short to organise', async () => {
    const { registry, enqueued } = actions({ ledger: [ledgerEntry({ topic: 'start.brief', statement: 'A few words only' })] });

    await expect(registry.get('action.organise_notes')?.(1n, { op: 'action.organise_notes' }, CARD)).rejects.toMatchObject({ code: 'NTS_003' });
    expect(enqueued).toEqual([]);
  });

  it('should refuse to organise notes whose organised pages are already applied, until a newer organise decision', async () => {
    const notes = [ledgerEntry({ topic: 'start.brief', statement: NOTES })];
    const { registry, enqueued } = actions({ ledger: notes, appliedOrganise: [{ id: 42n }] });

    await expect(registry.get('action.organise_notes')?.(1n, { op: 'action.organise_notes' }, CARD)).rejects.toMatchObject({ code: 'NTS_004' });
    expect(enqueued).toEqual([]);
  });

  it('should report a card op whose job is already running instead of starting it again', async () => {
    const { registry, dispatched } = actions({ drafts: [{ chapter: 1 }], dedupe: true });

    const result = await registry.get('action.plan_chapter')?.(1n, { op: 'action.plan_chapter' }, CARD);

    expect(result).toMatchObject({ summary: 'chapter 2 is already being planned', jobId: 'job-1' });
    expect(dispatched).toEqual([]);
  });

  it('should queue organising with no chat to report to when the card came from none', async () => {
    const { registry, enqueued } = actions({ ledger: [ledgerEntry({ topic: 'start.brief', statement: NOTES })] });

    await registry.get('action.organise_notes')?.(1n, { op: 'action.organise_notes' }, { ...CARD, sessionId: null, messageId: null });

    expect(enqueued).toEqual([[1n, 'organise', 'proposal-9-1', {}]]);
  });

  it('should run an organise or plan job left pending at boot through the handlers it registers', async () => {
    const pending = [job({ status: 'pending' }), job({ id: 'job-2', projectId: 2n, kind: 'plan', status: 'pending', payload: { chapter: 1 } })];
    const jobs = {
      findPending: async () => pending,
      get: async (id: string) => pending.find(row => row.id === id),
      start: async () => true,
      progress: async () => undefined,
      succeed: async () => undefined,
    };
    const ran: string[] = [];
    const executor = new JobExecutor(
      jobs as never,
      new FakeAuthoringClaims().asService(),
      { cancel: () => undefined, settleJobRuns: async () => undefined } as never,
      {} as never,
      { getPostgresClient: () => ({ select: () => ({ from: () => ({ where: async () => [] }) }) }) } as never,
      {} as never,
      {} as never,
    );
    const organiseJobs = { run: async (row: Job.Row) => void ran.push(row.kind) };
    const planJobs = { run: async (row: Job.Row) => void ran.push(row.kind) };
    new ActionJobService(databaseOver({}) as never, {} as never, executor, {} as never, organiseJobs as never, planJobs as never, new ActionExecutorRegistry()).onModuleInit();

    await executor.onApplicationReady();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(ran.sort()).toEqual(['organise', 'plan']);
  });
});

describe('the chat hub vocabulary', () => {
  it('should offer planning the next chapter but withhold organising, which would write organised pages twice', () => {
    expect(HUB_ALLOWED_OPS).toContain('action.plan_chapter');
    expect(HUB_ALLOWED_OPS).not.toContain('action.organise_notes');
    expect(HUB_INSTRUCTIONS).not.toContain('action.organise_notes');
  });
});

describe('startedJobs', () => {
  it('should answer an apply with the job and run each applied action started', () => {
    const opResults = [
      { index: 0, status: 'applied' as const },
      { index: 1, status: 'applied' as const, result: { summary: 'planning', jobId: 'job-1', runId: 'run-1' } },
      { index: 2, status: 'applied' as const, result: { summary: 'drafting', jobId: 'job-2' } },
      { index: 3, status: 'failed' as const, result: { jobId: 'job-3' } },
    ];

    expect(startedJobs(opResults)).toEqual([
      { index: 1, jobId: 'job-1', runId: 'run-1' },
      { index: 2, jobId: 'job-2' },
    ]);
  });
});
