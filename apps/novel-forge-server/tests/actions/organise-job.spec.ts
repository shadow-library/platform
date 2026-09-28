import { describe, expect, it } from 'bun:test';

import { AppErrorCode } from '@server/classes';
import { type Job, type Ledger, schema } from '@server/database';

import { OrganiseJobService } from '@modules/actions/organise-job.service';
import { HARD_LINE_LEXICON } from '@modules/ai/hard-line';
import { type NotesOrganiseOutput } from '@modules/ai/schemas/notes-organise.schema';
import { retryAfter } from '@modules/jobs/job.executor';
import { ORGANISE_CHANGE_OPS } from '@modules/notes';

import { ledgerEntry } from '../ledger/ledger-fixtures';

const SESSION = '11111111-1111-4111-8111-111111111111';
const ORIGIN = { sessionId: SESSION, messageId: '4', proposalId: '9', opIndex: 1 };
const NOTES = Array.from({ length: 620 }, (_, index) => (index % 12 === 0 ? 'Ilse carries sealed letters up from the salt mine.' : 'word')).join(' ');
const QUOTE = 'carries sealed letters up from the salt mine';
const PROBE = (HARD_LINE_LEXICON.standalone[0] as RegExp).source.replace(/^\\b\(\?:|\)\\b$/g, '');

const ORGANISED: NotesOrganiseOutput = {
  reading: 'A courier in a salt-mine town learns who owns the letters she carries.',
  timeline: [{ band: 'opening', event: 'Ilse carries a sealed letter up from the mine' }],
  pages: [{ section: 'project', slug: 'cast', title: 'Cast', sections: [{ heading: 'Ilse', body: 'A courier who never opens what she carries.', source: 'notes' }] }],
  records: [{ name: 'Ilse', type: 'character', summary: 'A courier who never opens what she carries.', source: 'notes' }],
  rules: [{ rule: 'Ilse never opens a letter she carries' }],
  questions: [{ question: 'Who sent the first letter?', why: 'Chapter one opens on it.' }],
  suggestions: [],
  coachMessage: 'Your notes are clear on the opening.',
};

const QUOTED: NotesOrganiseOutput = {
  ...ORGANISED,
  pages: [
    {
      section: 'project',
      slug: 'cast',
      title: 'Cast',
      sections: [{ heading: 'Ilse', body: 'Ilse carries sealed letters up from the salt mine.', source: 'notes', quote: QUOTE, paragraphs: [1] }],
    },
  ],
  records: [{ name: 'Ilse', type: 'character', summary: 'Ilse carries sealed letters up from the salt mine.', source: 'notes', quote: QUOTE, paragraphs: [1] }],
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
  staged?: { id: bigint; autoApplied?: boolean }[];
  contentMode?: 'standard' | 'unrestricted';
  outputs?: NotesOrganiseOutput[];
  /** The call to `create` that fails, counted from 1. */
  failCreate?: number;
  failApply?: boolean;
  /** Whether a discard still finds the card waiting, or something else settled it first. */
  settledFirst?: boolean;
}

function organiser(stored: Stored) {
  const progress: Record<string, unknown>[] = [];
  const settled: unknown[][] = [];
  const created: Record<string, unknown>[] = [];
  const applied: unknown[][] = [];
  const updates: Record<string, unknown>[] = [];
  const contexts: Record<string, string>[] = [];
  const rows = (result: unknown[]) => Object.assign(Promise.resolve(result), { limit: async () => result, orderBy: () => ({ limit: async () => result }), for: async () => [] });
  const db = {
    query: {
      projects: { findFirst: async () => ({ id: 1n, contentMode: stored.contentMode ?? 'standard' }) },
      decisionLedgerEntries: { findMany: async () => stored.ledger ?? [] },
      chatSessions: { findFirst: async () => ({ mode: 'auto' }) },
      bibleDocuments: { findMany: async () => [] },
      entities: { findMany: async () => [] },
    },
    select: () => ({ from: () => ({ innerJoin: () => ({ where: () => rows(stored.staged ?? []) }), where: () => rows([]) }) }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          updates.push({ table: table === schema.refinementProposals ? 'proposals' : 'other', ...values });
          return Object.assign(Promise.resolve(), { returning: async () => (stored.settledFirst ? [] : [{ id: 42n }]) });
        },
      }),
    }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  const outputs = [...(stored.outputs ?? [ORGANISED])];
  const modelRouter = { structured: async (_prompt: unknown, vars: Record<string, string>) => (contexts.push(vars), outputs.length > 1 ? outputs.shift() : outputs[0]) };
  const proposals = {
    create: async (_projectId: bigint, input: Record<string, unknown>) => {
      if (created.length + 1 === stored.failCreate) throw new Error('lost connection');
      created.push(input);
      return { id: 41n + BigInt(created.length), organiseRecord: input['organiseRecord'], warnings: null };
    },
  };
  const applier = {
    apply: async (...args: unknown[]) => {
      if (stored.failApply) throw AppErrorCode.NTS_001.create({ issues: 'refused' });
      applied.push(args);
      return { proposal: { id: args[1], organiseRecord: created.at(-1)?.['organiseRecord'] }, applied: [], staleMarked: [], opResults: [] };
    },
  };
  const service = new OrganiseJobService(
    { getPostgresClient: () => db } as never,
    { progress: async (_id: string, value: Record<string, unknown>) => void progress.push(value) } as never,
    {
      runChain: async (_projectId: bigint, _graph: string, _target: string, _input: unknown, fn: (runId: string) => Promise<unknown>) => ({
        runId: 'run-1',
        result: await fn('run-1'),
      }),
      settleJobRuns: async (...args: unknown[]) => void settled.push(args),
      forgetJobRuns: () => undefined,
    } as never,
    modelRouter as never,
    { resolve: async () => ({}) } as never,
    proposals as never,
    applier as never,
  );
  return { service, progress, settled, created, applied, updates, contexts };
}

