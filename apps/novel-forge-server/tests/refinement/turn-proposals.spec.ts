import { describe, expect, it } from 'bun:test';

import { AppErrorCode } from '@server/classes';
import { type Refinement } from '@server/database';

import { type ApplyResult, type ChangeOp } from '@modules/refinement';
import {
  APPLY_FAILED_NOTE,
  CARDS_UNSAVED_NOTE,
  HELD_FOR_REVIEW_NOTE,
  splitTurnChangeSet,
  type StageOptions,
  stageTurnChangeSet,
  type TurnProposalPort,
  UNLINKED_NOTE,
} from '@modules/refinement/turn-proposals';
import { type ChangeSetSplit } from '@modules/refinement/write-policy';

const quoted: ChangeOp = { op: 'entity.upsert', entityKey: 'mira', type: 'character', name: 'Mira', quote: 'Mira is a thief' };
const idea: ChangeOp = { op: 'entity.upsert', entityKey: 'aldo', type: 'character', name: 'Aldo' };

function split(direct: ChangeOp[], cards: ChangeOp[], held = false): ChangeSetSplit {
  const ops = [...direct, ...cards];
  return { ops, direct, cards, held, dispositions: ops.map((_, index) => ({ index, side: index < direct.length ? 'direct' : 'card' })) };
}

interface FakePortOptions {
  stageWarnings?: (changeSet: ChangeOp[]) => string[];
  stageFails?: (changeSet: ChangeOp[]) => boolean;
  applyFails?: 'app' | 'internal';
  linkFails?: boolean;
}

function fakePort(options: FakePortOptions = {}) {
  const log: string[] = [];
  const staged: { changeSet: ChangeOp[]; warnings: string[]; options: StageOptions; id: bigint }[] = [];
  const port: TurnProposalPort = {
    stage: async (changeSet, warnings, stageOptions) => {
      if (options.stageFails?.(changeSet)) throw new Error('op not allowed');
      const id = BigInt(staged.length + 1);
      staged.push({ changeSet, warnings, options: stageOptions, id });
      log.push(`stage ${id}`);
      const own = options.stageWarnings?.(changeSet) ?? [];
      return { id, changeSet, status: 'pending', warnings: own.length > 0 ? own : null } as unknown as Refinement.Proposal;
    },
    apply: async id => {
      log.push(`apply ${id}`);
      if (options.applyFails === 'app') throw AppErrorCode.RFN_003.create();
      if (options.applyFails === 'internal') throw new Error('connection reset by peer at 10.0.0.4');
      return { proposal: { id, status: 'applied' }, applied: [{ artifactRef: 'entity:mira', newRevision: null }], staleMarked: [], opResults: [] } as unknown as ApplyResult;
    },
    linkApplied: async proposal => {
      log.push(`link ${proposal.id}`);
      if (options.linkFails) throw new Error('connection reset');
    },
    discard: async id => log.push(`discard ${id}`),
  };
  return { port, log, staged };
}

