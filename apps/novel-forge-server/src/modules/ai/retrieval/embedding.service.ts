import { type SQL, sql } from 'drizzle-orm';
import { Ollama } from 'ollama/browser';
import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';
import { isSynapseError, SynapseClient, type SynapseEmbeddingResponse } from '@shadow-library/synapse';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { EMBEDDING_DIM, type PrimaryDatabase } from '@server/database';

import { isSynapseBackend } from '../ai-backend';
import { PRODUCTION_GROUP_DEFAULTS } from '../defaults';
import { projectSubject, SYNAPSE_EMBEDDING_TASK } from '../synapse-request';

type Vector = number[] | null;

/**
 * Frozen whatever the current task is: a vector stored without a task was built by the Ollama embedder, the model Synapse's first pinned
 * embedding task serves. Moving to a new task leaves these rows out of every search until they are re-indexed.
 */
export const UNTAGGED_EMBEDDING_TASK = 'novel-forge.embedding';

/** Vectors of different tasks live in different spaces, so a query is compared only with rows its own task built. */
export function sameTask(column: SQL, task: string): SQL {
  return sql`coalesce(${column}, ${UNTAGGED_EMBEDDING_TASK}) = ${task}`;
}

function vectorsOf(response: SynapseEmbeddingResponse, count: number): number[][] {
  const reported = response.synapse.dimensions;
  if (reported !== undefined && reported !== EMBEDDING_DIM) throw AppErrorCode.AI_023.create({ dimensions: reported, expected: EMBEDDING_DIM });
  const byIndex = new Map(response.data.map(item => [item.index, item.embedding]));
  return Array.from({ length: count }, (_, index) => {
    const vector = byIndex.get(index);
    if (!vector) throw AppError.internal(`synapse answered no embedding for input ${index} of ${count}`);
    if (vector.length !== EMBEDDING_DIM) throw AppErrorCode.AI_023.create({ dimensions: vector.length, expected: EMBEDDING_DIM });
    return vector;
  });
}

@Injectable()
export class EmbeddingService {
  private readonly logger = Logger.getLogger(APP_NAME, EmbeddingService.name);
  private readonly db: PrimaryDatabase;
  private ollama?: Ollama;

  constructor(
    databaseService: DatabaseService,
    private readonly synapse?: SynapseClient,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** The task whose vector space this service embeds into; a query is only ever compared with stored vectors of the same task. */
  get task(): string {
    return isSynapseBackend() ? SYNAPSE_EMBEDDING_TASK : UNTAGGED_EMBEDDING_TASK;
  }

  /** Best-effort: null on any failure, a Synapse budget refusal included, so indexing stores the text unembedded for the next backfill. */
  async embed(projectId: bigint, text: string): Promise<Vector> {
    if (!isSynapseBackend()) return this.embedLocally(text);
    const [vector] = await this.embedThroughSynapse(projectId, text, 1);
    return vector ?? null;
  }

  /** On Synapse one call carries every text, so a chapter spends one budget call; each element is null on failure. */
  async embedBatch(projectId: bigint, texts: string[]): Promise<Vector[]> {
    if (texts.length === 0) return [];
    if (isSynapseBackend()) return this.embedThroughSynapse(projectId, texts, texts.length);
    const vectors: Vector[] = [];
    for (const text of texts) vectors.push(await this.embedLocally(text));
    return vectors;
  }

  private async embedThroughSynapse(projectId: bigint, input: string | string[], count: number): Promise<Vector[]> {
    try {
      if (!this.synapse) throw AppError.internal('ai.backend is synapse but no SynapseClient was provided');
      const subject = await projectSubject(this.db, projectId);
      const signal = AbortSignal.timeout(Config.get('ai.llm.timeout-ms') ?? 300_000);
      return vectorsOf(await this.synapse.embed({ model: SYNAPSE_EMBEDDING_TASK, input, synapse: { subject } }, { signal }), count);
    } catch (err) {
      if (AppError.is(err, AppErrorCode.AI_023)) this.logger.error('Embeddings do not fit the vector columns, so none is stored', { projectId, count, err });
      else this.logger.warn('Embedding through Synapse failed', { projectId, count, code: isSynapseError(err) ? err.code : undefined, err });
      return Array.from({ length: count }, () => null);
    }
  }

  private async embedLocally(text: string): Promise<Vector> {
    const model = Config.get('ai.embedding.model') ?? PRODUCTION_GROUP_DEFAULTS.embedding.model;
    try {
      this.ollama ??= new Ollama({ host: Config.get('ai.ollama.host') });
      return (await this.ollama.embeddings({ model, prompt: text })).embedding;
    } catch (err) {
      this.logger.warn('Embedding failed', { model, err });
      return null;
    }
  }
}
