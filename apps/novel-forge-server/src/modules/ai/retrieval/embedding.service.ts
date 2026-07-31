/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Ollama } from 'ollama/browser';
import { Injectable } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class EmbeddingService {
  private readonly logger = Logger.getLogger(APP_NAME, EmbeddingService.name);
  private readonly ollama: Ollama;
  private readonly model: string;

  constructor() {
    this.ollama = new Ollama({ host: Config.get('ai.ollama.host') });
    this.model = Config.get('ai.embedding.model');
  }

  // Embed a single text. Returns null on any error (best-effort — never throws).
  async embed(text: string): Promise<number[] | null> {
    try {
      const response = await this.ollama.embeddings({ model: this.model, prompt: text });
      return response.embedding;
    } catch (err) {
      this.logger.warn('Embedding failed', { model: this.model, err });
      return null;
    }
  }

  // Embed multiple texts sequentially (Ollama is local; parallel offers no benefit).
  // Each element is null on failure; never throws.
  async embedBatch(texts: string[]): Promise<(number[] | null)[]> {
    const results: (number[] | null)[] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }
}