const notes = (statement = NOTES) => [ledgerEntry({ topic: 'start.brief', statement })];

describe('OrganiseJobService', () => {
  it('should stage what the notes do not quote as one card in the chat the action came from, carrying the record its apply writes', async () => {
    const { service, created, applied, progress } = organiser({ ledger: notes() });

    await service.run(job());

    expect(applied).toEqual([]);
    expect(created).toEqual([expect.objectContaining({ sessionId: SESSION, messageId: 4n, kind: 'organise', runId: 'run-1', allowedOps: ORGANISE_CHANGE_OPS })]);
    expect(created[0]?.['organiseRecord']).toMatchObject({ version: 1, role: 'card' });
    expect(progress.at(-1)).toMatchObject({ phase: 'staged', proposalId: '42', organised: { paragraphs: 1, unusedParagraphs: [1], fromNotes: 0 } });
  });

  it('should apply what the notes quote at once, with its own record, before staging the rest as the card', async () => {
    const { service, created, applied, progress } = organiser({ ledger: notes(), outputs: [QUOTED] });

    await service.run(job());

    expect(created.map(input => (input['organiseRecord'] as { role: string }).role)).toEqual(['applied', 'card']);
    expect(created[0]?.['summary']).toBe('Added to your Story Bible — from your notes');
    expect(applied).toEqual([[1n, 42n, expect.objectContaining({ autoApplied: true, tx: expect.anything() })]]);
    expect(progress.at(-1)).toMatchObject({ appliedProposalId: '42', proposalId: '43', organised: { fromNotes: 2, unusedParagraphs: [] } });
  });

  it('should roll the whole stage back to be retried when the card fails to save after the applied part', async () => {
    const { service } = organiser({ ledger: notes(), outputs: [QUOTED], failCreate: 2 });

    const err = await service.run(job()).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(err).toMatchObject({ code: 'NTS_011' });
    expect(retryAfter({ kind: 'organise', attempts: 0 }, err, 60_000, 0)).toEqual(new Date(30_000));
  });

  it('should say on the job why what the notes back did not apply at once', async () => {
    const { service, progress } = organiser({ ledger: notes(), outputs: [QUOTED], failApply: true });

    await service.run(job());

    expect(progress.at(-1)).toMatchObject({ phase: 'staged', proposalId: '43', applyNote: expect.stringContaining('refused') });
    expect(progress.at(-1)).not.toHaveProperty('appliedProposalId');
  });

  it('should refuse to discard the applied side once something else has settled it', async () => {
    const { service } = organiser({ ledger: notes(), outputs: [QUOTED], failApply: true, settledFirst: true });

    await expect(service.run(job())).rejects.toMatchObject({ code: 'RFN_002' });
  });

  it('should replace an organise card still waiting from an older round', async () => {
    const { service, updates } = organiser({ ledger: notes() });

    await service.run(job());

    expect(updates).toContainEqual(expect.objectContaining({ table: 'proposals', status: 'superseded' }));
  });

  it('should organise long notes in parts, telling each later part what the earlier ones made, and stage once', async () => {
    const paragraph = Array.from({ length: 1_000 }, () => 'salt').join(' ');
    const { service, created, contexts, progress } = organiser({ ledger: notes([paragraph, paragraph, paragraph, paragraph].join('\n\n')) });

    await service.run(job());

    expect(contexts.map(context => context['volatileContext'])).toEqual([
      expect.stringContaining('this is ¶1–¶3 of 4'),
      expect.stringContaining('Records named in earlier parts, to use under the same name and type: Ilse (character).'),
    ]);
    expect(contexts[1]?.['authorNotes']).toContain('[¶4] salt');
    expect(created).toHaveLength(1);
    expect(progress.at(-1)).toMatchObject({ done: 3, total: 3, phase: 'staged', organised: { passes: 2 } });
  });

  it('should hold what an unrestricted model inferred to the hard line before it reaches a card', async () => {
    const inferred: NotesOrganiseOutput = { ...ORGANISED, suggestions: [{ page: 'project/cast', section: 'Ilse', text: `Ilse finds ${PROBE} in the mine.`, why: 'x' }] };
    const { service, created } = organiser({ ledger: notes(), contentMode: 'unrestricted', outputs: [inferred] });

    await expect(service.run(job())).rejects.toMatchObject({ code: 'AI_015' });
    expect(created).toEqual([]);
  });

  it('should not stage again when a retry finds what its first attempt staged', async () => {
    const { service, created, progress, settled } = organiser({ staged: [{ id: 42n, autoApplied: true }, { id: 43n }] });

    await service.run(job({ attempts: 1 }));

    expect(created).toEqual([]);
    expect(settled).toEqual([['job-1', 'completed']]);
    expect(progress).toEqual([expect.objectContaining({ phase: 'staged', appliedProposalId: '42', proposalId: '43' })]);
  });
});
