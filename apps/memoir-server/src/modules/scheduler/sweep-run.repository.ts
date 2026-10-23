import { and, eq, lte, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { type PrimaryDatabase, schema } from '@server/database';

import { type SweepRun } from './scheduler.types';

@Injectable()
export class SweepRunRepository {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  /** Seeds at `now()` so a new sweep waits one cadence instead of bursting at boot; a no-op `DO UPDATE`, not `DO NOTHING`, so RETURNING also yields existing rows. */
  async seed(names: string[]): Promise<Map<string, Date>> {
    if (names.length === 0) return new Map();
    const rows = await this.db
      .insert(schema.sweepRuns)
      .values(names.map(name => ({ name })))
      .onConflictDoUpdate({ target: schema.sweepRuns.name, set: { name: sql`excluded.name` } })
      .returning({ name: schema.sweepRuns.name, lastRunAt: schema.sweepRuns.lastRunAt });
    return new Map(rows.map(row => [row.name, row.lastRunAt]));
  }

  /** Cadence is compared in database time and the row lock serializes concurrent claims. Null when the row is gone. */
  async claim(name: string, cadenceMs: number): Promise<SweepRun | null> {
    const [claimed] = await this.db
      .update(schema.sweepRuns)
      .set({ lastRunAt: sql`now()` })
      .where(and(eq(schema.sweepRuns.name, name), lte(schema.sweepRuns.lastRunAt, sql`now() - make_interval(secs => ${cadenceMs / 1000}::float8)`)))
      .returning({ lastRunAt: schema.sweepRuns.lastRunAt });
    if (claimed) return { claimed: true, lastRunAt: claimed.lastRunAt };

    const [current] = await this.db.select({ lastRunAt: schema.sweepRuns.lastRunAt }).from(schema.sweepRuns).where(eq(schema.sweepRuns.name, name));
    return current ? { claimed: false, lastRunAt: current.lastRunAt } : null;
  }
}
