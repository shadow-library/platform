import { and, desc, eq, inArray } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { seedContentHash } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Ideation, type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { ProjectService } from '../project/project/project.service';
import { type CreateSeedBody, type ListSeedsResponse, type SeedResponse, type SeedSummaryResponse } from './ideation.dto';

const PLACEHOLDER_SEED_NAME = 'Untitled idea';
const STUDIO_SESSION_TITLE = 'Ideation Studio';
const SPARK_EXCERPT_LENGTH = 160;

@Injectable()
export class IdeationService {
  private readonly logger = Logger.getLogger(APP_NAME, IdeationService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly context: ContextService,
    private readonly projectService: ProjectService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  private ownerId(): bigint {
    return BigInt(this.context.getAuthPrincipal().sub);
  }

  private present(seed: Ideation.StorySeed, sessionId: string | null): SeedResponse {
    return {
      id: seed.id,
      projectId: seed.projectId,
      sessionId,
      fields: seed.fields ?? {},
      provenance: seed.provenance ?? {},
      constraints: seed.constraints ?? [],
      tasteAnchors: seed.tasteAnchors ?? { comps: [], preferences: [] },
      concepts: seed.concepts ?? [],
      readiness: seed.readiness ?? [],
      askedQuestions: seed.askedQuestions ?? [],
      revision: seed.revision,
      createdAt: seed.createdAt,
      updatedAt: seed.updatedAt,
    };
  }

  /**
   * Mints an idea: a seed-status project, its sheet, and the studio conversation. The chat session is
   * inserted here rather than through `ChatService.createSession`, which refuses the `ideation` scope
   * (IDE_005) so no HTTP caller can open a studio session out of band. A spark is persisted as the
   * conversation's first user message so the turn pipeline reads it as an ordinary opening turn.
   */
  async createSeed(body: CreateSeedBody): Promise<SeedResponse> {
    const spark = body.spark?.trim();
    const project = await this.projectService.create({ name: PLACEHOLDER_SEED_NAME, kind: 'new_novel' }, { status: 'seed' });

    return this.db.transaction(async tx => {
      const [seed] = await tx
        .insert(schema.storySeeds)
        .values({
          projectId: project.id,
          fields: {},
          provenance: {},
          constraints: [],
          tasteAnchors: { comps: [], preferences: [] },
          concepts: [],
          readiness: [],
          askedQuestions: [],
          contentHash: seedContentHash({}),
        })
        .returning()
        .catch(err => this.databaseService.translateError(err));
      if (!seed) throw AppErrorCode.S001.create();

      const [session] = await tx
        .insert(schema.chatSessions)
        .values({ projectId: project.id, scopeType: 'ideation', mode: 'auto', title: STUDIO_SESSION_TITLE })
        .returning()
        .catch(err => this.databaseService.translateError(err));
      if (!session) throw AppErrorCode.CHT_001.create();

      if (spark) {
        await tx
          .insert(schema.chatMessages)
          .values({ sessionId: session.id, projectId: project.id, ordinal: 1, role: 'user', content: spark })
          .catch(err => this.databaseService.translateError(err));
      }

      this.logger.info('seed created', { projectId: project.id, seedId: seed.id, sessionId: session.id, hasSpark: Boolean(spark) });
      return this.present(seed, session.id);
    });
  }

  /** The Ideas shelf: every seed-status project the caller owns, newest activity first. */
  async listSeeds(): Promise<ListSeedsResponse> {
    const rows = await this.db
      .select({ seed: schema.storySeeds })
      .from(schema.storySeeds)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.storySeeds.projectId))
      .where(and(eq(schema.projects.ownerId, this.ownerId()), eq(schema.projects.status, 'seed')))
      .orderBy(desc(schema.storySeeds.updatedAt));
    if (rows.length === 0) return { items: [] };

    const seeds = rows.map(row => row.seed);
    const sessions = await this.studioSessions(seeds.map(seed => seed.projectId));
    const sparks = await this.sparkExcerpts([...sessions.values()]);

    const items: SeedSummaryResponse[] = seeds.map(seed => {
      const sessionId = sessions.get(seed.projectId) ?? null;
      return {
        id: seed.id,
        projectId: seed.projectId,
        sessionId,
        workingTitle: seed.fields?.workingTitle ?? null,
        sparkExcerpt: (sessionId && sparks.get(sessionId)) ?? null,
        createdAt: seed.createdAt,
        updatedAt: seed.updatedAt,
      };
    });
    return { items };
  }

  /** The full sheet for one seed. Ownership is enforced a stage earlier by `ProjectOwnershipGuard`. */
  async getSeed(projectId: bigint): Promise<SeedResponse> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { status: true } });
    if (!project) throw AppErrorCode.PRJ_001.create();
    if (project.status !== 'seed') throw AppErrorCode.IDE_001.create();

    const seed = await this.db.query.storySeeds.findFirst({ where: eq(schema.storySeeds.projectId, projectId) });
    if (!seed) throw AppErrorCode.IDE_001.create();

    const sessions = await this.studioSessions([projectId]);
    return this.present(seed, sessions.get(projectId) ?? null);
  }

  private async studioSessions(projectIds: bigint[]): Promise<Map<bigint, string>> {
    const sessions = await this.db.query.chatSessions.findMany({
      where: and(inArray(schema.chatSessions.projectId, projectIds), eq(schema.chatSessions.scopeType, 'ideation')),
      columns: { id: true, projectId: true },
      orderBy: schema.chatSessions.createdAt,
    });
    return new Map(sessions.map((session: Pick<Refinement.ChatSession, 'id' | 'projectId'>) => [session.projectId, session.id]));
  }

  /**
   * The spark is the conversation's first user message, not a sheet field — a brand-new seed has an
   * empty sheet, so it is the only thing that can label its shelf card.
   */
  private async sparkExcerpts(sessionIds: string[]): Promise<Map<string, string>> {
    if (sessionIds.length === 0) return new Map();
    const messages = await this.db.query.chatMessages.findMany({
      where: and(inArray(schema.chatMessages.sessionId, sessionIds), eq(schema.chatMessages.ordinal, 1), eq(schema.chatMessages.role, 'user')),
      columns: { sessionId: true, content: true },
    });
    return new Map(messages.map((message: Pick<Refinement.ChatMessage, 'sessionId' | 'content'>) => [message.sessionId, this.excerpt(message.content)]));
  }

  private excerpt(content: string): string {
    const text = content.trim();
    return text.length <= SPARK_EXCERPT_LENGTH ? text : `${text.slice(0, SPARK_EXCERPT_LENGTH).trimEnd()}…`;
  }
}
