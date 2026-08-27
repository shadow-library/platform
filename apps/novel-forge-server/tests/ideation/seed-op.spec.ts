import { SQL } from 'bun';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { ActionExecutorRegistry, type ChangeOp, loadArtifactStates, ProposalApplyService, ProposalService, validateChangeSet } from '@modules/refinement';
import { seedContentHash } from '@server/common';
import { type Ideation, type PrimaryDatabase, type Refinement, schema } from '@server/database';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_seed_op`;

const pgAvailable = await (async () => {
  try {
    const sql = new SQL(baseConnectionString);
    await sql`SELECT 1`;
    await sql.close();
    return true;
  } catch {
    return false;
  }
})();

const ANCHORS: Ideation.TasteAnchors = { comps: ['Blame!'], preferences: ['cold worlds'] };
const CONSTRAINT: Ideation.SeedConstraint = { key: 'no-harem', kind: 'promise', text: 'one romance only', lockedBy: 'author' };
const CARD: Ideation.ConceptCard = { id: 'r1c0', round: 1, title: 'Salvage Rites', logline: 'a salvager', engine: 'debt', ladder: 'depth', posture: 'grim', fate: 'kept' };

describe.if(pgAvailable)('seed.update op', () => {
  let db: PrimaryDatabase;
  let proposals: ProposalService;
  let applier: ProposalApplyService;
  let projectId: bigint;

  const databaseService = () => ({ getPostgresClient: () => db }) as never;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    proposals = new ProposalService(databaseService());
    applier = new ProposalApplyService(databaseService(), new ActionExecutorRegistry());

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `seed-op-${Date.now()}`, kind: 'new_novel', status: 'seed' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    projectId = project.id;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  beforeEach(async () => {
    await db.delete(schema.storySeeds).where(eq(schema.storySeeds.projectId, projectId));
    await db.insert(schema.storySeeds).values({
      projectId,
      fields: { genre: 'science fiction', premise: 'a salvager' },
      provenance: { genre: { source: 'author', turnOrdinal: 1 } },
      constraints: [CONSTRAINT],
      tasteAnchors: ANCHORS,
      concepts: [CARD],
      contentHash: seedContentHash({ genre: 'science fiction', premise: 'a salvager' }),
    });
  });

  function currentSeed(): Promise<Ideation.StorySeed | undefined> {
    return db.query.storySeeds.findFirst({ where: eq(schema.storySeeds.projectId, projectId) });
  }

  function createProposal(changeSet: ChangeOp[]): Promise<Refinement.Proposal> {
    return proposals.create(projectId, { scopeType: 'ideation', kind: 'ideation', changeSet });
  }

  describe('artifact state', () => {
    it('should resolve the seed ref from the sheet row', async () => {
      const seed = await currentSeed();

      expect(await loadArtifactStates(db, projectId, ['seed'])).toEqual({ seed: { exists: true, revision: 1, contentHash: seed?.contentHash ?? null } });
    });

    it('should resolve a missing sheet to a missing artifact', async () => {
      await db.delete(schema.storySeeds).where(eq(schema.storySeeds.projectId, projectId));

      expect(await loadArtifactStates(db, projectId, ['seed'])).toEqual({ seed: { exists: false, revision: null, contentHash: null } });
    });
  });

  describe('grammar', () => {
    it('should accept a partial sheet edit', () => {
      expect(validateChangeSet([{ op: 'seed.update', fields: { hook: 'the ships remember' } }])).toEqual([]);
    });

    it('should require at least one column', () => {
      expect(validateChangeSet([{ op: 'seed.update' }])[0]).toContain('at least one of');
    });

    it('should reject an unknown sheet field', () => {
      expect(validateChangeSet([{ op: 'seed.update', fields: { chapterOne: 'no' } }])[0]).toContain("unknown sheet field 'fields.chapterOne'");
    });

    it('should reject a non-string sheet value', () => {
      expect(validateChangeSet([{ op: 'seed.update', fields: { hook: 3 } }])[0]).toContain('fields.hook must be a non-empty string');
    });

    it('should accept a null sheet value as a clear', () => {
      expect(validateChangeSet([{ op: 'seed.update', fields: { hook: null } }])).toEqual([]);
    });

    it('should accept an array only for themes', () => {
      expect(validateChangeSet([{ op: 'seed.update', fields: { themes: ['grief'] } }])).toEqual([]);
      expect(validateChangeSet([{ op: 'seed.update', fields: { hook: ['grief'] } }])).toHaveLength(1);
    });

    it('should reject a whitespace-only sheet value', () => {
      expect(validateChangeSet([{ op: 'seed.update', fields: { hook: '   ' } }])[0]).toContain('fields.hook must be a non-empty string');
    });

    it('should reject an empty themes entry', () => {
      expect(validateChangeSet([{ op: 'seed.update', fields: { themes: [''] } }])[0]).toContain('fields.themes must be an array of non-empty strings');
    });

    it('should reject a whitespace-only themes entry', () => {
      expect(validateChangeSet([{ op: 'seed.update', fields: { themes: ['grief', ' '] } }])[0]).toContain('fields.themes must be an array of non-empty strings');
    });

    it('should accept an empty themes list as a cleared list', () => {
      expect(validateChangeSet([{ op: 'seed.update', fields: { themes: [] } }])).toEqual([]);
    });

    it('should reject a malformed provenance entry', () => {
      const errors = validateChangeSet([{ op: 'seed.update', provenance: { hook: { source: 'nobody', turnOrdinal: 'two' } } }]);
      expect(errors).toHaveLength(2);
      expect(errors[0]).toContain('provenance.hook.source');
      expect(errors[1]).toContain('provenance.hook.turnOrdinal');
    });

    it('should reject a constraint with an unknown kind', () => {
      expect(validateChangeSet([{ op: 'seed.update', constraints: [{ ...CONSTRAINT, kind: 'vibe' }] }])[0]).toContain('kind must be one of');
    });

    it('should accept a card still sitting at offered', () => {
      // The column replaces wholesale, so every turn after the diverge round re-sends the cards the
      // author has not judged — and taking a verdict back to 'offered' is theirs to do.
      expect(validateChangeSet([{ op: 'seed.update', concepts: [{ ...CARD, fate: 'offered' }] }])).toEqual([]);
      expect(validateChangeSet([{ op: 'seed.update', concepts: [{ ...CARD, id: undefined }] }])).toEqual([]);
      expect(validateChangeSet([{ op: 'seed.update', concepts: [{ ...CARD, id: '' }] }])[0]).toContain('id must be a non-empty string');
    });

    it('should reject a concept card with an unknown fate', () => {
      expect(validateChangeSet([{ op: 'seed.update', concepts: [{ ...CARD, fate: 'maybe' }] }])[0]).toContain('fate must be one of');
    });

    it('should reject taste anchors that are not string arrays', () => {
      expect(validateChangeSet([{ op: 'seed.update', tasteAnchors: { comps: 'Blame!', preferences: [] } }])[0]).toContain('tasteAnchors.comps');
    });

    it('should reject collections that are not arrays of objects', () => {
      expect(validateChangeSet([{ op: 'seed.update', concepts: ['a card'] }])[0]).toContain("invalid field 'concepts'");
    });

    it('should reject a bare string for the themes array', () => {
      const errors = validateChangeSet([{ op: 'seed.update', fields: { themes: 'grief' } }]);
      expect(errors[0]).toContain('fields.themes must be an array of non-empty strings or null');
    });

    it('should reject an empty string sheet value', () => {
      expect(validateChangeSet([{ op: 'seed.update', fields: { hook: '' } }])[0]).toContain('fields.hook must be a non-empty string or null');
    });

    it('should reject an empty fields object as a no-op', () => {
      expect(validateChangeSet([{ op: 'seed.update', fields: {} }])[0]).toContain('fields must not be empty when provided');
    });

    it('should reject an empty provenance object as a no-op', () => {
      expect(validateChangeSet([{ op: 'seed.update', provenance: {} }])[0]).toContain('provenance must not be empty when provided');
    });

    it('should still accept an empty constraints/concepts array as a wholesale clear', () => {
      expect(validateChangeSet([{ op: 'seed.update', constraints: [], concepts: [] }])).toEqual([]);
    });

    it('should keep seed.update out of the hub vocabulary', () => {
      expect(validateChangeSet([{ op: 'seed.update', fields: { hook: 'x' } }], ['premise.update'])[0]).toContain('is not allowed for this scope');
    });
  });

  describe('merge semantics', () => {
    it('should merge fields per key and leave the untouched ones alone', async () => {
      const proposal = await createProposal([{ op: 'seed.update', fields: { hook: 'the ships remember' } }]);
      await applier.apply(projectId, proposal.id);

      expect((await currentSeed())?.fields).toEqual({ genre: 'science fiction', premise: 'a salvager', hook: 'the ships remember' });
    });

    it('should replace a field that is already set', async () => {
      const proposal = await createProposal([{ op: 'seed.update', fields: { premise: 'a salvager who hears dead ships' } }]);
      await applier.apply(projectId, proposal.id);

      expect((await currentSeed())?.fields).toEqual({ genre: 'science fiction', premise: 'a salvager who hears dead ships' });
    });

    it('should clear a field sent as null', async () => {
      const proposal = await createProposal([{ op: 'seed.update', fields: { genre: null } }]);
      await applier.apply(projectId, proposal.id);

      expect((await currentSeed())?.fields).toEqual({ premise: 'a salvager' });
    });

    it('should merge provenance per key', async () => {
      const proposal = await createProposal([{ op: 'seed.update', provenance: { premise: { source: 'studio' } } }]);
      await applier.apply(projectId, proposal.id);

      // The turn ordinal is the server's to record: this proposal hangs off no chat message, so there is none.
      expect((await currentSeed())?.provenance).toEqual({ genre: { source: 'author', turnOrdinal: 1 }, premise: { source: 'studio', turnOrdinal: null } });
    });

    it('should record an unattributed field as the studio’s own', async () => {
      const proposal = await createProposal([{ op: 'seed.update', fields: { hook: 'the ships remember', stakes: null } }]);
      await applier.apply(projectId, proposal.id);

      const provenance = (await currentSeed())?.provenance;
      expect(provenance?.hook).toEqual({ source: 'studio', turnOrdinal: null });
      // A cleared field is not a written one, so nothing is stamped for it.
      expect(provenance?.stakes).toBeUndefined();
    });

    it('should keep the author as the source when the turn named them, and stamp the real turn ordinal', async () => {
      const [session] = await db.insert(schema.chatSessions).values({ projectId, scopeType: 'ideation', mode: 'auto' }).returning();
      const [message] = await db
        .insert(schema.chatMessages)
        .values({ sessionId: session?.id as string, projectId, ordinal: 4, role: 'assistant', content: 'heard' })
        .returning();
      const proposal = await proposals.create(projectId, {
        sessionId: session?.id,
        messageId: message?.id,
        scopeType: 'ideation',
        kind: 'ideation',
        changeSet: [{ op: 'seed.update', fields: { hook: 'the ships remember', voice: 'dry and close' }, provenance: { hook: { source: 'author', turnOrdinal: 99 } } }],
      });

      await applier.apply(projectId, proposal.id);

      const provenance = (await currentSeed())?.provenance;
      expect(provenance?.hook).toEqual({ source: 'author', turnOrdinal: 4 });
      expect(provenance?.voice).toEqual({ source: 'studio', turnOrdinal: 4 });
    });

    it('should replace the collection columns wholesale', async () => {
      const replacement: Ideation.SeedConstraint = { key: 'dual-leads', kind: 'shape', text: 'two bonded leads', lockedBy: 'inferred' };
      const proposal = await createProposal([{ op: 'seed.update', constraints: [replacement], concepts: [], tasteAnchors: { comps: [], preferences: ['warm worlds'] } }]);
      await applier.apply(projectId, proposal.id);

      const seed = await currentSeed();
      expect(seed?.constraints).toEqual([replacement]);
      expect(seed?.concepts).toEqual([]);
      expect(seed?.tasteAnchors).toEqual({ comps: [], preferences: ['warm worlds'] });
    });

    it('should preserve a re-sent card’s id and stamp a fresh one on anything unrecognised', async () => {
      const { id: _dropped, ...idless } = CARD;
      const proposal = await createProposal([
        {
          op: 'seed.update',
          concepts: [
            { ...CARD, fate: 'killed', reason: 'too cold' },
            { ...idless, title: 'New Tide' },
            { ...idless, id: 'r9c9', title: 'Unknown Id' },
          ],
        },
      ]);
      await applier.apply(projectId, proposal.id);

      const concepts = (await currentSeed())?.concepts ?? [];
      expect(concepts[0]).toMatchObject({ id: CARD.id, title: CARD.title, fate: 'killed', reason: 'too cold' });
      expect(concepts.map(card => card.id).filter(Boolean)).toHaveLength(3);
      expect(new Set(concepts.map(card => card.id)).size).toBe(3);
      expect(concepts[1]?.id).toBeString();
      // An id the sheet has never seen is a new card and keeps the identity it arrived with: re-minting it
      // here would also re-mint the ids an inverse op restores, which reverts must reproduce exactly.
      expect(concepts[2]?.id).toBe('r9c9');
    });

    it('should leave the collection columns alone when the op omits them', async () => {
      const proposal = await createProposal([{ op: 'seed.update', fields: { hook: 'the ships remember' } }]);
      await applier.apply(projectId, proposal.id);

      const seed = await currentSeed();
      expect(seed?.constraints).toEqual([CONSTRAINT]);
      expect(seed?.concepts).toEqual([CARD]);
      expect(seed?.tasteAnchors).toEqual(ANCHORS);
    });

    it('should bump the revision and rehash over fields alone', async () => {
      const proposal = await createProposal([{ op: 'seed.update', fields: { hook: 'the ships remember' }, concepts: [] }]);
      const result = await applier.apply(projectId, proposal.id);

      expect(result.applied).toEqual([{ artifactRef: 'seed', newRevision: 2 }]);
      const seed = await currentSeed();
      expect(seed?.revision).toBe(2);
      expect(seed?.contentHash).toBe(seedContentHash({ genre: 'science fiction', premise: 'a salvager', hook: 'the ships remember' }));
    });

    it('should propagate no staleness — nothing is planned on top of a seed', async () => {
      const proposal = await createProposal([{ op: 'seed.update', fields: { hook: 'the ships remember' } }]);

      expect((await applier.apply(projectId, proposal.id)).staleMarked).toEqual([]);
    });

    it('should refuse to edit a sheet that does not exist', async () => {
      const proposal = await createProposal([{ op: 'seed.update', fields: { hook: 'the ships remember' } }]);
      await db.delete(schema.storySeeds).where(eq(schema.storySeeds.projectId, projectId));

      // The missing sheet fails the baseline check before the applier ever runs.
      expect(
        await applier.apply(projectId, proposal.id).then(
          () => null,
          (e: { code?: string }) => e.code,
        ),
      ).toBe('RFN_003');
    });
  });

  describe('revert', () => {
    it('should restore the exact prior sheet after a mixed edit', async () => {
      const before = await currentSeed();
      const proposal = await createProposal([
        {
          op: 'seed.update',
          fields: { premise: 'a salvager who hears dead ships', hook: 'the ships remember', genre: null },
          provenance: { hook: { source: 'studio', turnOrdinal: 4 } },
          constraints: [],
          concepts: [],
          tasteAnchors: { comps: [], preferences: [] },
        },
      ]);

      await applier.apply(projectId, proposal.id);
      const applied = await currentSeed();
      expect(applied?.fields).toEqual({ premise: 'a salvager who hears dead ships', hook: 'the ships remember' });

      const reverted = await applier.revert(projectId, proposal.id);
      expect(reverted.reverted).toEqual([{ artifactRef: 'seed', newRevision: 3 }]);

      const after = await currentSeed();
      expect(after?.fields).toEqual(before?.fields as Ideation.SeedFields);
      expect(after?.provenance).toEqual(before?.provenance as Ideation.SeedProvenance);
      expect(after?.constraints).toEqual([CONSTRAINT]);
      expect(after?.concepts).toEqual([CARD]);
      expect(after?.tasteAnchors).toEqual(ANCHORS);
      expect(after?.contentHash).toBe(before?.contentHash ?? null);
      expect(after?.revision).toBe(3);
    });

    it('should remove a field the op introduced rather than leave it behind', async () => {
      const proposal = await createProposal([{ op: 'seed.update', fields: { voice: 'dry and close' } }]);
      await applier.apply(projectId, proposal.id);
      await applier.revert(projectId, proposal.id);

      expect((await currentSeed())?.fields).toEqual({ genre: 'science fiction', premise: 'a salvager' });
    });

    it('should capture an inverse for exactly the touched columns', async () => {
      const proposal = await createProposal([{ op: 'seed.update', fields: { hook: 'the ships remember' }, concepts: [] }]);
      await applier.apply(projectId, proposal.id);

      const applied = await db.query.refinementProposals.findFirst({ where: eq(schema.refinementProposals.id, proposal.id) });
      // The provenance the applier stamped for the written field is inverted with it, or a revert would
      // leave a source behind for a field that no longer exists.
      expect(applied?.inverseOps).toEqual([{ op: 'seed.update', fields: { hook: null }, provenance: { hook: null }, concepts: [CARD] }]);
    });

    it('should refuse a revert once the sheet moved on', async () => {
      const proposal = await createProposal([{ op: 'seed.update', fields: { hook: 'the ships remember' } }]);
      await applier.apply(projectId, proposal.id);
      const later = await createProposal([{ op: 'seed.update', fields: { voice: 'dry and close' } }]);
      await applier.apply(projectId, later.id);

      expect(
        await applier.revert(projectId, proposal.id).then(
          () => null,
          (e: { code?: string }) => e.code,
        ),
      ).toBe('RFN_006');
    });
  });
});
