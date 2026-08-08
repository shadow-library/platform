import { and, asc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Knowledge, type PrimaryDatabase, schema } from '@server/database';

import { type RevealFactBody, type UpsertFactBody } from './fact.dto';

export interface KnowledgeEntry {
  entityKey: string;
  entityName: string;
  learnedInChapter: number;
  source: Knowledge.FactSource;
  note: string | null;
  createdAt: Date;
}

export interface FactWithKnowledge extends Knowledge.CanonFact {
  knowledge: KnowledgeEntry[];
}

type FactRowWithLedger = Knowledge.CanonFact & { knowledge: (Knowledge.CharacterKnowledge & { entity: { entityKey: string; name: string } })[] };

const LEDGER_RELATION = { knowledge: { with: { entity: { columns: { entityKey: true, name: true } } } } } as const;

@Injectable()
export class FactService {
  private readonly logger = Logger.getLogger(APP_NAME, FactService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async list(projectId: bigint): Promise<FactWithKnowledge[]> {
    const facts = await this.db.query.canonFacts.findMany({ where: eq(schema.canonFacts.projectId, projectId), orderBy: asc(schema.canonFacts.factKey), with: LEDGER_RELATION });
    return facts.map(fact => this.toFactWithKnowledge(fact as FactRowWithLedger));
  }

  async get(projectId: bigint, factKey: string): Promise<FactWithKnowledge> {
    const fact = await this.db.query.canonFacts.findFirst({
      where: and(eq(schema.canonFacts.projectId, projectId), eq(schema.canonFacts.factKey, factKey)),
      with: LEDGER_RELATION,
    });
    if (!fact) throw AppErrorCode.FCT_001.create();
    return this.toFactWithKnowledge(fact as FactRowWithLedger);
  }

  /** Hand-authoring upsert: creates the fact or edits it in place, merging omitted optional fields. */
  async upsert(projectId: bigint, factKey: string, body: UpsertFactBody): Promise<FactWithKnowledge> {
    const existing = await this.db.query.canonFacts.findFirst({ where: and(eq(schema.canonFacts.projectId, projectId), eq(schema.canonFacts.factKey, factKey)) });
    const merged = {
      text: body.text,
      subjects: (body.subjects ?? existing?.subjects ?? null) as never,
      constraintNote: body.constraintNote ?? existing?.constraintNote ?? null,
      terms: (body.terms ?? existing?.terms ?? null) as never,
      revealChapter: body.revealChapter ?? existing?.revealChapter ?? null,
    };

    if (existing) {
      await this.db
        .update(schema.canonFacts)
        .set({ ...merged, updatedAt: new Date() })
        .where(eq(schema.canonFacts.id, existing.id))
        .catch(err => this.databaseService.translateError(err));
    } else {
      await this.db
        .insert(schema.canonFacts)
        .values({ projectId, factKey, ...merged })
        .catch(err => this.databaseService.translateError(err));
    }

    return this.get(projectId, factKey);
  }

  async delete(projectId: bigint, factKey: string): Promise<void> {
    const deleted = await this.db
      .delete(schema.canonFacts)
      .where(and(eq(schema.canonFacts.projectId, projectId), eq(schema.canonFacts.factKey, factKey)))
      .returning();
    if (deleted.length === 0) throw AppErrorCode.FCT_001.create();
  }

  /**
   * Adds (or corrects) a ledger row by hand. Re-revealing updates the chapter and note instead of
   * duplicating — the manual endpoint doubles as the correction path for skipped brief reveals.
   */
  async reveal(projectId: bigint, factKey: string, body: RevealFactBody): Promise<FactWithKnowledge> {
    const [fact, entity] = await Promise.all([
      this.db.query.canonFacts.findFirst({ where: and(eq(schema.canonFacts.projectId, projectId), eq(schema.canonFacts.factKey, factKey)) }),
      this.db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, body.entityKey)) }),
    ]);
    if (!fact) throw AppErrorCode.FCT_001.create();
    if (!entity) throw AppErrorCode.FCT_002.create();

    await this.db
      .insert(schema.characterKnowledge)
      .values({ projectId, factId: fact.id, entityId: entity.id, learnedInChapter: body.chapter, source: 'manual', note: body.note ?? null })
      .onConflictDoUpdate({
        target: [schema.characterKnowledge.factId, schema.characterKnowledge.entityId],
        set: { learnedInChapter: body.chapter, source: 'manual', note: body.note ?? null },
      });

    this.logger.info('fact revealed', { projectId, factKey, entityKey: body.entityKey, chapter: body.chapter });
    return this.get(projectId, factKey);
  }

  async retract(projectId: bigint, factKey: string, entityKey: string): Promise<FactWithKnowledge> {
    const [fact, entity] = await Promise.all([
      this.db.query.canonFacts.findFirst({ where: and(eq(schema.canonFacts.projectId, projectId), eq(schema.canonFacts.factKey, factKey)) }),
      this.db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)) }),
    ]);
    if (!fact) throw AppErrorCode.FCT_001.create();
    if (!entity) throw AppErrorCode.FCT_002.create();

    await this.db.delete(schema.characterKnowledge).where(and(eq(schema.characterKnowledge.factId, fact.id), eq(schema.characterKnowledge.entityId, entity.id)));
    this.logger.info('fact knowledge retracted', { projectId, factKey, entityKey });
    return this.get(projectId, factKey);
  }

  private toFactWithKnowledge(fact: FactRowWithLedger): FactWithKnowledge {
    const { knowledge, ...rest } = fact;
    const entries = knowledge
      .map(row => ({
        entityKey: row.entity.entityKey,
        entityName: row.entity.name,
        learnedInChapter: row.learnedInChapter,
        source: row.source,
        note: row.note,
        createdAt: row.createdAt,
      }))
      .sort((a, b) => a.learnedInChapter - b.learnedInChapter || a.entityKey.localeCompare(b.entityKey));
    return { ...rest, knowledge: entries };
  }
}
