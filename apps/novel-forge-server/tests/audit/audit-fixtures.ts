import { BibleAuditService } from '@modules/audit/bible-audit.service';
import { type Job, type Refinement, schema } from '@server/database';

import { render } from '../review/review-fixtures';

export interface AuditFakeOptions {
  coverage?: object | Error;
  contradictions?: object | Error;
  documents?: Record<string, unknown>[];
  entities?: Record<string, unknown>[];
  facts?: Record<string, unknown>[];
  chapters?: Record<string, unknown>[];
  /** The run an earlier attempt of an audit job opened. */
  priorRun?: { id: string };
}

export interface AuditHarness {
  service: BibleAuditService;
  reports: (Job.ValidationReport & { decisions: Job.FindingDecision[] })[];
  proposals: Refinement.Proposal[];
  staged: Record<string, unknown>[];
  prompts: Record<string, Record<string, unknown>>;
  registeredKinds: string[];
  locks: string[];
  /** Each transaction's isolation level, in order; undefined for the default. */
  isolation: unknown[];
  queued: unknown[][];
  /** Cancels the audit's run, as a cancel request reaching this replica would. */
  cancel: () => void;
  runRegisteredJob: (job: object) => Promise<void>;
  /** Settles the card right after the next lock is taken on it, as a write the lock did not guard would. */
  settleAfterNextLock: (status: Refinement.ProposalStatus) => void;
}

export const GEOGRAPHY = { section: 'world', slug: 'geography', body: 'The harbour of Saltgate keeps ten lanterns lit every night.', revision: 1 };
export const CHAPTER_THREE = { number: 3, title: 'The Count', summary: 'Mara counts nine lanterns on the quay and the harbour master calls it the usual count.', isolated: false };

