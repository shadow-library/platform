/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb } from '../../lib';
import { expect, test } from './forge-actors';
import { expectCode, guardedProject, newProject } from './forge-arrange';
import { assertSpendGuarded } from './forge-db';
import {
  countUserFeedback,
  insertLedgeredFact,
  insertPendingProposal,
  insertVolumeRow,
  missingArtifactRef,
  readEntityRow,
  readProposalRow,
  readVolumeRow,
  rebaselineProposal,
} from './forge-bible';
import { createEntity, expectStatus, pasteChapter, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

interface ApplyResponseBody {
  proposal: { id: string; status: string };
  applied: { artifactRef: string }[];
  opResults: { index: number; status: string }[];
}

interface ChangeItem {
  id: string;
  status: string;
  revertible: boolean;
  appliedAt: string | null;
}

interface UndoImpactResponse {
  proposalId: string;
  dependents: { kind: string; ref: string; chapter: number | null; because: string; final: boolean }[];
}

/**
 * Declaring the constants
 *
 * Refinement proposals: hand-edited (DB-inserted, then `PATCH`ed through the real API so the server validates, stamps idea ids and
 * re-baselines), applied, conflicted, reverted and rolled back. Every arranged change-set here is pure content ops or an unselected
 * `action.*` op that never runs — the one exception, `action.validate` on a project with no finalized chapters (zero model calls per
 * NF2-VAL-01), is quota-pinned as a belt-and-braces precaution since the route it reaches is generally model-capable.
 */

async function readProjectPremise(projectId: string): Promise<string | null> {
  const [row] = await novelForgeDb()<{ premise: string | null }[]>`SELECT premise FROM projects WHERE id = ${projectId}`;
  return row?.premise ?? null;
}

async function proposalStatus(proposalId: string): Promise<string | undefined> {
  return (await readProposalRow(proposalId))?.status;
}

test.describe('novel-forge proposal hand-edit and apply semantics', () => {
  test('should validate, stamp idea ids and re-baseline a hand-inserted proposal on PATCH', async ({ forge }) => {
    const owner = await forge.actor({ label: 'prop-hand-edit' });
    const projectId = await newProject(owner, 'prop-hand-edit');
    const entityKey = `e2e-prop-hand-${uniqueSuffix()}`;

    const proposalId = await insertPendingProposal({
      projectId,
      scopeType: 'novel',
      kind: 'hub',
      changeSet: [{ op: 'entity.upsert', entityKey, type: 'character', name: 'A hand-inserted candidate' }],
      baseline: {},
    });
    const before = await readProposalRow(proposalId);
    expect(before?.changeSet[0]?.['ideaId'], 'a raw insert carries no idea id yet').toBeUndefined();

    const patched = await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}/proposals/${proposalId}`, {
      data: { changeSet: [{ op: 'entity.upsert', entityKey, type: 'character', name: 'A hand-inserted candidate' }] },
    });
    expect(patched.status(), await patched.text()).toBe(200);
    const patchedBody = (await patched.json()) as { changeSet: { ideaId?: string }[]; baseline: Record<string, unknown> };
    expect(typeof patchedBody.changeSet[0]?.ideaId, 'PATCH stamps an idea id on every content op').toBe('string');
    expect(patchedBody.baseline[`entity:${entityKey}`], 'PATCH re-baselines against the current artifact state').toBeDefined();
  });

  test('should apply a multi-op proposal atomically and record exactly one approved feedback row', async ({ forge }) => {
    const owner = await forge.actor({ label: 'prop-apply' });
    const projectId = await newProject(owner, 'prop-apply');
    const alpha = `e2e-prop-alpha-${uniqueSuffix()}`;
    const beta = `e2e-prop-beta-${uniqueSuffix()}`;
    const changeSet = [
      { op: 'entity.upsert', entityKey: alpha, type: 'character', name: 'Alpha' },
      { op: 'entity.upsert', entityKey: beta, type: 'character', name: 'Beta' },
    ];
    const proposalId = await insertPendingProposal({ projectId, scopeType: 'novel', kind: 'hub', changeSet, baseline: {} });
    await rebaselineProposal(owner.ctx, projectId, proposalId, changeSet);

    const applied = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/apply`, { data: {} });
    await expectStatus(applied, 200, 'a multi-op atomic apply');
    expect(await proposalStatus(proposalId)).toBe('applied');
    expect(await readEntityRow(projectId, alpha)).toBeDefined();
    expect(await readEntityRow(projectId, beta)).toBeDefined();
    expect(await countUserFeedback(projectId, proposalId, 'approved'), 'one apply writes exactly one approved feedback row, not one per op').toBe(1);
  });

  test('should conflict a proposal whose artifact moved since its baseline, and leave only discard available', async ({ forge }) => {
    const owner = await forge.actor({ label: 'prop-conflict' });
    const projectId = await newProject(owner, 'prop-conflict');
    const entityKey = `e2e-prop-conflict-${uniqueSuffix()}`;
    await createEntity(owner.ctx, projectId, { entityKey, name: 'Original name' });

    const changeSetA = [{ op: 'entity.upsert', entityKey, type: 'character', name: 'Renamed by A' }];
    const changeSetB = [{ op: 'entity.upsert', entityKey, type: 'character', name: 'Renamed by B' }];
    const proposalA = await insertPendingProposal({ projectId, scopeType: 'novel', kind: 'hub', changeSet: changeSetA, baseline: {} });
    await rebaselineProposal(owner.ctx, projectId, proposalA, changeSetA);
    const proposalB = await insertPendingProposal({ projectId, scopeType: 'novel', kind: 'hub', changeSet: changeSetB, baseline: {} });
    await rebaselineProposal(owner.ctx, projectId, proposalB, changeSetB);

    const appliedA = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalA}/apply`, { data: {} });
    await expectStatus(appliedA, 200, 'the first of two racing applies');
    expect(await proposalStatus(proposalA)).toBe('applied');

    const appliedB = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalB}/apply`, { data: {} });
    await expectCode(appliedB, 409, 'RFN_003', "applying a proposal whose baseline no longer matches the artifact's current state");
    expect(await proposalStatus(proposalB)).toBe('conflicted');

    await expectCode(
      await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}/proposals/${proposalB}`, { data: { changeSet: changeSetB } }),
      400,
      'RFN_002',
      'hand-editing a conflicted proposal',
    );
    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalB}/apply`, { data: {} }),
      400,
      'RFN_002',
      'applying a conflicted proposal again',
    );

    const discarded = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalB}/discard`);
    expect(discarded.status(), await discarded.text()).toBe(200);
    expect(await proposalStatus(proposalB)).toBe('discarded');
  });

  test('should refuse a change-set edit that would rewrite an isolated chapter’s prose, then admit an edit that leaves its body alone', async ({ forge }) => {
    const owner = await forge.actor({ label: 'prop-guardrail' });
    const projectId = await newProject(owner, 'prop-guardrail');
    const isolated = await pasteChapter(owner.ctx, projectId, { title: 'Behind the wall', body: 'Original isolated prose that chat must never rewrite.' }, { isolated: true });
    expect(isolated.isolated, 'the paste isolated the chapter').toBe(true);

    const rewriteChangeSet = [{ op: 'draft.update', chapter: isolated.chapter, body: 'Chat tries to rewrite the isolated prose here.' }];
    const proposalId = await insertPendingProposal({ projectId, scopeType: 'novel', kind: 'hub', changeSet: rewriteChangeSet, baseline: {} });
    await rebaselineProposal(owner.ctx, projectId, proposalId, rewriteChangeSet);

    const applied = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/apply`, { data: {} });
    await expectCode(applied, 400, 'RFN_012', 'applying a draft.update that would rewrite an isolated chapter');
    expect(await proposalStatus(proposalId), 'a guard-rail refusal rolls back and leaves the proposal pending').toBe('pending');

    // The guard checks the body specifically, not any draft.update op on an isolated chapter: retitling without touching the body applies cleanly.
    const retitleChangeSet = [{ op: 'draft.update', chapter: isolated.chapter, title: 'Retitled without touching the isolated prose' }];
    await rebaselineProposal(owner.ctx, projectId, proposalId, retitleChangeSet);
    const retitled = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/apply`, { data: {} });
    await expectStatus(retitled, 200, 'a draft.update that only retitles an isolated chapter');
    expect(await proposalStatus(proposalId)).toBe('applied');
  });

  test('should refuse a hand edit of an organise card, then apply it unedited', async ({ forge }) => {
    const owner = await forge.actor({ label: 'prop-organise' });
    const projectId = await newProject(owner, 'prop-organise');
    const changeSet = [{ op: 'organise.rule', rule: 'Always keep chapter openings under three sentences.', optionId: 'r1' }];
    // `{ legacy: true }` (`LEGACY_ORGANISE_RECORD`) is what a card staged before organise cards carried a reconciliation record
    // reads as — apply treats it like any other card, rather than refusing with `NTS_009` for a card that carries no record at all.
    const proposalId = await insertPendingProposal({ projectId, scopeType: 'novel', kind: 'organise', changeSet, baseline: {}, organiseRecord: { legacy: true } });

    await expectCode(
      await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}/proposals/${proposalId}`, { data: { changeSet } }),
      400,
      'NTS_008',
      'hand-editing an organise card',
    );
    expect(await proposalStatus(proposalId), 'the refusal never touches the card — it stays pending, unedited').toBe('pending');

    // An organise card can never be PATCHed, but it can still be applied as staged.
    const applied = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/apply`, { data: {} });
    await expectStatus(applied, 200, 'applying an organise card unedited');
    expect(await proposalStatus(proposalId)).toBe('applied');
  });

  test('should filter the proposal list by status, kind and chapter', async ({ forge }) => {
    const owner = await forge.actor({ label: 'prop-list' });
    const projectId = await newProject(owner, 'prop-list');
    const pending = await insertPendingProposal({
      projectId,
      scopeType: 'novel',
      kind: 'hub',
      changeSet: [{ op: 'entity.upsert', entityKey: `e2e-prop-list-${uniqueSuffix()}`, type: 'character', name: 'List filter target' }],
      baseline: {},
    });
    const brief = await insertPendingProposal({
      projectId,
      scopeType: 'novel',
      kind: 'hub',
      changeSet: [{ op: 'brief.update', chapter: 3, body: 'A planned chapter brief body, long enough to be real.' }],
      baseline: {},
    });

    const byStatus = await owner.ctx.get(`/api/v1/projects/${projectId}/proposals?status=pending`);
    const byStatusIds = ((await byStatus.json()) as { items: { id: string }[] }).items.map(item => item.id);
    expect(byStatusIds).toEqual(expect.arrayContaining([pending, brief]));

    const byKind = await owner.ctx.get(`/api/v1/projects/${projectId}/proposals?kind=organise`);
    expect(((await byKind.json()) as { items: unknown[] }).items).toEqual([]);

    const byChapter = await owner.ctx.get(`/api/v1/projects/${projectId}/proposals?chapter=3`);
    const byChapterIds = ((await byChapter.json()) as { items: { id: string }[] }).items.map(item => item.id);
    expect(byChapterIds).toEqual([brief]);
  });
});

test.describe('novel-forge proposal cherry-pick, one-way doors, revert and rollback', () => {
  test('should apply only the selected ops, and refuse an empty or out-of-range selection', async ({ forge }) => {
    const owner = await forge.actor({ label: 'prop-cherry' });
    const projectId = await newProject(owner, 'prop-cherry');
    const kept = `e2e-prop-kept-${uniqueSuffix()}`;
    const skipped = `e2e-prop-skipped-${uniqueSuffix()}`;
    const changeSet = [
      { op: 'entity.upsert', entityKey: kept, type: 'character', name: 'Kept by opIndexes' },
      { op: 'entity.upsert', entityKey: skipped, type: 'character', name: 'Never selected' },
    ];
    const proposalId = await insertPendingProposal({ projectId, scopeType: 'novel', kind: 'hub', changeSet, baseline: {} });
    await rebaselineProposal(owner.ctx, projectId, proposalId, changeSet);

    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/apply`, { data: { opIndexes: [] } }),
      400,
      'RFN_011',
      'applying an empty op selection',
    );
    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/apply`, { data: { opIndexes: [5] } }),
      400,
      'RFN_011',
      'applying an out-of-range op selection',
    );

    const applied = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/apply`, { data: { opIndexes: [0] } });
    await expectStatus(applied, 200, 'cherry-picking one op');
    expect(await proposalStatus(proposalId)).toBe('applied');
    expect(await readEntityRow(projectId, kept)).toBeDefined();
    expect(await readEntityRow(projectId, skipped), 'the unselected op never wrote its artifact').toBeUndefined();
  });

  test('should refuse a blanket apply of any one-way-door action, and admit each once explicitly selected out', async ({ forge }) => {
    const owner = await forge.actor({ label: 'prop-door' });
    const projectId = await newProject(owner, 'prop-door');

    const doors: readonly { op: string; code: string; extra: Record<string, unknown> }[] = [
      { op: 'action.finalize', code: 'RFN_009', extra: {} },
      { op: 'action.approve_draft', code: 'DRF_009', extra: { chapter: 1 } },
      { op: 'action.generate_chapter', code: 'DRF_014', extra: { chapter: 1 } },
      { op: 'action.advance_volume', code: 'VOL_004', extra: { volumeKey: 'e2e-nonexistent-volume' } },
    ];

    for (const door of doors) {
      const entityKey = `e2e-prop-door-${door.code}-${uniqueSuffix()}`;
      const changeSet = [
        { op: 'entity.upsert', entityKey, type: 'character', name: `Content op beside ${door.op}` },
        { op: door.op, ...door.extra },
      ];
      const proposalId = await insertPendingProposal({ projectId, scopeType: 'novel', kind: 'hub', changeSet, baseline: {} });
      await rebaselineProposal(owner.ctx, projectId, proposalId, changeSet);

      const blanket = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/apply`, { data: {} });
      await expectCode(blanket, 400, door.code, `a blanket apply that would auto-run ${door.op}`);
      expect(await proposalStatus(proposalId)).toBe('pending');

      const selected = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/apply`, { data: { opIndexes: [0] } });
      await expectStatus(selected, 200, `cherry-picking the content op beside ${door.op}`);
      expect(await proposalStatus(proposalId)).toBe('applied');
      expect(await readEntityRow(projectId, entityKey)).toBeDefined();
    }
  });

  test('should refuse selecting an action with no registered handler, before any content op writes', async ({ forge }) => {
    const owner = await forge.actor({ label: 'prop-unregistered' });
    const projectId = await newProject(owner, 'prop-unregistered');
    const entityKey = `e2e-prop-unreg-${uniqueSuffix()}`;
    // Raw-inserted and never `PATCH`ed: `validateChangeSet`'s "unknown op" check (which would normally catch an unrecognised op string)
    // never runs, so this reaches `proposal-apply.service.ts:281-283`'s own action-registry check instead.
    const proposalId = await insertPendingProposal({
      projectId,
      scopeType: 'novel',
      kind: 'hub',
      changeSet: [{ op: 'entity.upsert', entityKey, type: 'character', name: 'Should never be written' }, { op: 'action.e2e_unknown_action' }],
      baseline: { [`entity:${entityKey}`]: missingArtifactRef() },
    });

    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/apply`, { data: { opIndexes: [0, 1] } }),
      500,
      'RFN_008',
      'selecting an action the registry does not recognise',
    );
    expect(await readEntityRow(projectId, entityKey), 'the registry check runs before any selected content op is applied').toBeUndefined();
    expect(await proposalStatus(proposalId), 'the whole apply refused before any write, so the proposal is still pending').toBe('pending');
  });

  test('should refuse removing a canon fact with a ledgered reveal, then admit an edit that never removes it', async ({ forge }) => {
    const owner = await forge.actor({ label: 'prop-fact' });
    const projectId = await newProject(owner, 'prop-fact');
    const factKey = `e2e-prop-fact-${uniqueSuffix()}`;
    await insertLedgeredFact(projectId, factKey, `e2e-prop-fact-witness-${uniqueSuffix()}`);

    const removeChangeSet = [{ op: 'fact.remove', factKey }];
    const proposalId = await insertPendingProposal({ projectId, scopeType: 'novel', kind: 'hub', changeSet: removeChangeSet, baseline: {} });
    await rebaselineProposal(owner.ctx, projectId, proposalId, removeChangeSet);

    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/apply`, { data: {} }),
      400,
      'FCT_003',
      'removing a fact with a ledgered reveal',
    );
    expect(await proposalStatus(proposalId)).toBe('pending');

    // A change to the same fact that never removes it applies cleanly.
    const editChangeSet = [{ op: 'fact.upsert', factKey, constraintNote: 'Edited without ever retracting the ledgered reveal.' }];
    await rebaselineProposal(owner.ctx, projectId, proposalId, editChangeSet);
    const edited = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/apply`, { data: {} });
    await expectStatus(edited, 200, 'editing a ledgered fact without removing it');
    expect(await proposalStatus(proposalId)).toBe('applied');
  });

  test('should apply and revert a volume removal byte-identically', async ({ forge }) => {
    const owner = await forge.actor({ label: 'prop-volume' });
    const projectId = await newProject(owner, 'prop-volume');
    const volumeKey = `e2e-prop-volume-${uniqueSuffix()}`;
    await insertVolumeRow(projectId, volumeKey, 'The Quiet Coast');
    const original = await readVolumeRow(projectId, volumeKey);

    const changeSet = [{ op: 'volume.remove', volumeKey }];
    const proposalId = await insertPendingProposal({ projectId, scopeType: 'novel', kind: 'hub', changeSet, baseline: {} });
    await rebaselineProposal(owner.ctx, projectId, proposalId, changeSet);

    const applied = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/apply`, { data: {} });
    await expectStatus(applied, 200, 'removing a volume');
    expect(await proposalStatus(proposalId)).toBe('applied');
    await expectCode(await owner.ctx.get(`/api/v1/projects/${projectId}/volumes/${volumeKey}`), 404, 'VOL_001', 'reading a removed volume');

    const reverted = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/revert`);
    await expectStatus(reverted, 200, 'reverting the volume removal');
    expect(await proposalStatus(proposalId)).toBe('reverted');
    const restored = await readVolumeRow(projectId, volumeKey);
    // `state` is excluded from the byte-identical comparison on purpose: re-inserting the sole volume on revert runs through
    // the same `applyVolumeUpsert` path a fresh create would, which calls `autoActivateVolume` (`volume-stats.ts:84-98`) —
    // with no other volume active, it activates this one, `not_started` → `active`, exactly as creating it fresh would.
    expect({ ...restored, state: undefined }, 'the volume row comes back byte-identical in every content field').toEqual({ ...original, state: undefined });
    expect(restored?.state, 'reinserting the project’s only volume auto-activates it, same as a fresh create would').toBe('active');
  });

  test('should refuse reverting a proposal whose artifact was hand-edited since, and refuse reverting a still-pending proposal', async ({ forge }) => {
    const owner = await forge.actor({ label: 'prop-revert-guard' });
    const projectId = await newProject(owner, 'prop-revert-guard');

    const changeSetA = [{ op: 'premise.update', premise: 'A lighthouse keeper discovers the tide itself is listening.' }];
    const proposalA = await insertPendingProposal({ projectId, scopeType: 'novel', kind: 'hub', changeSet: changeSetA, baseline: {} });
    await rebaselineProposal(owner.ctx, projectId, proposalA, changeSetA);
    const appliedA = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalA}/apply`, { data: {} });
    await expectStatus(appliedA, 200, 'applying the first premise change');
    expect(await readProjectPremise(projectId)).toBe('A lighthouse keeper discovers the tide itself is listening.');

    const changeSetB = [{ op: 'premise.update', premise: 'A cartographer maps a district that is not on any chart.' }];
    const proposalB = await insertPendingProposal({ projectId, scopeType: 'novel', kind: 'hub', changeSet: changeSetB, baseline: {} });
    await rebaselineProposal(owner.ctx, projectId, proposalB, changeSetB);
    const appliedB = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalB}/apply`, { data: {} });
    await expectStatus(appliedB, 200, 'applying the second premise change over the first');
    expect(await readProjectPremise(projectId)).toBe('A cartographer maps a district that is not on any chart.');

    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalA}/revert`),
      409,
      'RFN_006',
      'reverting a proposal whose artifact changed again since it was applied',
    );

    const pendingOnly = await insertPendingProposal({ projectId, scopeType: 'novel', kind: 'hub', changeSet: [{ op: 'premise.update', premise: 'Never applied.' }], baseline: {} });
    await expectCode(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${pendingOnly}/revert`),
      400,
      'RFN_007',
      'reverting a proposal that was never applied',
    );
  });

  test('should list a still-pending proposal as a dependent of what a revert would undo', async ({ forge }) => {
    const owner = await forge.actor({ label: 'prop-undo-dependents' });
    const projectId = await newProject(owner, 'prop-undo-dependents');
    const entityKey = `e2e-prop-dependent-${uniqueSuffix()}`;

    const changeSetA = [{ op: 'entity.upsert', entityKey, type: 'character', name: 'Original name' }];
    const proposalA = await insertPendingProposal({ projectId, scopeType: 'novel', kind: 'hub', changeSet: changeSetA, baseline: {} });
    await rebaselineProposal(owner.ctx, projectId, proposalA, changeSetA);
    await expectStatus(
      await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalA}/apply`, { data: {} }),
      200,
      'creating the entity a later card will depend on',
    );

    // Proposal B stays pending, but re-baselining it names `entity:<key>` in its own baseline — exactly what `undo-impact` scans
    // other pending cards for.
    const changeSetB = [{ op: 'entity.upsert', entityKey, type: 'character', name: 'A rename proposed later' }];
    const proposalB = await insertPendingProposal({ projectId, scopeType: 'novel', kind: 'hub', changeSet: changeSetB, baseline: {} });
    await rebaselineProposal(owner.ctx, projectId, proposalB, changeSetB);

    const undoImpact = await owner.ctx.get(`/api/v1/projects/${projectId}/proposals/${proposalA}/undo-impact`);
    expect(undoImpact.status(), await undoImpact.text()).toBe(200);
    const body = (await undoImpact.json()) as UndoImpactResponse;
    expect(body.dependents).toEqual([{ kind: 'suggestion', ref: `proposal:${proposalB}`, chapter: null, because: `entity:${entityKey}`, final: false }]);
  });

  test('should list changes newest first with revertible flags, roll back newer proposals on request, and report a skipped action-only card', async ({ forge }) => {
    const owner = await forge.actor({ label: 'prop-rollback' });
    const projectId = await guardedProject(forge, owner, 'prop-rollback');
    const first = `e2e-prop-rollback-a-${uniqueSuffix()}`;
    const second = `e2e-prop-rollback-b-${uniqueSuffix()}`;
    const changeSetA = [{ op: 'entity.upsert', entityKey: first, type: 'character', name: 'First applied' }];
    const changeSetB = [{ op: 'entity.upsert', entityKey: second, type: 'character', name: 'Second applied' }];

    const proposalA = await insertPendingProposal({ projectId, scopeType: 'novel', kind: 'hub', changeSet: changeSetA, baseline: {} });
    await rebaselineProposal(owner.ctx, projectId, proposalA, changeSetA);
    await expectStatus(await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalA}/apply`, { data: {} }), 200, 'applying the first rollback candidate');
    expect(await proposalStatus(proposalA)).toBe('applied');

    const proposalB = await insertPendingProposal({ projectId, scopeType: 'novel', kind: 'hub', changeSet: changeSetB, baseline: {} });
    await rebaselineProposal(owner.ctx, projectId, proposalB, changeSetB);
    await expectStatus(await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalB}/apply`, { data: {} }), 200, 'applying the second rollback candidate');
    expect(await proposalStatus(proposalB)).toBe('applied');

    // An action-only card (no content ops, so no inverse ops) applied last — `action.validate` on a project with no finalized chapters
    // makes zero model calls (NF2-VAL-01), so the project's quota pin is never actually spent; it is guarded anyway per the spend rules.
    const changeSetC = [{ op: 'action.validate', scope: 'novel' }];
    const proposalC = await insertPendingProposal({ projectId, scopeType: 'novel', kind: 'hub', changeSet: changeSetC, baseline: {} });
    await rebaselineProposal(owner.ctx, projectId, proposalC, changeSetC);
    await assertSpendGuarded(projectId, { requireQuota: true });
    await expectStatus(await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalC}/apply`, { data: {} }), 200, 'applying the action-only card');
    expect(await proposalStatus(proposalC)).toBe('applied');

    const changes = await owner.ctx.get(`/api/v1/projects/${projectId}/changes`);
    expect(changes.status(), await changes.text()).toBe(200);
    const items = ((await changes.json()) as { items: ChangeItem[] }).items;
    const indexA = items.findIndex(item => item.id === proposalA);
    const indexB = items.findIndex(item => item.id === proposalB);
    const indexC = items.findIndex(item => item.id === proposalC);
    expect(indexC, 'the newest applied proposal sorts first').toBeLessThan(indexB);
    expect(indexB, 'and the second-newest sorts before the oldest').toBeLessThan(indexA);
    expect(items[indexA]?.revertible).toBe(true);
    expect(items[indexB]?.revertible).toBe(true);
    expect(items[indexC]?.revertible, 'an action-only card carries no inverse ops, so it is never revertible').toBe(false);

    const undoImpact = await owner.ctx.get(`/api/v1/projects/${projectId}/proposals/${proposalB}/undo-impact`);
    expect(undoImpact.status(), await undoImpact.text()).toBe(200);
    expect((await undoImpact.json()) as UndoImpactResponse).toMatchObject({ proposalId: proposalB, dependents: [] });

    await expectCode(await owner.ctx.get(`/api/v1/projects/${projectId}/proposals/${proposalB}/writer-preview`), 400, 'RFN_013', 'a writer preview of a non-chapter-plan proposal');

    const rollback = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/changes/rollback`, { data: { afterProposalId: proposalA } });
    expect(rollback.status(), await rollback.text()).toBe(200);
    const rollbackBody = (await rollback.json()) as { reverted: { proposalId: string }[]; skipped: string[] };
    expect(
      rollbackBody.reverted.map(item => item.proposalId),
      'the action-only card is skipped, not reverted',
    ).toEqual([proposalB]);
    expect(rollbackBody.skipped, 'reported as skipped, since it has nothing to invert').toEqual([proposalC]);
    expect(await readEntityRow(projectId, second), 'the newer entity was rolled back').toBeUndefined();
    expect(await readEntityRow(projectId, first), 'the older, kept proposal was left alone').toBeDefined();
  });
});

