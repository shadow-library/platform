/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { randomUUID } from 'crypto';

import { Inject, Injectable } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';
import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { IMAGE_STORAGE, type ImageStorageProvider } from '../storage/image-storage.interface';

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
    @Inject(IMAGE_STORAGE) private readonly imageStorage: ImageStorageProvider,
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

    const apiKey = isGrokOnly ? Config.get('ai.xai.api.key') : Config.get('ai.openai.api.key');
    const url = isGrokOnly ? 'https://api.x.ai/v1/images/generations' : 'https://api.openai.com/v1/images/generations';
    const model = isGrokOnly ? Config.get('ai.grok.image.model') : 'gpt-image-1';

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
      throw new Error(`Image generation failed: ${err}`);
    }

    const data = (await res.json()) as { data: { b64_json: string }[] };
    const b64 = data.data[0]?.b64_json;
    if (!b64) throw new Error('Image generation returned no data');
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

    const ref = await this.imageStorage.save(projectId, `${entityKey}_preview_${sessionId.slice(0, 8)}`, bytes, 'image/png');
    return { sessionId, previewUrl: this.imageStorage.getUrl(ref) };
  }

  async refine(sessionId: string, instruction: string): Promise<{ previewUrl: string }> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') throw new Error(`Session ${sessionId} not found or inactive`);

    this.logger.info('illustration refine', { sessionId, projectId: session.projectId, entityKey: session.entityKey });
    const fullInstruction = `${session.instruction}\n\nRefinement: ${instruction}`;
    const bytes = await this.generateImage(fullInstruction, session.projectId);
    session.previewBytes = bytes;
    session.instruction = fullInstruction;

    const ref = await this.imageStorage.save(session.projectId, `${session.entityKey}_preview_${sessionId.slice(0, 8)}`, bytes, 'image/png');
    return { previewUrl: this.imageStorage.getUrl(ref) };
  }

  async save(sessionId: string): Promise<{ saved: boolean; imagePath: string }> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') throw new Error(`Session ${sessionId} not found or inactive`);
    if (!session.previewBytes) throw new Error('No preview to save');

    const ref = await this.imageStorage.save(session.projectId, session.entityKey, session.previewBytes, 'image/png');

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