export function auditHarness(options: AuditFakeOptions = {}): AuditHarness {
  const reports: AuditHarness['reports'] = [];
  const proposals: Refinement.Proposal[] = [];
  const staged: Record<string, unknown>[] = [];
  const prompts: Record<string, Record<string, unknown>> = {};
  const registeredKinds: string[] = [];
  const locks: string[] = [];
  const isolation: unknown[] = [];
  const queued: unknown[][] = [];
  const controller = new AbortController();
  let handler: ((job: object) => Promise<void>) | undefined;
  let nextId = 7n;
  let settleAfterLock: Refinement.ProposalStatus | undefined;

  const proposalById = (id: unknown) => proposals.find(proposal => proposal.id === id);
  const addProposal = (values: Record<string, unknown>): Refinement.Proposal => {
    const proposal = { id: nextId++, status: 'pending', ...values } as Refinement.Proposal;
    proposals.push(proposal);
    return proposal;
  };
  const findReport = async (query: { where: never }) => {
    const [key] = render(query.where).params;
    return reports.find(report => report.id === key || report.runId === key);
  };

  const db = {
    query: {
      projects: { findFirst: async () => ({ id: 1n, contentMode: 'standard' }) },
      bibleDocuments: { findMany: async () => options.documents ?? [GEOGRAPHY] },
      entities: { findMany: async () => options.entities ?? [{ entityKey: 'mara', type: 'character', name: 'Mara', status: null, motivation: null, notes: null, body: null }] },
      canonFacts: { findMany: async () => options.facts ?? [] },
      chapters: { findMany: async () => options.chapters ?? [CHAPTER_THREE] },
      workflowRuns: { findFirst: async () => options.priorRun },
      validationReports: { findFirst: findReport, findMany: async () => [...reports].reverse() },
      validationFindingDecisions: { findMany: async (query: { where: never }) => reports.find(report => report.id === render(query.where).params[0])?.decisions ?? [] },
      refinementProposals: {
        findFirst: async (query: { where: never }) => proposalById(render(query.where).params[0]),
        findMany: async (query: { where: never }) => proposals.filter(proposal => render(query.where).params.includes(proposal.id)),
      },
    },
    select: () => ({
      from: (table: unknown) => ({
        where: (where: never) => ({
          for: async () => {
            const [id] = render(where).params;
            if (table === schema.refinementProposals) {
              locks.push('card');
              const card = proposalById(id);
              const locked = card ? [{ ...card }] : [];
              if (card && settleAfterLock) card.status = settleAfterLock;
              settleAfterLock = undefined;
              return locked;
            }
            locks.push('report');
            return reports.some(report => report.id === id) ? [{ id }] : [];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          if (table !== schema.validationReports) return [];
          const report = { id: nextId++, createdAt: new Date(), decisions: [], ...values } as unknown as AuditHarness['reports'][number];
          reports.push(report);
          return [report];
        },
        onConflictDoUpdate: async () => {
          const report = reports.find(candidate => candidate.id === values['reportId']);
          if (!report) return;
          const decision = { id: nextId++, createdAt: new Date(), updatedAt: new Date(), ...values } as Job.FindingDecision;
          report.decisions = [...report.decisions.filter(existing => existing.findingId !== decision.findingId), decision];
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: never) => {
          const [id, ...statuses] = render(where).params;
          const card = table === schema.refinementProposals ? proposalById(id) : undefined;
          const changed = card && (statuses.length === 0 || statuses.includes(card.status)) ? [card] : [];
          for (const row of changed) Object.assign(row, values);
          if (table === schema.validationReports) Object.assign(reports.find(report => report.id === id) ?? {}, values);
          return Object.assign(Promise.resolve(), { returning: async () => changed.map(row => ({ id: row.id })) });
        },
      }),
    }),
    transaction: async (run: (tx: unknown) => Promise<unknown>, config?: { isolationLevel?: string }) => {
      isolation.push(config?.isolationLevel);
      return run(db);
    },
  };

  const answer = (key: string, fallback: object) => {
    const configured = key === 'bible-audit' ? options.coverage : options.contradictions;
    if (configured instanceof Error) throw configured;
    return configured ?? fallback;
  };
  const modelRouter = {
    bindRunSignal: () => controller.signal,
    structured: async (prompt: { key: string }, input: Record<string, unknown>) => {
      prompts[prompt.key] = input;
      return prompt.key === 'bible-audit'
        ? answer(prompt.key, { findings: [{ ref: 'doc:world/geography', action: 'keep', finding: 'Fine.' }], changeSet: [] })
        : answer(prompt.key, { contradictions: [] });
    },
  };
  const workflowRuns = {
    createRun: async (...args: unknown[]) => (queued.push(['run', ...args]), 'run-queued'),
    linkContextPack: async () => undefined,
    settleJobRuns: async (...args: unknown[]) => void queued.push(['settled', ...args]),
    runChain: async (_projectId: bigint, _graph: string, _target: string, _input: unknown, fn: (runId: string) => Promise<unknown>) => ({
      runId: 'run-1',
      result: await fn('run-1'),
    }),
  };
  const proposalService = {
    create: async (_projectId: bigint, input: Record<string, unknown>) => {
      staged.push(input);
      return addProposal({ kind: input['kind'], changeSet: input['changeSet'], baseline: input['baseline'], summary: input['summary'], scopeType: input['scopeType'] });
    },
  };

  const service = new BibleAuditService(
    { getPostgresClient: () => db } as never,
    workflowRuns as never,
    modelRouter as never,
    { forAudit: async () => ({ id: null, rendered: 'PREMISE' }) } as never,
    { resolve: async () => ({ writerClass: 'standard' }) } as never,
    proposalService as never,
    { enqueue: async (...args: unknown[]) => (queued.push(['enqueue', ...args]), 'job-1'), get: async () => ({ status: 'pending' }) } as never,
    { dispatch: async () => undefined } as never,
    {
      register: (kind: string, registered: (job: object) => Promise<void>) => {
        registeredKinds.push(kind);
        handler = registered;
      },
    } as never,
  );
  return {
    service,
    reports,
    proposals,
    staged,
    prompts,
    registeredKinds,
    locks,
    isolation,
    queued,
    cancel: () => controller.abort(),
    settleAfterNextLock: status => void (settleAfterLock = status),
    runRegisteredJob: async job => {
      service.onModuleInit();
      await handler?.(job);
    },
  };
}