/**
 * Coverage this batch leaves out of NF2-PROP-01/02, for the record: `RFN_005` (brief at/behind the story-cursor frontier — needs a
 * finalized chapter to move the cursor, pulling in Batch 5's finalize machinery); `RFN_010` via an actually-final draft specifically
 * (the isolated-chapter test above exercises the same `applyDraftUpdate` guard clause via `RFN_012` instead); the
 * `premise.update`-boilerplate-stores-only-the-additions behavior; `VOL_002` (volume removal while a plan still names it, via
 * `brief.update.volumeKey`); `RFN_004` triggered specifically on a malformed field value at PATCH time (only reached indirectly above,
 * via the organise/bible_audit-kind refusals); "`rationale` never reaches the applied artifact or `inverseOps`" (not independently
 * asserted); strict `GET /proposals` list-filter combinations beyond status/kind/chapter singly. The full "applies and reverts
 * byte-identically" op matrix covers entity, volume and premise; bible_doc/brief/draft/fact/milestone/promise are exercised as
 * individual refusal or apply-only cases rather than a full apply+revert round trip each, and fact revert including a restored
 * `writerNote` specifically is not separately checked. `RFN_007` on an action-only (never-content) applied proposal's own revert
 * attempt is not separately covered (only the never-applied and hand-edited-since paths are). A successful `writer-preview` response
 * (a pending `chapter_plan` card with a `brief.update` op) is not covered — every proposal in this file is `kind: 'hub'`.
 */
test('should answer 200 with the applied proposal on a successful apply', async ({ forge }) => {
  const owner = await forge.actor({ label: 'prop-apply-status' });
  const projectId = await guardedProject(forge, owner, 'prop-apply-status');
  const entityKey = `e2e-prop-status-${uniqueSuffix()}`;
  const changeSet = [{ op: 'entity.upsert', entityKey, type: 'character', name: 'Status Entity' }];
  const proposalId = await insertPendingProposal({ projectId, scopeType: 'novel', kind: 'hub', changeSet, baseline: {} });
  await rebaselineProposal(owner.ctx, projectId, proposalId, changeSet);

  const applied = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/proposals/${proposalId}/apply`, { data: {} });
  expect(applied.status(), await applied.text()).toBe(200);
  const body = (await applied.json()) as ApplyResponseBody;
  expect(body.proposal.status).toBe('applied');
});
