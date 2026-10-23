import { describe, expect, it } from 'bun:test';
import { type AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { type Refinement } from '@server/database';

import { renderTurnRules } from '@modules/ai/prompts';
import { ORGANISE_CARD_NOTE, ORGANISE_ROUTED_NOTE, organiseRouting, withLaterPlansRouted } from '@modules/refinement/later-plans-guard';
import { type ApplyResult } from '@modules/refinement/proposal-apply.service';
import { ChatLookupService } from '@modules/refinement/chat-lookup.service';
import { ChatSessionService } from '@modules/refinement/chat-session.service';
import { ChatTurnStagingService } from '@modules/refinement/chat-turn-staging.service';
import { ChatService, type ChatTurnOptions } from '@modules/refinement/chat.service';
import { ORGANISE_BUSY_NOTE, ORGANISE_REFUSED_NOTE, ORGANISE_STARTED_NOTE, type OrganiseStartPort, startNotesOrganise } from '@modules/refinement/turn-proposals';

const OPENER = 'Here are my notes for the story. Organise them into my Story Bible as the world stands when the story opens, and keep anything that happens later as my plans.';
const NOTES = Array.from({ length: 620 }, () => 'word').join(' ');
const organise = { op: 'action.organise_notes' };
const finalize = { op: 'action.finalize', upTo: 1 };

function proposal(id: bigint, changeSet: unknown[], status: Refinement.ProposalStatus = 'pending'): Refinement.Proposal {
  return { id, changeSet, status, warnings: [] } as unknown as Refinement.Proposal;
}

function applied(card: Refinement.Proposal, outcome: Record<string, unknown> = { status: 'applied', result: { jobId: 'job-1' } }): ApplyResult {
  return { proposal: { ...card, status: 'applied' }, applied: [], staleMarked: [], opResults: [{ index: 0, ...outcome }] } as unknown as ApplyResult;
}

describe('organiseRouting', () => {
  it('should start organising only for the author’s own request under Edit freely while not just discussing', () => {
    expect(organiseRouting(true, 'auto', false)).toBe('start');
    expect(organiseRouting(true, 'manual', false)).toBe('card');
    expect(organiseRouting(true, 'auto', true)).toBe('card');
    expect(organiseRouting(false, 'auto', false)).toBe('none');
  });

  it('should tell the model the job starts by itself only when it does', () => {
    const rule = 'starts by itself';
    expect(renderTurnRules({ proseEdits: false, organiseNotes: true, mode: 'auto' })).toContain(rule);
    expect(renderTurnRules({ proseEdits: false, organiseNotes: true, mode: 'manual' })).not.toContain(rule);
    expect(renderTurnRules({ proseEdits: false, organiseNotes: true, justDiscussing: true, mode: 'auto' })).not.toContain(rule);
    expect(renderTurnRules({ proseEdits: false, mode: 'auto' })).not.toContain(rule);
  });

  it('should ask the author to accept the card only when organising stays a card', () => {
    const output = { reply: 'Sure.', changeSet: [finalize] };
    expect(withLaterPlansRouted(output, 'card').reply).toBe(`Sure.\n\n${ORGANISE_ROUTED_NOTE} ${ORGANISE_CARD_NOTE}`);
    expect(withLaterPlansRouted(output, 'start')).toEqual({ reply: `Sure.\n\n${ORGANISE_ROUTED_NOTE}`, changeSet: [organise] });
  });
});

describe('startNotesOrganise', () => {
  function port(overrides: Partial<OrganiseStartPort> = {}) {
    const staged: unknown[][] = [];
    const accepted: bigint[] = [];
    const base: OrganiseStartPort = {
      stage: async changeSet => (staged.push(changeSet), proposal(BigInt(staged.length), changeSet)),
      refusal: async () => undefined,
      accept: async proposalId => (accepted.push(proposalId), applied(proposal(proposalId, [organise]))),
    };
    return { port: { ...base, ...overrides }, staged, accepted };
  }

  it('should accept the organise card on the author’s behalf and leave no card behind', async () => {
    const { port: started, staged, accepted } = port();

    expect(await startNotesOrganise(started, [])).toEqual({ cardProposal: null, note: ORGANISE_STARTED_NOTE });
    expect(staged).toEqual([[organise]]);
    expect(accepted).toEqual([1n]);
  });

  it('should leave the card pending, never accepted, while another authoring job runs', async () => {
    const { port: busy, accepted } = port({ refusal: async () => AppErrorCode.JOB_002.create() });

    const result = await startNotesOrganise(busy, []);

    expect(result.cardProposal).toMatchObject({ id: 1n, status: 'pending' });
    expect(result.note).toBe(ORGANISE_BUSY_NOTE);
    expect(accepted).toEqual([]);
  });

  it('should say why any other refusal keeps the card', async () => {
    const { port: refused } = port({ refusal: async () => AppErrorCode.NTS_004.create() });

    const result = await startNotesOrganise(refused, []);

    expect(result.note).toStartWith(ORGANISE_REFUSED_NOTE);
    expect(result.note).toContain('A card organising your notes is still waiting for you');
  });

  it('should keep the staged card when the accept itself is refused before it commits', async () => {
    const { port: refused } = port({
      accept: async () => {
        throw AppErrorCode.JOB_002.create();
      },
    });

    expect(await startNotesOrganise(refused, [])).toEqual({ cardProposal: expect.objectContaining({ id: 1n }), note: ORGANISE_BUSY_NOTE });
  });

  it('should stage a fresh card when the job is refused after the accept committed', async () => {
    const { port: raced, staged } = port({ accept: async proposalId => applied(proposal(proposalId, [organise]), { status: 'failed', error: 'Busy right now' }) });

    const result = await startNotesOrganise(raced, []);

    expect(staged).toEqual([[organise], [organise]]);
    expect(result).toEqual({ cardProposal: expect.objectContaining({ id: 2n, status: 'pending' }), note: `${ORGANISE_REFUSED_NOTE} Busy right now.` });
  });
});

const SESSION = { id: 'session-1', projectId: 1n, status: 'active', scopeType: 'project', scopeRef: null, contentMode: 'standard', costTier: null, createdAt: new Date(0) };

interface ChatSetup {
  mode: Refinement.ChatMode;
  output: { reply: string; changeSet?: unknown[] };
  refusal?: AppError;
}

function chat({ mode, output, refusal }: ChatSetup) {
  const updates: Record<string, unknown>[] = [];
  const created: unknown[][] = [];
  const applies: { proposalId: bigint; options?: unknown }[] = [];
  const db = {
    query: {
      chatSessions: { findFirst: async () => ({ ...SESSION, mode }) },
      projects: { findFirst: async () => ({ id: 1n, contentMode: 'standard' }) },
      decisionLedgerEntries: { findMany: async () => [] },
    },
    insert: () => ({ values: (values: Record<string, unknown>) => ({ returning: async () => [{ id: values['role'] === 'assistant' ? 2n : 1n, ...values }] }) }),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => void updates.push(values) }) }),
    select: () => ({ from: () => ({ where: async () => [{ max: 0 }] }) }),
  };
  const modelRouter = {
    routeModel: () => ({ task: 'novel-forge.chat', costTier: 'balanced', contentMode: 'standard' }),
    structured: async () => output,
  };
  const workflowRunService = {
    runChain: async (_projectId: bigint, _graph: string, _target: string, _input: unknown, fn: (runId: string) => Promise<unknown>) => ({
      runId: 'run-1',
      result: await fn('run-1'),
    }),
    linkContextPack: async () => undefined,
    setParentRun: async () => undefined,
  };
  const proposalService = {
    create: async (_projectId: bigint, input: { changeSet: unknown[] }) => (created.push(input.changeSet), proposal(BigInt(10 + created.length), input.changeSet)),
  };
  const proposalApplyService = {
    apply: async (_projectId: bigint, proposalId: bigint, options?: unknown) => (applies.push({ proposalId, options }), applied(proposal(proposalId, [organise]))),
  };
  const actionRegistry = { refusal: async () => refusal };
  const databaseService = { getPostgresClient: () => db } as never;
  const service = new ChatService(
    databaseService,
    { forNovelChat: async () => ({ id: null, sections: [], omitted: [], renderedStable: '', renderedVolatile: '' }) } as never,
    modelRouter as never,
    workflowRunService as never,
    { compactIfNeeded: async () => undefined, buildHistory: async () => [], continueConversation: async () => ({ plain: [], history: [], segment: null }) } as never,
    { resolve: async () => ({ writerClass: 'standard', raised: false, systemMessages: [] }) } as never,
    { publish: () => undefined } as never,
    { read: async () => ({ text: NOTES }) } as never,
    { modeFor: async () => 'off' } as never,
    new ChatSessionService(databaseService, modelRouter as never, workflowRunService as never, { publish: () => undefined } as never),
    new ChatLookupService(databaseService, { getRaw: () => [] } as never, {} as never),
    new ChatTurnStagingService(databaseService, proposalService as never, proposalApplyService as never, actionRegistry as never),
  );
  const turn = (content: string, options?: ChatTurnOptions) => service.turn(1n, 'session-1', content, undefined, options);
  return { turn, updates, created, applies };
}

