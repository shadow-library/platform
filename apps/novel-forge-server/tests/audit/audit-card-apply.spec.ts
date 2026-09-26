import { describe, expect, it } from 'bun:test';

import { loadArtifactStates } from '@modules/refinement/artifact-state';
import { type ChangeOp } from '@modules/refinement/change-set';
import { ProposalApplyService } from '@modules/refinement/proposal-apply.service';
import { ProposalService } from '@modules/refinement/proposal.service';
import { type BibleAuditFinding } from '@server/database';

const OPS: ChangeOp[] = [
  { op: 'premise.update', premise: 'A ferryman carries the dead.' },
  { op: 'premise.update', premise: 'A ferryman carries the living.' },
];

function finding(id: string, opIndexes: number[]): BibleAuditFinding {
  return { id, group: 'contradiction', ref: 'premise', text: id, evidence: [], opIndexes, withheld: null };
}

async function auditCard(decisions: { findingId: string; decision: 'kept' | 'skipped' }[], options: { linked?: boolean } = {}) {
  const events: string[] = [];
  const premises: unknown[] = [];
  const project = { id: 7n, premise: 'A ferryman.', brief: null, themes: null, instructions: null };
  const report = { id: 9n, findings: [finding('f1', [0]), finding('f2', [1])], decisions };
  const tx = {
    query: {
      projects: { findFirst: async () => project },
      validationReports: {
        findFirst: async () => {
          events.push('read decisions');
          return options.linked === false ? undefined : report;
        },
      },
    },
    select: () => ({
      from: () => ({
        where: () => ({
          for: async () => {
            events.push('lock card');
            return [proposal];
          },
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        if ('premise' in values) premises.push(values['premise']);
        return { where: () => Object.assign(Promise.resolve(), { returning: async () => [{ ...proposal, ...values }] }) };
      },
    }),
    insert: () => ({ values: async () => undefined }),
  };
  const proposal = { id: 300n, projectId: 7n, kind: 'bible_audit', status: 'pending', changeSet: OPS, baseline: await loadArtifactStates(tx as never, 7n, ['premise']) };
  const service = new ProposalApplyService({ getPostgresClient: () => ({}) } as never, { has: () => true } as never);
  return { apply: (opIndexes?: number[]) => service.apply(7n, 300n, { tx: tx as never, opIndexes }), events, premises };
}

describe('ProposalApplyService.apply — an audit card', () => {
  it('should apply only what the author kept when no selection is given', async () => {
    const { apply, premises } = await auditCard([{ findingId: 'f1', decision: 'skipped' }]);

    const result = await apply();

    expect(premises).toEqual(['A ferryman carries the living.']);
    expect(result.proposal.status).toBe('applied');
  });

  it('should refuse a selection that reaches past what was kept', async () => {
    const { apply, premises } = await auditCard([{ findingId: 'f1', decision: 'skipped' }]);

    await expect(apply([0, 1])).rejects.toMatchObject({ code: 'AUD_006' });
    expect(premises).toEqual([]);
  });

  it('should apply a selection within what was kept', async () => {
    const { apply, premises } = await auditCard([]);

    await apply([1]);

    expect(premises).toEqual(['A ferryman carries the living.']);
  });

  it('should refuse a card whose every finding was skipped', async () => {
    const { apply } = await auditCard([
      { findingId: 'f1', decision: 'skipped' },
      { findingId: 'f2', decision: 'skipped' },
    ]);

    await expect(apply()).rejects.toMatchObject({ code: 'AUD_005' });
  });

  it('should read the answers only once it holds the card, so a Skip committed first is honoured', async () => {
    const { apply, events } = await auditCard([{ findingId: 'f2', decision: 'skipped' }]);

    await apply();

    expect(events.slice(0, 2)).toEqual(['lock card', 'read decisions']);
  });

  it('should refuse to edit a card a report’s findings point into', async () => {
    const db = {
      query: {
        refinementProposals: { findFirst: async () => ({ id: 300n, projectId: 7n, kind: 'bible_audit', status: 'pending', changeSet: OPS }) },
        validationReports: { findFirst: async () => ({ id: 9n, findings: [], decisions: [] }) },
      },
    };
    const proposals = new ProposalService({ getPostgresClient: () => db } as never);

    await expect(proposals.updateChangeSet(7n, 300n, OPS)).rejects.toMatchObject({ code: 'AUD_007' });
  });

  it('should apply a bible audit card no report stands behind as any other card', async () => {
    const { apply, premises } = await auditCard([], { linked: false });

    await apply();

    expect(premises).toEqual(['A ferryman carries the dead.', 'A ferryman carries the living.']);
  });
});
