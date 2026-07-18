/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { asc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { type PrimaryDatabase, schema } from '@server/database';

import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { PROMPT_REGISTRY } from '../ai/prompts';
import { type SkeletonOutput } from '../ai/schemas/skeleton.schema';
import { type TelemetryContext } from '../ai/telemetry.handler';

/**
 * Defining types
 */

export interface SkeletonResult {
  characterArcs: SkeletonOutput['characterArcs'];
  powerCurve: string;
}

/**
 * Declaring the constants
 */

/**
 * Generates a high-level story skeleton (character arcs + power curve) by
 * reverse-engineering structure from the extracted knowledge base.
 *
 * Assembles a project brief from entity list and chapter summaries, then calls
 * the LLM skeleton prompt and persists the result on the project row.
 */
@Injectable()
export class SkeletonService {
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly modelRouter: ModelRouterService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async generateSkeleton(projectId: bigint): Promise<SkeletonResult> {
    const [entityRows, chapterRows, projectRow] = await Promise.all([
      this.db.query.entities.findMany({ where: eq(schema.entities.projectId, projectId), limit: 50 }),
      this.db.query.chapters.findMany({
        where: eq(schema.chapters.projectId, projectId),
        orderBy: [asc(schema.chapters.number)],
        columns: { number: true, summary: true },
      }),
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
    ]);

    const entityList = entityRows.map(e => `${e.name} (${e.type}, ${e.significance ?? 'unknown'})`).join('\n');
    const chapterSummaries = chapterRows
      .filter(c => c.summary)
      .map(c => `Chapter ${c.number}: ${c.summary}`)
      .join('\n');

    // Compose the prompt inputs from entity/chapter data and project metadata.
    const projectBrief = [entityList && `Key entities:\n${entityList}`, chapterSummaries && `Chapter progression:\n${chapterSummaries}`].filter(Boolean).join('\n\n');
    const themes = Array.isArray(projectRow?.themes) ? (projectRow.themes as string[]).join(', ') : projectRow?.themes ? String(projectRow.themes) : '';

    const ctx: TelemetryContext = { projectId, runId: 'skeleton', node: 'skeleton', promptKey: 'skeleton', promptVersion: '1.0.0', role: 'skeleton' };

    const result = (await this.modelRouter.structured(PROMPT_REGISTRY.skeleton, { projectBrief, themes }, ctx, projectRow as ProjectConfig | undefined)) as SkeletonOutput;

    // Persist on the project row for later reference.
    await this.db
      .update(schema.projects)
      .set({ skeletonCharacterArcs: result.characterArcs as never, skeletonPowerCurve: result.powerCurve, updatedAt: new Date() })
      .where(eq(schema.projects.id, projectId));

    return { characterArcs: result.characterArcs, powerCurve: result.powerCurve };
  }
}
