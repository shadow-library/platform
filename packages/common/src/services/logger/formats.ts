/* istanbul ignore file */
/**
 * Importing npm packages
 */
import colors from '@colors/colors';
import { format, Logform } from 'winston';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type Format = Logform.Format;

export interface BriefFormatOptions {
  label?: boolean;
  timestamp?: boolean;
  stack?: boolean;
}

export interface SerialiseErrorsOptions {
  /** How deep to walk nested objects and arrays looking for errors. Defaults to 4. */
  depth?: number;
}

declare module 'winston' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace format {
    function brief(opts?: BriefFormatOptions): Format;
    function serialiseErrors(opts?: SerialiseErrorsOptions): Format;
  }
}

/**
 * Declaring the constants
 */
let timestamp: number;

const ERROR_KEYS = ['name', 'message', 'stack', 'code'] as const;

function padLevel(level: string) {
  const rawLevel = level.slice(5, -5);
  const padding = '   '.substring(0, 5 - rawLevel.length);
  return level.replace(rawLevel, rawLevel.toUpperCase() + padding);
}

// `message`, `stack` and `name` are non-enumerable on Error, so an error parked in log metadata
// serialises to `{}` and the cause is lost. Winston's own `errors` format only unwraps an error passed
// as the log entry itself, never one nested in the metadata, which is where every caller here puts it.
function toPlainError(error: Error): Record<string, unknown> {
  const plain: Record<string, unknown> = {};
  for (const key of ERROR_KEYS) {
    const value = (error as unknown as Record<string, unknown>)[key];
    if (value !== undefined) plain[key] = value;
  }
  for (const key of Object.keys(error)) plain[key] ??= (error as unknown as Record<string, unknown>)[key];
  if (error.cause instanceof Error) plain.cause = toPlainError(error.cause);
  return plain;
}

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value instanceof Error) return toPlainError(value);
  if (depth <= 0 || typeof value !== 'object' || value === null) return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map(entry => walk(entry, depth - 1, seen));
  const mapped: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) mapped[key] = walk(entry, depth - 1, seen);
  return mapped;
}

format.serialiseErrors = function (opts: SerialiseErrorsOptions = {}) {
  const depth = opts.depth ?? 4;
  return format(info => {
    const seen = new WeakSet<object>();
    for (const [key, value] of Object.entries(info)) {
      if (key === 'level' || key === 'message') continue;
      const mapped = walk(value, depth, seen);
      if (mapped !== value) (info as Record<string, unknown>)[key] = mapped;
    }
    return info;
  })();
};

format.brief = function (opts: BriefFormatOptions = {}) {
  const printLabel = opts.label ?? true;
  const printTimestamp = opts.timestamp ?? true;
  const printStack = opts.stack ?? true;

  return format.printf(info => {
    const level = info.level;
    const prevTime = timestamp;
    timestamp = Date.now();
    const timeTaken = prevTime ? colors.gray(` +${timestamp - prevTime}ms`) : '';
    const stack = info.stack ? '\n' + (Array.isArray(info.stack) ? info.stack.join('\n') : info.stack) : '';

    if (level === 'http') return colors.cyan(`${padLevel('HTTP')} [REST] ${info.method} ${info.url} - ${info.timeTaken}ms`);

    const message = [padLevel(level)];
    if (printLabel) message.push(colors.yellow(`[${info.label || '-'}]`));
    message.push(info.message as string);
    if (printTimestamp) message.push(timeTaken);
    if (printStack) message.push(stack);
    return message.join(' ');
  });
};

export { format };
