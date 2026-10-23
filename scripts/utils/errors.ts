import { log } from './logger.ts';

export interface ShadowErrorOptions {
  exitCode?: number;
  cause?: unknown;
}

export class ShadowError extends Error {
  readonly exitCode: number;

  constructor(message: string, options: ShadowErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'ShadowError';
    this.exitCode = options.exitCode ?? 1;
  }
}

export function reportError(error: unknown): number {
  if (error instanceof ShadowError) {
    log.error(error.message);
    return error.exitCode;
  }
  log.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  return 1;
}
