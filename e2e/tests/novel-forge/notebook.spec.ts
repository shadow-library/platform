/**
 * Importing npm packages
 */
import { type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb } from '../../lib';
import { expect, type ForgeActor, test } from './forge-actors';
import { expectCode, newProject } from './forge-arrange';
import {
  ForgeArrangeError,
  insertAuditFindingDecision,
  insertPendingProposal,
  insertValidationReport,
  missingArtifactRef,
  readEntityRow,
  readProposalRow,
  rebaselineProposal,
} from './forge-bible';
import { expectCommittedDespiteSerializerBug, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

interface LedgerEntryResponse {
  id: string;
  kind: string;
  topic: string;
  statement: string;
  why: string | null;
  status: 'active' | 'superseded' | 'withdrawn';
  supersedesId: string | null;
  ideaId: string | null;
  rejectionScope: string | null;
  decidedBy: string;
}

/**
 * Declaring the constants
 *
 * The Notebook ledger (NF2-LDG-01): direct entries, supersede/withdraw lifecycle, reserved-topic refusals and idea
 * rejections written off a proposal's ops. Nothing here reaches a model, so no spend guard is needed.
 */

async function postLedger(owner: ForgeActor, projectId: string, body: Record<string, unknown>): Promise<APIResponse> {
  return mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/ledger`, { data: body });
}

async function listLedger(owner: ForgeActor, projectId: string, query = ''): Promise<LedgerEntryResponse[]> {
  const response = await owner.ctx.get(`/api/v1/projects/${projectId}/ledger${query}`);
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { entries: LedgerEntryResponse[] }).entries;
}

/**
 * `GET /ledger/topics/:topic` is a single-`@RespondFor(200)` route, but it serializes the *same* `LedgerEntryResponse` shape as
 * supersede/reject — so a history that includes a superseded entry (a non-null `supersedesId`) hits the identical nullable-bigint
 * bug and 500s too. Returns `undefined` on that tolerated 500; the caller falls back to a DB read for what it needed.
 */
async function ledgerHistory(owner: ForgeActor, projectId: string, topic: string): Promise<LedgerEntryResponse[] | undefined> {
  const response = await owner.ctx.get(`/api/v1/projects/${projectId}/ledger/topics/${topic}`);
  await expectCommittedDespiteSerializerBug(response, 200, `reading the history of ${topic}`);
  if (response.status() !== 200) return undefined;
  return ((await response.json()) as { entries: LedgerEntryResponse[] }).entries;
}

async function readLedgerRow(id: string): Promise<{ topic: string; statement: string; status: 'active' | 'superseded' | 'withdrawn' } | undefined> {
  const [row] = await novelForgeDb()<{ topic: string; statement: string; supersededAt: Date | null; withdrawnReason: string | null }[]>`
    SELECT topic, statement, superseded_at AS "supersededAt", withdrawn_reason AS "withdrawnReason" FROM decision_ledger_entries WHERE id = ${id}
  `;
  if (!row) return undefined;
  const status = row.withdrawnReason ? 'withdrawn' : row.supersededAt ? 'superseded' : 'active';
  return { topic: row.topic, statement: row.statement, status };
}

async function readActiveLedgerEntryId(projectId: string, topic: string): Promise<string | undefined> {
  const [row] = await novelForgeDb()<{ id: string }[]>`
    SELECT id::text FROM decision_ledger_entries WHERE project_id = ${projectId} AND topic = ${topic} AND superseded_at IS NULL AND withdrawn_reason IS NULL
  `;
  return row?.id;
}

/** The same chain `GET /ledger/topics/:topic` orders oldest-first, read directly — the fallback for when that route hits the serializer bug. */
async function readLedgerHistoryIds(projectId: string, topic: string): Promise<string[]> {
  const rows = await novelForgeDb()<{ id: string }[]>`
    SELECT id::text FROM decision_ledger_entries WHERE project_id = ${projectId} AND topic = ${topic} ORDER BY created_at ASC, id ASC
  `;
  return rows.map(row => row.id);
}

test.describe('novel-forge notebook ledger', () => {
  test('should create, supersede and withdraw entries under the kind and topic rules', async ({ forge }) => {
    const owner = await forge.actor({ label: 'ledger-lifecycle' });
    const projectId = await newProject(owner, 'ledger-lifecycle');

    const created = await postLedger(owner, projectId, { kind: 'direction', topic: 'e2e.world-rules', statement: 'V1: magic costs nothing.' });
    expect(created.status(), await created.text()).toBe(201);
    const first = (await created.json()) as LedgerEntryResponse;
    expect(first).toMatchObject({ kind: 'direction', status: 'active', decidedBy: 'author' });

    const superseded = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/ledger/${first.id}/supersede`, {
      data: { statement: 'V2: magic always has a cost.' },
    });
    await expectCommittedDespiteSerializerBug(superseded, 201, 'superseding an entry with no earlier successor');
    const secondId = await readActiveLedgerEntryId(projectId, 'e2e.world-rules');
    if (!secondId) throw new ForgeArrangeError('expected a new active entry on e2e.world-rules after the supersede');
    expect(await readLedgerRow(secondId)).toMatchObject({ topic: 'e2e.world-rules', status: 'active', statement: 'V2: magic always has a cost.' });
    expect(await readLedgerRow(first.id)).toMatchObject({ status: 'superseded' });

    const history = await ledgerHistory(owner, projectId, 'e2e.world-rules');
    if (history) {
      expect(history.map(entry => ({ id: entry.id, status: entry.status }))).toEqual([
        { id: first.id, status: 'superseded' },
        { id: secondId, status: 'active' },
      ]);
    } else {
      expect(await readLedgerHistoryIds(projectId, 'e2e.world-rules'), 'the history route 500d on the superseded entry — order confirmed from the DB instead').toEqual([
        first.id,
        secondId,
      ]);
    }

    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/ledger/${first.id}/supersede`, { data: { statement: 'no longer possible' } }),
      409,
      'LDG_002',
      'superseding an already-retired entry',
    );

    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/ledger/${secondId}/supersede`, { data: { kind: 'decision', statement: 'promoted?' } }),
      400,
      'LDG_003',
      'asking a decision from a direction',
    );

    const backlog = await postLedger(owner, projectId, { kind: 'backlog', topic: 'e2e.someday', statement: 'Add a prologue.' });
    expect(backlog.status(), await backlog.text()).toBe(201);
    const backlogEntry = (await backlog.json()) as LedgerEntryResponse;
    const withdrawn = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/ledger/${backlogEntry.id}/withdraw`, { data: { reason: 'not needed after all' } });
    expect(withdrawn.status(), await withdrawn.text()).toBe(200);
    expect((await withdrawn.json()) as LedgerEntryResponse).toMatchObject({ status: 'withdrawn' });

    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/ledger/999999999/withdraw`, { data: { reason: 'x' } }),
      404,
      'LDG_001',
      'withdrawing an unknown entry',
    );
  });

  test('should refuse a malformed or reserved topic, and hide reserved topics from the default listing', async ({ forge }) => {
    const owner = await forge.actor({ label: 'ledger-reserved' });
    const projectId = await newProject(owner, 'ledger-reserved');

    for (const topic of ['start.brief', 'progress.premise', 'idea.000000000000000000000000']) {
      await expectCode(await postLedger(owner, projectId, { kind: 'direction', topic, statement: 'x' }), 400, 'LDG_005', `writing directly to the reserved topic ${topic}`);
    }

    // `LDG_004` ("not a key of lowercase words joined by dots, dashes or underscores") is dead code on this route: the DTO's own
    // `pattern` constraint on `topic` rejects a malformed key at the schema layer before `LedgerService.append`'s own regex check ever
    // runs, so the response is the generic schema-validation shape, not `LDG_004`.
    const malformed = await postLedger(owner, projectId, { kind: 'direction', topic: 'Not A Valid Topic!', statement: 'x' });
    expect(malformed.status(), await malformed.text()).toBe(422);
    expect(await malformed.json().then((body: { code?: string }) => body.code), 'the schema layer refuses it first — LDG_004 is unreachable through this route').toBe(
      'VALIDATION_ERROR',
    );

    const notes = await mutate(owner.ctx, 'put', `/api/v1/projects/${projectId}/notes`, { data: { notes: 'Working idea: a cartographer maps a moving district.' } });
    expect(notes.status(), await notes.text()).toBe(204);
    const progress = await mutate(owner.ctx, 'put', `/api/v1/projects/${projectId}/progress/premise`, { data: { status: 'dismissed' } });
    expect(progress.status(), await progress.text()).toBe(200);

    const defaultList = await listLedger(owner, projectId);
    expect(
      defaultList.some(entry => entry.topic === 'start.brief' || entry.topic.startsWith('progress.')),
      'the Notebook view hides the notes brief and progress overrides',
    ).toBe(false);

    const withReserved = await listLedger(owner, projectId, '?topics=start.brief,progress.%2A');
    expect(
      withReserved.some(entry => entry.topic === 'start.brief'),
      'an explicit topics filter opts back into the notes brief',
    ).toBe(true);
    expect(
      withReserved.some(entry => entry.topic === 'progress.premise'),
      'and into the progress override',
    ).toBe(true);
  });

  test('should ledger an idea rejection keyed by the idea, never the secret it names, and replace the scope on a repeat', async ({ forge }) => {
    const owner = await forge.actor({ label: 'ledger-idea' });
    const projectId = await newProject(owner, 'ledger-idea');

    const factChangeSet = [
      { op: 'fact.upsert', factKey: 'e2e-hidden-truth', body: 'The tide itself is listening and it wants the flame.', writerNote: 'Keep it eerie, never explain.' },
    ];
    const proposalId = await insertPendingProposal({ projectId, scopeType: 'project', kind: 'hub', changeSet: factChangeSet });
    await rebaselineProposal(owner.ctx, projectId, proposalId, factChangeSet);

    const rejected = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/ops/0/reject`, {
      data: { scope: 'never', why: 'not the direction I want' },
    });
    expect(rejected.status(), await rejected.text()).toBe(201);
    const entry = (await rejected.json()) as LedgerEntryResponse;
    expect(entry.topic).toMatch(/^idea\.[0-9a-f]{24}$/);
    expect(entry.kind).toBe('rejected');
    expect(entry.statement, 'the label names the record, never the secret’s text').toBe('Secret e2e-hidden-truth');
    expect(entry.statement).not.toContain('tide itself is listening');
    expect(entry.statement).not.toContain('Keep it eerie');
    expect(entry.rejectionScope).toBe('never');

    const rejectedAgain = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/ops/0/reject`, { data: { scope: 'not_now' } });
    await expectCommittedDespiteSerializerBug(rejectedAgain, 201, 'rejecting the same idea a second time');
    const secondEntryId = await readActiveLedgerEntryId(projectId, entry.topic);
    if (!secondEntryId) throw new ForgeArrangeError(`expected a new active entry on ${entry.topic} after the repeat rejection`);
    expect(secondEntryId, 'the same idea is superseded, not duplicated').not.toBe(entry.id);
    expect(await readLedgerRow(entry.id)).toMatchObject({ status: 'superseded' });

    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/ops/999/reject`, { data: { scope: 'never' } }),
      404,
      'LDG_006',
      'rejecting an out-of-range op index',
    );

    const actionChangeSet = [{ op: 'action.finalize' }];
    const actionProposalId = await insertPendingProposal({ projectId, scopeType: 'project', kind: 'hub', changeSet: actionChangeSet });
    await rebaselineProposal(owner.ctx, projectId, actionProposalId, actionChangeSet);
    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${actionProposalId}/ops/0/reject`, { data: { scope: 'never' } }),
      400,
      'LDG_007',
      'rejecting an action op',
    );

    const noRefsChangeSet = [{ op: 'organise.rule', rule: 'Always use present tense internally.', optionId: 'r1' }];
    const noRefsProposalId = await insertPendingProposal({ projectId, scopeType: 'project', kind: 'hub', changeSet: noRefsChangeSet });
    await rebaselineProposal(owner.ctx, projectId, noRefsProposalId, noRefsChangeSet);
    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${noRefsProposalId}/ops/0/reject`, { data: { scope: 'not_this_version' } }),
      400,
      'LDG_008',
      '"not this version" on an op with no artifact refs',
    );
  });
});

const CHECKED_STUB = {
  passes: { coverage: 'ran', contradictions: 'ran' },
  documents: { count: 0, sections: [], clipped: 0, omitted: 0 },
  entities: { count: 0, byType: {}, omitted: 0 },
  facts: { count: 0, omitted: 0 },
  chapters: null,
  chaptersWithoutSummary: [],
  chaptersIsolated: [],
  chaptersOmitted: 0,
  copy: 'e2e seeded audit report',
};

test.describe('novel-forge bible audit findings (arranged report)', () => {
  test('should report an empty audit history and 404 an unknown report', async ({ forge }) => {
    const owner = await forge.actor({ label: 'audit-empty' });
    const projectId = await newProject(owner, 'audit-empty');

    const list = await owner.ctx.get(`/api/v1/projects/${projectId}/bible/audits`);
    expect(list.status(), await list.text()).toBe(200);
    expect(((await list.json()) as { items: unknown[] }).items).toEqual([]);

    await expectCode(await owner.ctx.get(`/api/v1/projects/${projectId}/bible/audits/999999999`), 404, 'AUD_001', 'an unknown audit report');
  });

  test('should apply only the kept findings, 404 an unknown finding, and refuse a decision after the card settles', async ({ forge }) => {
    const owner = await forge.actor({ label: 'audit-decide' });
    const projectId = await newProject(owner, 'audit-decide');
    const keyA = `kept-${uniqueSuffix()}`;
    const keyB = `skipped-${uniqueSuffix()}`;

    const proposalId = await insertPendingProposal({
      projectId,
      scopeType: 'novel',
      kind: 'bible_audit',
      changeSet: [
        { op: 'entity.upsert', entityKey: keyA, type: 'character', name: 'Kept Entity' },
        { op: 'entity.upsert', entityKey: keyB, type: 'character', name: 'Skipped Entity' },
      ],
      baseline: { [`entity:${keyA}`]: missingArtifactRef(), [`entity:${keyB}`]: missingArtifactRef() },
    });
    const reportId = await insertValidationReport({
      projectId,
      proposalId,
      findings: [
        { id: 'finding-a', group: 'add', ref: `entity:${keyA}`, text: 'A character the manifest expects is missing.', evidence: [], opIndexes: [0], withheld: null },
        { id: 'finding-b', group: 'add', ref: `entity:${keyB}`, text: 'Another missing character.', evidence: [], opIndexes: [1], withheld: null },
      ],
      checked: CHECKED_STUB,
    });

    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/bible/audits/${reportId}/findings/does-not-exist/decision`, { data: { decision: 'kept' } }),
      404,
      'AUD_002',
      'deciding an unknown finding',
    );

    // `AUD_007` only fires while the card is still `pending` — `updateChangeSet` (`proposal.service.ts`) checks `status !== 'pending'`
    // (→ `RFN_002`) before it even looks at whether the card is audit-linked, so a settled card refuses a hand-edit with the more
    // generic code instead. Checked here, before any finding is decided.
    await expectCode(
      await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}/proposals/${proposalId}`, {
        data: { changeSet: [{ op: 'entity.upsert', entityKey: keyA, type: 'character' }] },
      }),
      400,
      'AUD_007',
      'hand-editing a still-pending audit card',
    );

    // `BibleAuditReportResponse.proposalId` (`bible-audit.dto.ts:191`) is the same nullable-bigint shape as `LedgerEntryResponse.supersedesId`
    // — a report already linked to a card (the normal case) 500s on any route that serializes it back.
    const keep = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/bible/audits/${reportId}/findings/finding-a/decision`, { data: { decision: 'kept' } });
    await expectCommittedDespiteSerializerBug(keep, 200, 'keeping a finding on a card with a linked proposal');
    const skip = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/bible/audits/${reportId}/findings/finding-b/decision`, {
      data: { decision: 'skipped', reason: 'not now' },
    });
    await expectCommittedDespiteSerializerBug(skip, 200, 'skipping a finding on a card with a linked proposal');

    const applyResponse = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/apply`, { data: {} });
    await expectCommittedDespiteSerializerBug(applyResponse, 200, 'apply on a card with one kept finding');
    expect((await readProposalRow(proposalId))?.status, 'the card applied despite the broken response').toBe('applied');
    expect((await readEntityRow(projectId, keyA))?.name, 'the kept finding’s entity was created').toBe('Kept Entity');
    expect(await readEntityRow(projectId, keyB), 'the skipped finding’s entity was never created').toBeUndefined();

    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/bible/audits/${reportId}/findings/finding-a/decision`, { data: { decision: 'skipped' } }),
      409,
      'AUD_003',
      'deciding a finding on a card that already settled',
    );

    await expectCode(
      await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}/proposals/${proposalId}`, {
        data: { changeSet: [{ op: 'entity.upsert', entityKey: keyA, type: 'character' }] },
      }),
      400,
      'RFN_002',
      'hand-editing a card that has already settled — no longer audit-specific once applied',
    );
  });

  test('should discard the card once every finding is skipped, and refuse to apply a card decided down to nothing kept', async ({ forge }) => {
    const owner = await forge.actor({ label: 'audit-skip-all' });
    const projectId = await newProject(owner, 'audit-skip-all');
    const entityKeyA = `unwanted-${uniqueSuffix()}`;
    const entityKeyB = `unwanted-b-${uniqueSuffix()}`;

    const skipAllProposal = await insertPendingProposal({
      projectId,
      scopeType: 'novel',
      kind: 'bible_audit',
      changeSet: [{ op: 'entity.upsert', entityKey: entityKeyA, type: 'character', name: 'Unwanted' }],
      baseline: { [`entity:${entityKeyA}`]: missingArtifactRef() },
    });
    const skipAllReportId = await insertValidationReport({
      projectId,
      proposalId: skipAllProposal,
      findings: [{ id: 'only-finding', group: 'add', ref: `entity:${entityKeyA}`, text: 'A minor character the manifest expects.', evidence: [], opIndexes: [0], withheld: null }],
      checked: CHECKED_STUB,
    });
    const decideSkip = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/bible/audits/${skipAllReportId}/findings/only-finding/decision`, {
      data: { decision: 'skipped' },
    });
    await expectCommittedDespiteSerializerBug(decideSkip, 200, 'skipping the only finding on a linked card');
    expect((await readProposalRow(skipAllProposal))?.status, 'skipping the only finding discards its card').toBe('discarded');

    const nothingKeptProposal = await insertPendingProposal({
      projectId,
      scopeType: 'novel',
      kind: 'bible_audit',
      changeSet: [{ op: 'entity.upsert', entityKey: entityKeyB, type: 'character', name: 'Also unwanted' }],
      baseline: { [`entity:${entityKeyB}`]: missingArtifactRef() },
    });
    const nothingKeptReportId = await insertValidationReport({
      projectId,
      proposalId: nothingKeptProposal,
      findings: [{ id: 'skipped-finding', group: 'add', ref: `entity:${entityKeyB}`, text: 'Another minor character.', evidence: [], opIndexes: [0], withheld: null }],
      checked: CHECKED_STUB,
    });
    // Arranged directly rather than through `decide`, which auto-discards the card the moment its last finding
    // is skipped — the only way to observe `apply` reach a still-`pending` card with nothing left kept.
    await insertAuditFindingDecision(nothingKeptReportId, 'skipped-finding', 'skipped');

    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${nothingKeptProposal}/apply`, { data: {} }),
      409,
      'AUD_005',
      'applying a card with nothing kept',
    );
  });
});

test.fixme(
  'should return the entry body with a real supersedesId — ledger.dto.ts:177 (`supersedesId: bigint | null`) and bible-audit.dto.ts:191 (`proposalId?: bigint | null`) ' +
    "are nullable-bigint response fields that class-schema's nullable/anyOf handling (packages/class-schema/src/class-schema.ts:194-200) fails to serialize once non-null, " +
    '500ing every second supersede/reject and every decision on a linked audit card, after the write commits',
  async ({ forge }) => {
    const owner = await forge.actor({ label: 'notebook-serialize-fixme' });
    const projectId = await newProject(owner, 'notebook-serialize-fixme');
    const entry = await postLedger(owner, projectId, { kind: 'direction', topic: 'e2e.fixme-topic', statement: 'first' });
    expect(entry.status()).toBe(201);
    const { id } = (await entry.json()) as LedgerEntryResponse;
    const superseded = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/ledger/${id}/supersede`, { data: { statement: 'second' } });
    expect(superseded.status(), await superseded.text()).toBe(201);
    const body = (await superseded.json()) as LedgerEntryResponse;
    expect(body.supersedesId).toBe(id);
  },
);
