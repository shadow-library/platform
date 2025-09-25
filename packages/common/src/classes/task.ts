/**
 * Importing npm packages
 */
import { Promisable } from 'type-fest';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '@lib/constants';
import { InternalError } from '@lib/errors';
import { Fn } from '@lib/interfaces';
import { Logger } from '@lib/services';

/**
 * Defining types
 */

export type RetryCallback = (error: unknown, attempt: number) => Promisable<unknown>;

export type RollbackFn<T> = (data: T) => Promisable<unknown>;

export type ShouldRetryFn = (error: unknown, attempt: number) => Promisable<boolean>;

/**
 * Declaring the constants
 */

export class Task<T> {
  private static readonly logger = Logger.getLogger(NAMESPACE, 'Task');

  private taskName = '';
  private retries = 3;
  private delayMs = 1000;
  private backoffFactor = 1;

  private result?: T;
  private retryCallback?: RetryCallback;
  private rollbackFn?: RollbackFn<T>;
  private shouldRetryFn?: ShouldRetryFn;

  private constructor(private readonly fn: Fn<T>) {
    this.taskName = fn.name ?? 'Unnamed Task';
  }

  static create<T>(fn: Fn<T>): Task<T> {
    return new Task(fn);
  }

  name(name: string): this {
    this.taskName = name;
    return this;
  }

  retry(retries: number): this {
    this.retries = retries;
    return this;
  }

  delay(delayMs: number): this {
    this.delayMs = delayMs;
    return this;
  }

  backoff(backoffFactor: number): this {
    this.backoffFactor = backoffFactor;
    return this;
  }

  onRetry(callback: RetryCallback): this {
    this.retryCallback = callback;
    return this;
  }

  hasRollback(): boolean {
    return !!this.rollbackFn;
  }

  rollback(rollbackFn: RollbackFn<T>): this {
    this.rollbackFn = rollbackFn;
    return this;
  }

  shouldRetry(fn: ShouldRetryFn): this {
    this.shouldRetryFn = fn;
    return this;
  }

  async execute(): Promise<T> {
    let attempt = 1;
    let delay = this.delayMs;
    const logger = Task.logger;

    while (attempt <= this.retries) {
      try {
        logger.debug(`Executing task: ${this.taskName} (Attempt ${attempt})`);
        this.result = await this.fn();
        logger.debug(`Task executed successfully: ${this.taskName} (Attempt ${attempt})`);
        return this.result;
      } catch (error) {
        logger.warn(`Task failed: ${this.taskName} (Attempt ${attempt})`, error);

        if (attempt === this.retries) {
          logger.error(`Task failed: ${this.taskName}, Max retries reached`);
          throw error;
        }

        const shouldRetry = this.shouldRetryFn ? await this.shouldRetryFn(error, attempt) : true;
        if (!shouldRetry) {
          logger.debug(`Task will not be retried: ${this.taskName} (Attempt ${attempt})`);
          throw error;
        }

        if (this.retryCallback) await this.retryCallback(error, attempt);

        logger.debug(`Waiting for ${delay}ms before retrying task: ${this.taskName}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= this.backoffFactor;
        attempt++;
      }
    }

    throw new InternalError('Retry limit reached');
  }

  async executeRollback(): Promise<void> {
    if (!this.result) throw new InternalError('No result to rollback');
    if (!this.rollbackFn) throw new InternalError('No rollback function provided');
    await this.rollbackFn(this.result);
    Task.logger.debug(`Rollback executed for task: ${this.taskName}`);
  }
}
