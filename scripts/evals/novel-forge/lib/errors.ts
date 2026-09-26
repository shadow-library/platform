import { ShadowError } from '../../../utils/index.ts';

export class EvalError extends ShadowError {
  constructor(message: string, options: { exitCode?: number; cause?: unknown } = {}) {
    super(message, options);
    this.name = 'EvalError';
  }
}

export class ForgeApiError extends EvalError {
  readonly status: number;
  readonly code: string | undefined;

  constructor(method: string, route: string, status: number, code: string | undefined, detail: string) {
    super(`${method} ${route} answered ${status}${code ? ` ${code}` : ''}: ${detail}`);
    this.name = 'ForgeApiError';
    this.status = status;
    this.code = code;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
