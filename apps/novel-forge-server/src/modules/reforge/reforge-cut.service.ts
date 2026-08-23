import { asc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type ReforgeTransform, schema } from '@server/database';

import { buildSeedCuts, type CutEntryLike, type SeedSpan, slugifyCutKey } from './cut-ledger';

/** A cut a chapter discovered while it was being written, reported on `reforge_outputs.cutDelta`. */
export interface CutDelta {
  label: string;
  kind?: ReforgeTransform.CutKind;
  aliases?: string[];
  detail?: string;
  disposition?: ReforgeTransform.CutDisposition;
  replacementNote?: string;
}

@Injectable()
export class ReforgeCutService {
  private readonly logger = Logger.getLogger(APP_NAME, ReforgeCutService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  list(planId: bigint): Promise<ReforgeTransform.Cut[]> {
    return this.db.query.reforgeCuts.findMany({
      where: eq(schema.reforgeCuts.planId, planId),
      orderBy: [asc(schema.reforgeCuts.effectiveFromOutput), asc(schema.reforgeCuts.cutKey)],
    });
  }

  /** Seeds the ledger from an approved plan. Idempotent: re-approving the same revision re-describes nothing. */
  async seed(planId: bigint, spans: SeedSpan[]): Promise<number> {
    const entries = buildSeedCuts(spans);
    if (entries.length === 0) return 0;
    await this.insert(planId, entries);
    this.logger.info('reforge cut ledger seeded', { planId, entries: entries.length });
    return entries.length;
  }

  /**
   * Appends what an output chapter discovered it had to cut. Append-only and insert-conflict-keeps-
   * existing: a cut is never re-described once recorded, so the ledger the writer reads never shifts
   * under a re-run.
   */
  async append(planId: bigint, span: { ordinal: number; fromChapter: number; toChapter: number }, outputChapter: number, deltas: CutDelta[]): Promise<number> {
    if (deltas.length === 0) return 0;
    const entries: CutEntryLike[] = deltas.map(delta => ({
      cutKey: slugifyCutKey(delta.label),
      kind: delta.kind ?? 'thread',
      label: delta.label,
      aliases: delta.aliases ?? [delta.label],
      detail: delta.detail ?? null,
      disposition: delta.disposition ?? 'cut',
      replacementNote: delta.replacementNote ?? null,
      originSpanOrdinal: span.ordinal,
      firstSourceChapter: span.fromChapter,
      lastSourceChapter: span.toChapter,
      effectiveFromOutput: outputChapter,
    }));
    await this.insert(planId, entries);
    this.logger.debug('reforge cut ledger appended', { planId, outputChapter, entries: entries.length });
    return entries.length;
  }

  private async insert(planId: bigint, entries: CutEntryLike[]): Promise<void> {
    await this.db
      .insert(schema.reforgeCuts)
      .values(entries.map(entry => ({ ...entry, planId, aliases: entry.aliases ?? null, detail: entry.detail ?? null, replacementNote: entry.replacementNote ?? null })))
      .onConflictDoNothing();
  }
}
