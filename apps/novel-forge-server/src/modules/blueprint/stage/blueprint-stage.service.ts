import { and, type AnyColumn, asc, eq, inArray, isNotNull, type SQL, sql, type SQLWrapper } from 'drizzle-orm';
import { type PgTable } from 'drizzle-orm/pg-core';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { type PrimaryDatabase, type Project, schema } from '@server/database';

import { BlueprintStepRegistry } from '../engine/blueprint-step.registry';
import { loadActiveLedger } from '../ledger/ledger-entries';
import { type BlueprintPhaseProgress, type BlueprintStage, deriveBlueprintStage, type ImportContent, type ImportCoverage, importCoverage } from './blueprint-stage';

export interface BlueprintProgress {
  stage: BlueprintStage;
  phases: BlueprintPhaseProgress[];
  importCoverage?: ImportCoverage;
}

interface StageFlags {
  hasBriefs: boolean;
  hasStepEntries: boolean;
}

const briefs = schema.briefs;
const ledger = schema.decisionLedgerEntries;
const documents = schema.bibleDocuments;
const entities = schema.entities;
const volumes = schema.volumes;
const arcs = schema.arcs;

const hasText = (column: AnyColumn): SQL => sql`coalesce(${column}, '') ~ '[^[:space:]]'`;
const exists = (query: SQLWrapper) => sql<boolean>`exists(${query})`;
const countOf = (query: SQLWrapper) => sql<number>`(${query})::int`;

@Injectable()
export class BlueprintStageService {
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly registry: BlueprintStepRegistry,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Only an original novel has a Blueprint; every other kind reports null. */
  async progress(project: Pick<Project.Row, 'id' | 'kind'>): Promise<BlueprintProgress | null> {
    if (project.kind !== 'new_novel') return null;
    const [active, flags] = await Promise.all([loadActiveLedger(this.db, project.id), this.flags(project.id)]);
    const derived = deriveBlueprintStage({ steps: this.registry.all, ledger: active, ...flags });
    if (!derived.imported) return { stage: derived.stage, phases: derived.phases };
    return { stage: derived.stage, phases: derived.phases, importCoverage: importCoverage(await this.importContent(project.id)) };
  }

  /** Subqueries go through the builder because drizzle leaves a raw column in a select list unqualified, which a subquery would bind to its own table. */
  private rows(table: PgTable, where: SQL | undefined): SQLWrapper {
    return this.db
      .select({ n: sql`count(*)` })
      .from(table)
      .where(where);
  }

  private anyRow(table: PgTable, where: SQL | undefined): SQLWrapper {
    return this.db
      .select({ one: sql`1` })
      .from(table)
      .where(where)
      .limit(1);
  }

  private async flags(projectId: bigint): Promise<StageFlags> {
    const [row] = await this.db
      .select({
        hasBriefs: exists(this.anyRow(briefs, eq(briefs.projectId, projectId))),
        hasStepEntries: exists(this.anyRow(ledger, and(eq(ledger.projectId, projectId), isNotNull(ledger.stepKey)))),
      })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId));
    return { hasBriefs: row?.hasBriefs ?? false, hasStepEntries: row?.hasStepEntries ?? false };
  }

  /** Existence and counts only: no page, entity or brief body leaves the database. */
  private async importContent(projectId: bigint): Promise<ImportContent> {
    const document = (condition: SQL | undefined) => countOf(this.rows(documents, and(eq(documents.projectId, projectId), hasText(documents.body), condition)));
    const characters = (condition: SQL | undefined) => countOf(this.rows(entities, and(eq(entities.projectId, projectId), eq(entities.type, 'character'), condition)));
    const firstVolumeKey = this.db
      .select({ volumeKey: volumes.volumeKey })
      .from(volumes)
      .where(eq(volumes.projectId, projectId))
      .orderBy(asc(volumes.ordinal), asc(volumes.id))
      .limit(1);

    const [row] = await this.db
      .select({
        projectPremise: sql<boolean>`${hasText(schema.projects.premise)}`,
        premiseDocument: document(and(eq(documents.section, 'project'), eq(documents.slug, 'premise'))),
        readerPromiseDocument: document(and(eq(documents.section, 'project'), eq(documents.slug, 'reader-promise'))),
        worldDocuments: document(inArray(documents.section, ['world', 'power'])),
        plotDocuments: document(eq(documents.section, 'plot')),
        voiceDocuments: document(sql`${documents.slug} ~ '(voice|pacing|tone)'`),
        roleCharacters: characters(sql`${entities.attributes} ->> 'role' ~* '(protagonist|antagonist)'`),
        majorCharacters: characters(eq(entities.significance, 'major')),
        volumes: countOf(this.rows(volumes, eq(volumes.projectId, projectId))),
        firstVolumeArcs: countOf(this.rows(arcs, and(eq(arcs.projectId, projectId), eq(arcs.volumeKey, sql`(${firstVolumeKey})`)))),
        briefs: countOf(this.rows(briefs, eq(briefs.projectId, projectId))),
      })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId));

    return {
      projectPremise: row?.projectPremise ?? false,
      premiseDocument: (row?.premiseDocument ?? 0) > 0,
      readerPromiseDocument: (row?.readerPromiseDocument ?? 0) > 0,
      worldDocuments: row?.worldDocuments ?? 0,
      plotDocuments: row?.plotDocuments ?? 0,
      voiceDocuments: row?.voiceDocuments ?? 0,
      roleCharacters: row?.roleCharacters ?? 0,
      majorCharacters: row?.majorCharacters ?? 0,
      volumes: row?.volumes ?? 0,
      firstVolumeArcs: row?.firstVolumeArcs ?? 0,
      briefs: row?.briefs ?? 0,
    };
  }
}
