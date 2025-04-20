/**
 * Importing npm packages
 */
import { Promisable } from 'type-fest';

/**
 * Importing user defined packages
 */
import { InternalError } from '@lib/errors';
import { Fn } from '@lib/interfaces';

/**
 * Defining types
 */

export type RetryCallback = (error: unknown, attempt: number) => Promisable<unknown>;

export type RollbackFn<T> = (data: T) => Promisable<unknown>;

/**
 * Declaring the constants
 */

export class TaskExecutor<T> {
  private retries = 3;
  private delayMs = 1000;
  private backoffFactor = 1;

  private result?: T;
  private retryCallback?: RetryCallback;
  private rollbackFn?: RollbackFn<T>;

  private constructor(private readonly fn: Fn<T>) {}

  static create<T>(fn: Fn<T>): TaskExecutor<T> {
    return new TaskExecutor(fn);
  }

  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  protected shouldRetry(_error: unknown, _attempt: number): Promisable<boolean> {
    return true;
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

  rollback(rollbackFn: RollbackFn<T>): this {
    this.rollbackFn = rollbackFn;
    return this;
  }

  async execute(): Promise<T> {
    let attempt = 1;
    let delay = this.delayMs;

    while (attempt <= this.retries) {
      try {
        this.result = await this.fn();
        return this.result;
      } catch (error) {
        if (attempt === this.retries) throw error;
        const shouldRetry = await this.shouldRetry(error, attempt);
        if (!shouldRetry) throw error;

        if (this.retryCallback) await this.retryCallback(error, attempt);
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
  }
}
