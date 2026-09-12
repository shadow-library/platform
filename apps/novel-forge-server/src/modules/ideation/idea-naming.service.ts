import { and, asc, eq, isNull } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { PROMPT_REGISTRY } from '../ai/prompts';
import { IDEA_NAME_MAX_LENGTH, type IdeaNameOutput } from '../ai/schemas';

export const IDEA_NAME_SOURCE_LIMIT = 2000;
export const IDEA_NAME_GRAPH = 'ideation-name';

const QUOTE_PAIRS: Record<string, string> = { '"': '"', "'": "'", '`': '`', '“': '”', '‘': '’', '«': '»', '„': '“' };

export interface IdeaNamingRequest {
  projectId: bigint;
  seedId: bigint;
  /** The studio conversation whose first author message is the idea being named. */
  sessionId: string;
  /** Named instead when the conversation has no author message yet. */
  fallback: string;
}

@Injectable()
export class IdeaNamingService {
  private readonly logger = Logger.getLogger(APP_NAME, IdeaNamingService.name);
  private readonly db: PrimaryDatabase;
  private readonly inFlight = new Set<bigint>();

  constructor(
    databaseService: DatabaseService,
    private readonly modelRouter: ModelRouterService,
    private readonly workflowRunService: WorkflowRunService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  nameInBackground(request: IdeaNamingRequest): void {
    if (this.inFlight.has(request.projectId)) return;
    this.inFlight.add(request.projectId);
    void this.nameIdea(request).finally(() => this.inFlight.delete(request.projectId));
  }

  /** Resolves to the name written, or null when nothing was — an existing title, a gone seed, an unusable answer, or a failure. */
  async nameIdea(request: IdeaNamingRequest): Promise<string | null> {
    const { projectId, seedId } = request;
    try {
      const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { status: true, title: true, contentMode: true, config: true } });
      if (!project || project.status !== 'seed' || project.title !== null) return null;

      const idea = (await this.ideaOf(request)).slice(0, IDEA_NAME_SOURCE_LIMIT);
      if (!idea) return null;

      const prompt = PROMPT_REGISTRY['idea-name'];
      const { result } = await this.workflowRunService.runChain(projectId, IDEA_NAME_GRAPH, `seed:${seedId}`, { idea }, async runId => {
        const telemetry = { projectId, runId, node: IDEA_NAME_GRAPH, promptKey: prompt.key, promptVersion: prompt.version, role: 'title' };
        const output = (await this.modelRouter.structured(prompt, { idea }, telemetry, project as ProjectConfig)) as IdeaNameOutput;
        const name = normaliseIdeaName(output.name);
        if (!name) return null;

        // The author may have renamed the idea, or graduated it, while the model was answering: their title wins.
        const [written] = await this.db
          .update(schema.projects)
          .set({ title: name })
          .where(and(eq(schema.projects.id, projectId), eq(schema.projects.status, 'seed'), isNull(schema.projects.title)))
          .returning({ id: schema.projects.id });
        return written ? name : null;
      });

      this.logger.info('idea naming finished', { projectId, seedId, named: result !== null });
      return result;
    } catch (err) {
      this.logger.warn('idea naming failed', { projectId, seedId, err });
      return null;
    }
  }

  private async ideaOf(request: IdeaNamingRequest): Promise<string> {
    const first = await this.db.query.chatMessages.findFirst({
      where: and(eq(schema.chatMessages.sessionId, request.sessionId), eq(schema.chatMessages.role, 'user')),
      orderBy: asc(schema.chatMessages.ordinal),
      columns: { content: true },
    });
    return (first?.content ?? request.fallback).trim();
  }
}

export function normaliseIdeaName(raw: string): string | null {
  let name = raw.replace(/\s+/g, ' ').trim();
  for (let previous = ''; previous !== name;) {
    previous = name;
    name = unwrapQuotes(stripTrailingPunctuation(name));
  }

  if (name.length > IDEA_NAME_MAX_LENGTH) {
    const boundary = name.slice(0, IDEA_NAME_MAX_LENGTH + 1).lastIndexOf(' ');
    name = stripTrailingPunctuation(name.slice(0, boundary > 0 ? boundary : IDEA_NAME_MAX_LENGTH));
  }
  return name || null;
}

function stripTrailingPunctuation(name: string): string {
  return name.replace(/[\s.,;:]+$/, '');
}

function unwrapQuotes(name: string): string {
  const opener = name.charAt(0);
  const closer = QUOTE_PAIRS[opener];
  if (name.length < 2 || !closer || !name.endsWith(closer)) return name;
  const inner = name.slice(1, -1);
  return opener !== "'" && inner.includes(opener) ? name : inner.trim();
}