describe('ChatService.turn — organising the notes', () => {
  it('should start the organise job for the author’s request under Edit freely, with no card on the reply', async () => {
    const run = chat({ mode: 'auto', output: { reply: 'On it.', changeSet: [organise] } });

    const result = await run.turn(OPENER);

    expect(run.applies).toEqual([{ proposalId: 11n, options: undefined }]);
    expect(result.proposal).toBeNull();
    expect(result.appliedProposal).toBeNull();
    expect(result.assistantMessage.content).toBe(`On it.\n\n${ORGANISE_STARTED_NOTE}`);
    expect(run.updates.some(update => 'proposalId' in update || 'appliedProposalId' in update)).toBe(false);
  });

  it('should keep a card under Ask first and when just discussing', async () => {
    for (const [mode, options] of [
      ['manual', {}],
      ['auto', { justDiscussing: true }],
    ] as const) {
      const run = chat({ mode, output: { reply: 'Here it is.', changeSet: [organise] } });

      const result = await run.turn('Organise my notes', options);

      expect(run.applies).toEqual([]);
      expect(result.proposal).toMatchObject({ status: 'pending', changeSet: [organise] });
      expect(run.updates).toContainEqual({ proposalId: result.proposal?.id });
    }
  });

  it('should fall back to the card and say so while another job runs', async () => {
    const run = chat({ mode: 'auto', output: { reply: 'On it.', changeSet: [organise] }, refusal: AppErrorCode.JOB_002.create() });

    const result = await run.turn('Organise my notes');

    expect(run.applies).toEqual([]);
    expect(result.proposal).toMatchObject({ status: 'pending', changeSet: [organise] });
    expect(result.assistantMessage.content).toBe(`On it.\n\n${ORGANISE_BUSY_NOTE}`);
  });

  it('should keep a model-proposed organise a card on a turn that is not the author’s request', async () => {
    const run = chat({ mode: 'auto', output: { reply: 'Shall I organise them?', changeSet: [organise] } });

    const result = await run.turn('I added a few lines about the salt mine to my notes.');

    expect(run.applies).toEqual([]);
    expect(result.proposal).toMatchObject({ status: 'pending', changeSet: [organise] });
    expect(result.assistantMessage.content).toBe('Shall I organise them?');
  });

  it('should never start a one-way door: an organise request stages the organise action alone, and finalize elsewhere stays a card', async () => {
    const request = chat({ mode: 'auto', output: { reply: 'Done.', changeSet: [finalize] } });
    await request.turn(OPENER);
    expect(request.created).toEqual([[organise]]);

    const other = chat({ mode: 'auto', output: { reply: 'Finalizing.', changeSet: [finalize] } });
    const result = await other.turn('Finalize chapter 1.');
    expect(other.applies).toEqual([]);
    expect(result.proposal).toMatchObject({ status: 'pending', changeSet: [finalize] });
  });
});
