import { and, asc, eq, gt, gte, inArray, lte, type SQL, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { type DbExecutor, type Job, type PrimaryDatabase, schema } from '@server/database';

export interface ChatJobEvent extends Job.Event {
  kind: Job.Kind;
}

export interface ChatJobs {
  items: Job.Row[];
  /** The session's latest event seq as of `items`: a client that has just read them follows the stream from here. */
  cursor: number;
}

export interface ChatJobReplay {
  events: ChatJobEvent[];
  cursor: number;
  activeJobIds: string[];
}

export const TERMINAL_JOB_EVENTS: ReadonlySet<Job.EventType> = new Set(['done', 'failed', 'cancelled']);
export const EVENT_PAGE = 200;

const ACTIVE_STATUSES: Job.Status[] = ['pending', 'in_progress'];
const SETTLED_STATUSES: Job.Status[] = ['done', 'failed', 'cancelled'];
const RECENTLY_SETTLED_MS = 60 * 60_000;
const SNAPSHOT = { isolationLevel: 'repeatable read', accessMode: 'read only' } as const;

function startedFrom(sessionId: string): SQL {
  return sql`${schema.jobs.payload}->'origin'->>'sessionId' = ${sessionId}`;
}

/** The reads behind a chat's job list and event stream; each read that pairs rows with a cursor takes both from one snapshot. */
@Injectable()
export class ChatJobReader {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** The session's latest event seq; another project's session answers as missing. */
  async sessionCursor(projectId: bigint, sessionId: string, db: DbExecutor = this.db): Promise<number> {
    const [session] = await db
      .select({ seq: schema.chatSessions.jobEventSeq })
      .from(schema.chatSessions)
      .where(and(eq(schema.chatSessions.id, sessionId), eq(schema.chatSessions.projectId, projectId)))
      .limit(1);
    if (!session) throw AppErrorCode.CHT_001.create();
    return session.seq;
  }

  /**
   * What a reopened chat shows: every job still running, plus one this session started that settled within
   * `RECENTLY_SETTLED_MS` — the same window `replay` uses, read from the same snapshot as the cursor.
   */
  listRecent(projectId: bigint, sessionId: string, now = Date.now()): Promise<ChatJobs> {
    return this.db.transaction(async tx => {
      const cursor = await this.sessionCursor(projectId, sessionId, tx);
      const active = await this.activeJobs(tx, projectId, sessionId);
      const settled = await this.settledJobs(tx, projectId, sessionId, now);
      const items = [...active, ...settled].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return { items, cursor };
    }, SNAPSHOT);
  }

  async activeJobIds(projectId: bigint, sessionId: string): Promise<string[]> {
    return (await this.activeJobs(this.db, projectId, sessionId)).map(job => job.id);
  }

  async isStartedFrom(projectId: bigint, sessionId: string, jobId: string): Promise<boolean> {
    const [job] = await this.db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.projectId, projectId), startedFrom(sessionId)))
      .limit(1);
    return job !== undefined;
  }

  async eventsAfter(projectId: bigint, sessionId: string, after: number): Promise<ChatJobEvent[]> {
    return this.events(this.db, and(eq(schema.jobEvents.projectId, projectId), eq(schema.jobEvents.sessionId, sessionId), gt(schema.jobEvents.seq, after)), EVENT_PAGE);
  }

  /**
   * What a chat opened with no cursor needs: every event of its running jobs, and how each job that settled in the last hour ended —
   * never the whole history. The cursor comes from the same snapshot, so following on from it misses nothing and repeats nothing.
   */
  replay(projectId: bigint, sessionId: string, now = Date.now()): Promise<ChatJobReplay> {
    return this.db.transaction(async tx => {
      const cursor = await this.sessionCursor(projectId, sessionId, tx);
      const active = (await this.activeJobs(tx, projectId, sessionId)).map(job => job.id);
      const settled = (await this.settledJobs(tx, projectId, sessionId, now)).map(job => job.id);
      const inSession = and(eq(schema.jobEvents.projectId, projectId), eq(schema.jobEvents.sessionId, sessionId), lte(schema.jobEvents.seq, cursor));
      const running = active.length === 0 ? [] : await this.events(tx, and(inSession, inArray(schema.jobEvents.jobId, active)));
      const endings =
        settled.length === 0 ? [] : await this.events(tx, and(inSession, inArray(schema.jobEvents.jobId, settled), inArray(schema.jobEvents.type, [...TERMINAL_JOB_EVENTS])));
      const lastEnding = new Map(endings.map(event => [event.jobId, event]));
      const events = [...running, ...lastEnding.values()].sort((a, b) => a.seq - b.seq);
      return { events, cursor, activeJobIds: active };
    }, SNAPSHOT);
  }

  private activeJobs(db: DbExecutor, projectId: bigint, sessionId: string): Promise<Job.Row[]> {
    return db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.projectId, projectId), inArray(schema.jobs.status, ACTIVE_STATUSES), startedFrom(sessionId)))
      .orderBy(asc(schema.jobs.createdAt));
  }

  private settledJobs(db: DbExecutor, projectId: bigint, sessionId: string, now: number): Promise<Job.Row[]> {
    return db
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.projectId, projectId),
          inArray(schema.jobs.status, SETTLED_STATUSES),
          gte(schema.jobs.updatedAt, new Date(now - RECENTLY_SETTLED_MS)),
          startedFrom(sessionId),
        ),
      )
      .orderBy(asc(schema.jobs.createdAt));
  }

  private async events(db: DbExecutor, where: SQL | undefined, limit?: number): Promise<ChatJobEvent[]> {
    const query = db
      .select({ event: schema.jobEvents, kind: schema.jobs.kind })
      .from(schema.jobEvents)
      .innerJoin(schema.jobs, eq(schema.jobs.id, schema.jobEvents.jobId))
      .where(where)
      .orderBy(asc(schema.jobEvents.seq));
    const rows = limit === undefined ? await query : await query.limit(limit);
    return rows.map(row => ({ ...row.event, kind: row.kind }));
  }
}
