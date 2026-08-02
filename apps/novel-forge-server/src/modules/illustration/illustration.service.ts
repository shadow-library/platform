/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger } from '@shadow-library/common';
import { DatabaseService, StorageService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

/**
 * Defining types
 */

interface IllustrationSession {
  sessionId: string;
  projectId: bigint;
  entityKey: string;
  instruction: string;
  previewBytes: Uint8Array | null;
  status: 'active' | 'saved' | 'cancelled';
  createdAt: Date;
}

/**
 * Declaring the constants
 */

const SESSION_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class IllustrationService {
  private readonly logger = Logger.getLogger(APP_NAME, IllustrationService.name);
  private readonly db: PrimaryDatabase;
  private readonly sessions = new Map<string, IllustrationSession>();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly storage: StorageService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt.getTime() > SESSION_TTL_MS) this.sessions.delete(id);
    }
  }

  private async generateImage(instruction: string, projectId: bigint): Promise<Uint8Array> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const isGrokOnly = project?.contentMode === 'grok_only';

    // Deliberately not `ai.{xai,openai}.api.key`. Those hold the CLI gateway's bearer token whenever the
    // matching `*.api.url` aims that provider at the gateway, while the URLs below are the vendors' own
    // endpoints — reusing them here would post a host credential to a third party. No CLI backend
    // generates images, so this path cannot route through the gateway and needs its own credential.
    const apiKey = isGrokOnly ? Config.get('ai.xai.image.api.key') : Config.get('ai.openai.image.api.key');
    const url = isGrokOnly ? 'https://api.x.ai/v1/images/generations' : 'https://api.openai.com/v1/images/generations';
    const model = isGrokOnly ? Config.get('ai.grok.image.model') : 'gpt-image-1';
    // Fail closed rather than falling back to the chat credential.
    if (!apiKey) throw AppError.internal(`Image generation is not configured — set ${isGrokOnly ? 'AI_XAI_IMAGE_API_KEY' : 'AI_OPENAI_IMAGE_API_KEY'}`);

    // The full prompt is sensitive/verbose — dev-only debug is where it belongs.
    this.logger.debug('generateImage: requesting', { projectId, provider: isGrokOnly ? 'xai' : 'openai', model, instruction });
    const startedAt = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: instruction, n: 1, size: '1024x1024', response_format: 'b64_json' }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      this.logger.error('generateImage: provider returned an error', { projectId, model, status: res.status, err });
      throw AppError.internal(`Image generation failed: ${err}`);
    }

    const data = (await res.json()) as { data: { b64_json: string }[] };
    const b64 = data.data[0]?.b64_json;
    if (!b64) throw AppError.internal('Image generation returned no data');
    const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
    this.logger.debug('generateImage: received image', { projectId, model, bytes: bytes.length, latencyMs: Date.now() - startedAt });
    return bytes;
  }

  async start(projectId: bigint, entityKey: string, options: { instruction?: string; noChat?: boolean }): Promise<{ sessionId: string; previewUrl: string }> {
    this.pruneExpired();
    const entity = await this.db.query.entities.findFirst({ where: eq(schema.entities.entityKey, entityKey) });
    const instruction = options.instruction ?? `Create a character portrait for "${entity?.name ?? entityKey}", a ${entity?.type ?? 'character'} in a fantasy novel.`;

    this.logger.info('illustration start', { projectId, entityKey });
    const bytes = await this.generateImage(instruction, projectId);
    const sessionId = randomUUID();
    this.sessions.set(sessionId, { sessionId, projectId, entityKey, instruction, previewBytes: bytes, status: 'active', createdAt: new Date() });

    const ref = await this.storage.save(bytes, { contentType: 'image/png' });
    return { sessionId, previewUrl: this.storage.getPublicUrl(ref) };
  }

  async refine(sessionId: string, instruction: string): Promise<{ previewUrl: string }> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') throw AppError.internal(`Session ${sessionId} not found or inactive`);

    this.logger.info('illustration refine', { sessionId, projectId: session.projectId, entityKey: session.entityKey });
    const fullInstruction = `${session.instruction}\n\nRefinement: ${instruction}`;
    const bytes = await this.generateImage(fullInstruction, session.projectId);
    session.previewBytes = bytes;
    session.instruction = fullInstruction;

    const ref = await this.storage.save(bytes, { contentType: 'image/png' });
    return { previewUrl: this.storage.getPublicUrl(ref) };
  }

  async save(sessionId: string): Promise<{ saved: boolean; imagePath: string }> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') throw AppError.internal(`Session ${sessionId} not found or inactive`);
    if (!session.previewBytes) throw AppError.internal('No preview to save');

    const ref = await this.storage.save(session.previewBytes, { contentType: 'image/png' });

    await this.db.update(schema.entities).set({ imagePath: ref, updatedAt: new Date() }).where(eq(schema.entities.entityKey, session.entityKey));

    session.status = 'saved';
    this.logger.info('illustration saved', { sessionId, ref });
    return { saved: true, imagePath: ref };
  }

  async cancel(sessionId: string): Promise<{ cancelled: boolean }> {
    const session = this.sessions.get(sessionId);
    if (session) session.status = 'cancelled';
    return { cancelled: true };
  }
}
