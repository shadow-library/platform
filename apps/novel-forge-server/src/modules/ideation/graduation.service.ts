import { and, desc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Ideation, type PrimaryDatabase, type PrimaryTransaction, type Project, schema } from '@server/database';

import { BibleDocumentService } from '../bible/document/bible-document.service';
import { ChatService } from '../refinement/chat.service';
import {
  promiseConstraintNote,
  promiseFactKey,
  provenanceSummary,
  type ProvenanceSummary,
  renderInstructions,
  renderPremiseDoc,
  renderReaderPromiseDoc,
} from './graduation-render';

export interface GraduateInput {
  title: string;
}

export interface GraduatedProject {
  id: bigint;
  name: string;
  title: string | null;
  status: Project.Status;
  premise: string | null;
  themes: string[] | null;
  instructions: string | null;
}

export interface GraduationResult {
  project: GraduatedProject;
  provenance: ProvenanceSummary;
  /** `section/slug` of the bible documents graduation wrote — the entire handoff into refinement. */
  documents: string[];
  factKeys: string[];
}

const PREMISE_DOC = { section: 'project', slug: 'premise' } as const;
const READER_PROMISE_DOC = { section: 'project', slug: 'reader-promise' } as const;

@Injectable()
export class GraduationService {
  private readonly logger = Logger.getLogger(APP_NAME, GraduationService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly bibleDocuments: BibleDocumentService,
    private readonly chatService: ChatService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /**
   * A studio turn in flight is about to write a reply, a proposal, and a sheet edit against a sheet this
   * transaction deletes (IDE_006). The gate and the graduation are not one act: a turn that clears
   * `hasPendingTurn` a moment before the seed lock is taken still lands its user message on the
   * conversation graduation archives. The seed lock keeps the sheet itself consistent — the orphan
   * message is accepted residue, not a corruption.
   */
  private async assertNoTurnInFlight(projectId: bigint): Promise<void> {
    const session = await this.db.query.chatSessions.findFirst({
      where: and(eq(schema.chatSessions.projectId, projectId), eq(schema.chatSessions.scopeType, 'ideation'), eq(schema.chatSessions.status, 'active')),
      columns: { id: true },
      orderBy: [desc(schema.chatSessions.createdAt), desc(schema.chatSessions.id)],
    });
    if (session && (await this.chatService.hasPendingTurn(projectId, session.id))) throw AppErrorCode.IDE_006.create();
  }

  /**
   * Turns a seed into a novel (ideation-studio design §5): deterministic, zero AI, one transaction. The
   * sheet becomes the project row, two real bible documents, and one canon fact per named betrayal —
   * then the sheet is deleted and the studio conversation archived, because a seed kept alive next to
   * the documents refinement now edits is a second, diverging copy of the truth. No volumes and no
   * entities are created: that is lore-bible-refinement work, even when the sheet sketches it.
   */
  async graduate(projectId: bigint, input: GraduateInput): Promise<GraduationResult> {
    const title = input.title.trim();
    await this.assertNoTurnInFlight(projectId);

    return this.db.transaction(async tx => {
      const project = await tx.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
      if (!project) throw AppErrorCode.PRJ_001.create();
      if (project.status !== 'seed') throw AppErrorCode.IDE_001.create();
      if (!title) throw AppErrorCode.IDE_002.create();

      const seed = await this.lockSeed(tx, projectId);
      const fields = seed.fields ?? {};
      // Readiness advises and never blocks — a premise and a title are the only things graduation
      // cannot render the handoff without.
      if (!fields.premise?.trim()) throw AppErrorCode.IDE_008.create();

      const [graduated] = await tx
        .update(schema.projects)
        .set({
          status: 'active',
          name: title,
          title,
          premise: fields.premise,
          themes: fields.themes ?? project.themes,
          instructions: renderInstructions(project.instructions, fields.voice),
          updatedAt: new Date(),
        })
        .where(eq(schema.projects.id, projectId))
        .returning()
        .catch(err => this.databaseService.translateError(err));
      if (!graduated) throw AppErrorCode.PRJ_001.create();

      const premise = await this.bibleDocuments.upsert(projectId, PREMISE_DOC.section, PREMISE_DOC.slug, { body: renderPremiseDoc(fields) }, tx);
      const readerPromise = await this.bibleDocuments.upsert(projectId, READER_PROMISE_DOC.section, READER_PROMISE_DOC.slug, { body: renderReaderPromiseDoc(seed) }, tx);
      const documents = [premise, readerPromise].map(document => `${document.section}/${document.slug}`);

      const factKeys = await this.writePromiseFacts(tx, projectId, seed.constraints ?? []);
      const provenance = provenanceSummary(seed);

      await tx.delete(schema.storySeeds).where(eq(schema.storySeeds.id, seed.id));
      await tx
        .update(schema.chatSessions)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(and(eq(schema.chatSessions.projectId, projectId), eq(schema.chatSessions.scopeType, 'ideation')));

      this.logger.info('seed graduated', { projectId, title, factKeys, provenance: { author: provenance.author, studio: provenance.studio, crossed: provenance.crossed } });
      return {
        project: {
          id: graduated.id,
          name: graduated.name,
          title: graduated.title,
          status: graduated.status,
          premise: graduated.premise,
          themes: (graduated.themes as string[] | null) ?? null,
          instructions: graduated.instructions,
        },
        provenance,
        documents,
        factKeys,
      };
    });
  }

  /**
   * The named betrayals, and nothing else. These few rules are part of the core idea and must never be
   * paraphrased away by the planner, so they ride `canon_facts` — with `source: 'seed'` and a null
   * reveal. No POV cast ever learns them, so a chapter's knowledge view files them as hidden: they reach
   * the drafter as behavioral constraints, and `source: 'seed'` is what keeps them out of the judge's
   * forbidden list, where a rule the book obeys would read as a spoiler the draft leaked. Every other
   * studio decision travels as prose in the reader-promise document.
   */
  private async writePromiseFacts(tx: PrimaryTransaction, projectId: bigint, constraints: Ideation.SeedConstraint[]): Promise<string[]> {
    const promises = new Map<string, Ideation.SeedConstraint>();
    constraints.forEach((constraint, index) => {
      if (constraint.kind === 'promise') promises.set(promiseFactKey(constraint, index), constraint);
    });
    if (promises.size === 0) return [];

    const rows = [...promises].map(([factKey, constraint]) => ({
      projectId,
      factKey,
      text: constraint.text,
      constraintNote: promiseConstraintNote(constraint.text),
      revealChapter: null,
      source: 'seed' as const,
    }));
    await tx
      .insert(schema.canonFacts)
      .values(rows)
      .catch(err => this.databaseService.translateError(err));
    return rows.map(row => row.factKey);
  }

  /** The sheet row is the graduation lock: a second graduation waits here and then finds it deleted (IDE_001). */
  private async lockSeed(tx: PrimaryTransaction, projectId: bigint): Promise<Ideation.StorySeed> {
    const [seed] = await tx.select().from(schema.storySeeds).where(eq(schema.storySeeds.projectId, projectId)).for('update');
    if (!seed) throw AppErrorCode.IDE_001.create();
    return seed;
  }
}