describe('stageTurnChangeSet', () => {
  it('should stage nothing for an empty split', async () => {
    const { port, log } = fakePort();

    expect(await stageTurnChangeSet(port, split([], []), [])).toEqual({ appliedProposal: null, cardProposal: null, applyNote: undefined });
    expect(log).toEqual([]);
  });

  it('should stage cards alone, with the turn warnings and the whole-set checks, and apply nothing', async () => {
    const { port, log, staged } = fakePort();

    const staging = await stageTurnChangeSet(port, split([], [idea]), ['echo']);

    expect(log).toEqual(['stage 1']);
    expect(staged[0]).toMatchObject({ changeSet: [idea], warnings: ['echo'], options: { entityMaterialization: true } });
    expect(staging.appliedProposal).toBeNull();
    expect(staging.cardProposal?.id).toBe(1n);
  });

  it('should note a hold on a cards-only turn', async () => {
    const { port } = fakePort();

    expect((await stageTurnChangeSet(port, split([], [quoted], true), ['echo'])).applyNote).toBe(HELD_FOR_REVIEW_NOTE);
  });

  it('should apply the author’s words and stage no cards when every op rests on a quote', async () => {
    const { port, log } = fakePort();

    const staging = await stageTurnChangeSet(port, split([quoted], []), []);

    expect(log).toEqual(['stage 1', 'apply 1', 'link 1']);
    expect(staging.appliedProposal?.id).toBe(1n);
    expect(staging.applied?.applied).toEqual([{ artifactRef: 'entity:mira', newRevision: null }]);
    expect(staging.cardProposal).toBeNull();
  });

  it('should apply the direct side before staging the cards, each half exempt from the whole-set materialization check', async () => {
    const { port, log, staged } = fakePort();

    const staging = await stageTurnChangeSet(port, split([quoted], [idea]), []);

    expect(log).toEqual(['stage 1', 'apply 1', 'link 1', 'stage 2']);
    expect(staged.map(entry => entry.options.entityMaterialization)).toEqual([false, false]);
    expect(staging.appliedProposal?.id).toBe(1n);
    expect(staging.cardProposal?.changeSet).toEqual([idea]);
  });

  it('should turn every op into a card when the apply fails, discarding the unapplied proposal', async () => {
    const { port, log, staged } = fakePort({ applyFails: 'app' });

    const staging = await stageTurnChangeSet(port, split([quoted], [idea]), []);

    expect(log).toEqual(['stage 1', 'apply 1', 'discard 1', 'stage 2']);
    expect(staged[1]).toMatchObject({ changeSet: [quoted, idea], options: { entityMaterialization: true } });
    expect(staging).toMatchObject({ appliedProposal: null, applyNote: AppErrorCode.RFN_003.create().message });
  });

  it('should never show the author the text of an internal failure', async () => {
    const { port } = fakePort({ applyFails: 'internal' });

    expect((await stageTurnChangeSet(port, split([quoted], [idea]), [])).applyNote).toBe(APPLY_FAILED_NOTE);
  });

  it('should keep the applied change and stage the cards when linking it to the reply fails, saying where to find it', async () => {
    const { port, log } = fakePort({ linkFails: true });

    const staging = await stageTurnChangeSet(port, split([quoted], [idea]), []);

    expect(log).toEqual(['stage 1', 'apply 1', 'link 1', 'stage 2']);
    expect(staging).toMatchObject({ appliedProposal: { id: 1n }, cardProposal: { id: 2n }, applyNote: UNLINKED_NOTE });
  });

  it('should keep the applied change, already linked, when the cards cannot be saved after it', async () => {
    const { port, log } = fakePort({ stageFails: changeSet => changeSet.includes(idea) });

    const staging = await stageTurnChangeSet(port, split([quoted], [idea]), []);

    expect(log).toEqual(['stage 1', 'apply 1', 'link 1']);
    expect(staging).toMatchObject({ appliedProposal: { id: 1n }, cardProposal: null, applyNote: CARDS_UNSAVED_NOTE });
    expect(staging.applied?.applied).toHaveLength(1);
  });

  it('should turn every op into a card when the direct side cannot be staged on its own', async () => {
    const { port, log } = fakePort({ stageFails: changeSet => changeSet.length === 1 });

    const staging = await stageTurnChangeSet(port, split([quoted], [idea]), []);

    expect(log).toEqual(['stage 1']);
    expect(staging).toMatchObject({ appliedProposal: null, applyNote: APPLY_FAILED_NOTE });
    expect(staging.cardProposal?.changeSet).toEqual([quoted, idea]);
  });

  it('should hold a direct side that raised a warning of its own, applying nothing', async () => {
    const { port, log } = fakePort({ stageWarnings: changeSet => (changeSet.length === 1 ? ['undates a fact'] : []) });

    const staging = await stageTurnChangeSet(port, split([quoted], [idea]), []);

    expect(log).toEqual(['stage 1', 'discard 1', 'stage 2']);
    expect(staging).toMatchObject({ appliedProposal: null, applyNote: HELD_FOR_REVIEW_NOTE });
    expect(staging.cardProposal?.changeSet).toEqual([quoted, idea]);
  });
});

describe('splitTurnChangeSet', () => {
  const MESSAGE = 'Mira is a thief who works the Saltgate docks.';
  const QUOTE = 'Mira is a thief who works the Saltgate docks';
  const ops: ChangeOp[] = [
    { op: 'premise.update', premise: 'A thief works the Saltgate docks.', quote: QUOTE },
    { op: 'entity.upsert', entityKey: 'mira', type: 'character', status: 'thief', quote: QUOTE },
    { op: 'entity.upsert', entityKey: 'kael', type: 'character', name: 'Kael', body: 'Kael the smith.' },
  ];

  function fakeDb(project: { premise: string | null }) {
    const mira = { entityKey: 'mira', name: 'Mira', type: 'character', status: null, motivation: null, notes: null, body: null };
    return {
      query: {
        projects: { findFirst: async () => ({ id: 7n, brief: null, themes: null, instructions: null, ...project }) },
        entities: { findMany: async () => [mira] },
      },
    };
  }

  it('should read the story fields and existing records as they stand when the turn stages', async () => {
    const project = { premise: '' as string | null };
    const db = fakeDb(project);
    const context = { authorMessage: MESSAGE, mode: 'auto' as const, justDiscussing: false, warnings: [] };

    const before = await splitTurnChangeSet(db as never, 7n, ops, context);
    project.premise = 'An older premise.';
    const after = await splitTurnChangeSet(db as never, 7n, ops, context);

    expect(before.dispositions.map(d => d.side)).toEqual(['direct', 'direct', 'card']);
    expect(after.dispositions[0]).toEqual({ index: 0, side: 'card', reason: 'always_card', rule: 'replaces_story' });
    expect(after.dispositions[1]).toEqual({ index: 1, side: 'direct' });
  });

  it('should hold the turn when it carries a warning, and make every op a card when just discussing', async () => {
    const db = fakeDb({ premise: '' });

    const held = await splitTurnChangeSet(db as never, 7n, ops, { authorMessage: MESSAGE, mode: 'auto', justDiscussing: false, warnings: ['echo'] });
    const discussing = await splitTurnChangeSet(db as never, 7n, ops, { authorMessage: MESSAGE, mode: 'auto', justDiscussing: true, warnings: [] });

    expect(held.held).toBe(true);
    expect(held.direct).toEqual([]);
    expect(discussing.dispositions.slice(0, 2).map(d => d.reason)).toEqual(['just_discussing', 'just_discussing']);
  });
});
