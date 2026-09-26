import { isDeepStrictEqual } from 'node:util';

import { and, desc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Ai, type Generation, type PrimaryDatabase, type PrimaryTransaction, schema } from '@server/database';

import { asRetryableSave, assertDraftBase, baseOfDraft, type DraftBase, lockDraft, saveHandWrittenDraft } from './draft-save';
import { type DiffHunk, diffProse } from './prose-diff';

export interface DraftVersion {
  revision: number;
  /** Null for the draft's current text when no history row was written for it. */
  source: Ai.DraftRevisionSource | null;
  restoredFrom: number | null;
  current: boolean;
  approved: boolean;
  isolated: boolean;
  createdAt: Date;
}

export interface VersionComparison {
  from: number;
  to: number;
  hunks: DiffHunk[];
  wordsAdded: number;
  wordsRemoved: number;
}

@Injectable()
export class DraftVersionService {
  private readonly logger = Logger.getLogger(APP_NAME, DraftVersionService.name);
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async list(projectId: bigint, chapter: number): Promise<DraftVersion[]> {
    const draft = await this.findDraft(projectId, chapter);
    const rows = await this.db.query.draftRevisions.findMany({
      where: eq(schema.draftRevisions.draftId, draft.id),
      columns: { revision: true, source: true, restoredFrom: true, isolated: true, createdAt: true },
      orderBy: desc(schema.draftRevisions.revision),
    });
    const versions = rows.map(row => ({
      revision: row.revision,
      source: row.source,
      restoredFrom: row.restoredFrom,
      current: row.revision === draft.revision,
      approved: row.revision === draft.approvedRevision,
      isolated: row.isolated,
      createdAt: row.createdAt,
    }));
    if (versions.some(version => version.current)) return versions;
    const current = { revision: draft.revision, source: null, restoredFrom: null, current: true, approved: draft.revision === draft.approvedRevision, isolated: draft.isolated };
    return [{ ...current, createdAt: draft.updatedAt }, ...versions];
  }

  /** An author read, like `GET /drafts/:n`: an isolated version's prose is compared as it stands. */
  async compare(projectId: bigint, chapter: number, from: number, to: number): Promise<VersionComparison> {
    const draft = await this.findDraft(projectId, chapter);
    const [before, after] = await Promise.all([this.versionBody(draft, from), this.versionBody(draft, to)]);
    return { from, to, ...diffProse(before, after) };
  }

  /**
   * Restoring writes the old text as a new revision through the hand-save path, so it resets approval and marks later drafts stale exactly as an
   * edit does — restoring the approved revision still needs approving again. A version recorded before titles or state were kept restores the prose
   * and leaves the current title and state; restoring text identical to the draft changes nothing.
   */
  async restore(projectId: bigint, chapter: number, revision: number, base: DraftBase | undefined): Promise<Generation.Draft> {
    const restored = await this.db
      .transaction(async tx => {
        const current = await lockDraft(tx, projectId, chapter);
        if (current.status === 'final') throw AppErrorCode.VER_002.create({ chapter: String(chapter) });
        assertDraftBase(current, base);
        const target = await tx.query.draftRevisions.findFirst({
          where: and(eq(schema.draftRevisions.draftId, current.id), eq(schema.draftRevisions.revision, revision)),
        });
        if (!target) throw AppErrorCode.VER_001.create({ chapter: String(chapter), revision: String(revision) });
        const fields = { title: target.title ?? current.title, body: target.body, summary: target.summary, state: target.state ?? current.state };
        if (Object.entries(fields).every(([field, value]) => isDeepStrictEqual(current[field as keyof typeof fields], value))) return current;
        await recordCurrentText(tx, current);
        return saveHandWrittenDraft(tx, {
          projectId,
          chapter,
          source: 'restored',
          restoredFrom: revision,
          base: baseOfDraft(current),
          fields: { ...fields, isolated: current.isolated || target.isolated },
        });
      })
      .catch(asRetryableSave);
    this.logger.info('draft version restored', { projectId, chapter, restoredFrom: revision, revision: restored.revision });
    return restored;
  }

  private async findDraft(projectId: bigint, chapter: number): Promise<Generation.Draft> {
    const draft = await this.db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)) });
    if (!draft) throw AppErrorCode.DRF_001.create();
    return draft;
  }

  private async versionBody(draft: Generation.Draft, revision: number): Promise<string> {
    const row = await this.db.query.draftRevisions.findFirst({
      where: and(eq(schema.draftRevisions.draftId, draft.id), eq(schema.draftRevisions.revision, revision)),
      columns: { body: true },
    });
    if (row) return row.body;
    if (revision === draft.revision) return draft.body;
    throw AppErrorCode.VER_001.create({ chapter: String(draft.chapter), revision: String(revision) });
  }
}

/** Some writes (an unrestricted fill before history was kept) left the current text without a history row; a restore records it first so it is never lost. */
async function recordCurrentText(tx: PrimaryTransaction, draft: Generation.Draft): Promise<void> {
  await tx
    .insert(schema.draftRevisions)
    .values({
      projectId: draft.projectId,
      draftId: draft.id,
      revision: draft.revision,
      source: draft.generator === 'human' ? 'imported' : 'generated',
      title: draft.title,
      body: draft.body,
      summary: draft.summary,
      state: draft.state,
      isolated: draft.isolated,
    })
    .onConflictDoNothing();
}
