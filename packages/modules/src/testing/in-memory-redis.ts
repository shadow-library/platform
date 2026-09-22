/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { TestingErrorCode } from './testing.errors';

/**
 * Defining types
 */

export type RedisArgument = string | number;

/** One `[error, reply]` pair per queued command, the shape ioredis resolves `exec()` with */
export type RedisTransactionResult = [Error | null, unknown][];

export interface InMemoryRedisOptions {
  /** Clock in epoch milliseconds that expiry is measured against; a test advances it instead of sleeping */
  now?: () => number;
}

interface StringEntry {
  type: 'string';
  value: string;
  expiresAt?: number;
}

interface SetEntry {
  type: 'set';
  members: Set<string>;
  expiresAt?: number;
}

type Entry = StringEntry | SetEntry;

type CommandHandler = (args: string[]) => unknown;

type FindCommand = (command: string) => CommandHandler | undefined;

/**
 * Declaring the constants
 */
const INTEGER_REGEX = /^-?\d+$/;

function parseInteger(value: string): number {
  const parsed = Number(value);
  if (!INTEGER_REGEX.test(value) || !Number.isSafeInteger(parsed)) throw TestingErrorCode.REDIS_NOT_INTEGER.create();
  return parsed;
}

function assertArity(command: string, args: string[], min: number, max = min): void {
  if (args.length < min || args.length > max) throw TestingErrorCode.REDIS_WRONG_ARITY.create({ command });
}

/**
 * A Redis stand-in holding strings and sets in a map, implementing exactly the commands the applications
 * issue. Semantics follow Redis — lazy expiry, `SET` options, integer replies, `WRONGTYPE` — so a service
 * behaves against it as it would against a server; anything else is refused rather than approximated.
 */
export class InMemoryRedis {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;
  private readonly commands = new Map<string, CommandHandler>([
    ['ping', args => (assertArity('ping', args, 0), 'PONG')],
    ['get', args => (assertArity('get', args, 1), this.readString(args[0] as string))],
    ['set', args => this.handleSet(args)],
    ['getdel', args => this.handleGetdel(args)],
    ['del', args => this.handleDel(args)],
    ['incr', args => (assertArity('incr', args, 1), this.handleIncrby(args[0] as string, 1))],
    ['incrby', args => (assertArity('incrby', args, 2), this.handleIncrby(args[0] as string, parseInteger(args[1] as string)))],
    ['mget', args => this.handleMget(args)],
    ['ttl', args => this.handleTtl(args)],
    ['expire', args => this.handleExpire(args)],
    ['sadd', args => this.handleSadd(args)],
    ['srem', args => this.handleSrem(args)],
  ]);

  private readonly findCommand: FindCommand = command => this.commands.get(command.toLowerCase());

  constructor(options: InMemoryRedisOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  private execute(command: string, args: RedisArgument[]): unknown {
    const handler = this.findCommand(command);
    if (!handler) throw TestingErrorCode.REDIS_UNKNOWN_COMMAND.create({ command });
    return handler(args.map(String));
  }

  private lookup(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (entry?.expiresAt === undefined || entry.expiresAt > this.now()) return entry;
    this.entries.delete(key);
    return undefined;
  }

  private readString(key: string): string | null {
    const entry = this.lookup(key);
    if (!entry) return null;
    if (entry.type !== 'string') throw TestingErrorCode.REDIS_WRONG_TYPE.create();
    return entry.value;
  }

  private readSet(key: string): SetEntry | undefined {
    const entry = this.lookup(key);
    if (entry && entry.type !== 'set') throw TestingErrorCode.REDIS_WRONG_TYPE.create();
    return entry;
  }

  private parseExpiry(command: string, value: string | undefined, unitMs: number): number {
    if (value === undefined) throw TestingErrorCode.REDIS_SYNTAX.create();
    const amount = parseInteger(value);
    if (amount <= 0) throw TestingErrorCode.REDIS_INVALID_EXPIRE.create({ command });
    return amount * unitMs;
  }

  private handleSet(args: string[]): 'OK' | null {
    assertArity('set', args, 2, Infinity);
    const [key, value, ...options] = args as [string, string, ...string[]];
    let ttlMs: number | undefined;
    let condition: 'NX' | 'XX' | undefined;
    let keepTtl = false;

    for (let index = 0; index < options.length; index++) {
      const option = options[index]?.toUpperCase();
      if ((option === 'EX' || option === 'PX') && ttlMs === undefined && !keepTtl) ttlMs = this.parseExpiry('set', options[++index], option === 'EX' ? 1000 : 1);
      else if ((option === 'NX' || option === 'XX') && condition === undefined) condition = option;
      else if (option === 'KEEPTTL' && ttlMs === undefined) keepTtl = true;
      else throw TestingErrorCode.REDIS_SYNTAX.create();
    }

    const existing = this.lookup(key);
    if (condition === 'NX' && existing) return null;
    if (condition === 'XX' && !existing) return null;

    const expiresAt = ttlMs === undefined ? (keepTtl ? existing?.expiresAt : undefined) : this.now() + ttlMs;
    this.entries.set(key, { type: 'string', value, expiresAt });
    return 'OK';
  }

  private handleGetdel(args: string[]): string | null {
    assertArity('getdel', args, 1);
    const key = args[0] as string;
    const value = this.readString(key);
    if (value !== null) this.entries.delete(key);
    return value;
  }

  private handleDel(args: string[]): number {
    assertArity('del', args, 1, Infinity);
    return args.filter(key => this.lookup(key) && this.entries.delete(key)).length;
  }

  private handleIncrby(key: string, increment: number): number {
    const current = this.readString(key);
    const result = (current === null ? 0 : parseInteger(current)) + increment;
    if (!Number.isSafeInteger(result)) throw TestingErrorCode.REDIS_NOT_INTEGER.create();
    this.entries.set(key, { type: 'string', value: String(result), expiresAt: this.lookup(key)?.expiresAt });
    return result;
  }

  private handleMget(args: string[]): (string | null)[] {
    assertArity('mget', args, 1, Infinity);
    return args.map(key => {
      const entry = this.lookup(key);
      return entry?.type === 'string' ? entry.value : null;
    });
  }

  private handleTtl(args: string[]): number {
    assertArity('ttl', args, 1);
    const entry = this.lookup(args[0] as string);
    if (!entry) return -2;
    if (entry.expiresAt === undefined) return -1;
    return Math.floor((entry.expiresAt - this.now() + 500) / 1000);
  }

  private handleExpire(args: string[]): 0 | 1 {
    assertArity('expire', args, 2, 3);
    const [key, seconds, flag] = args as [string, string, string | undefined];
    const ttlSeconds = parseInteger(seconds);
    const condition = flag?.toUpperCase();
    if (condition !== undefined && condition !== 'NX' && condition !== 'XX') throw TestingErrorCode.REDIS_SYNTAX.create();

    const entry = this.lookup(key);
    if (!entry) return 0;
    if (condition === 'NX' && entry.expiresAt !== undefined) return 0;
    if (condition === 'XX' && entry.expiresAt === undefined) return 0;

    if (ttlSeconds <= 0) this.entries.delete(key);
    else entry.expiresAt = this.now() + ttlSeconds * 1000;
    return 1;
  }

  private handleSadd(args: string[]): number {
    assertArity('sadd', args, 2, Infinity);
    const [key, ...members] = args as [string, ...string[]];
    const entry = this.readSet(key) ?? { type: 'set', members: new Set<string>() };
    const before = entry.members.size;
    for (const member of members) entry.members.add(member);
    this.entries.set(key, entry);
    return entry.members.size - before;
  }

  private handleSrem(args: string[]): number {
    assertArity('srem', args, 2, Infinity);
    const [key, ...members] = args as [string, ...string[]];
    const entry = this.readSet(key);
    if (!entry) return 0;
    const removed = members.filter(member => entry.members.delete(member)).length;
    if (entry.members.size === 0) this.entries.delete(key);
    return removed;
  }

  async ping(): Promise<'PONG'> {
    return this.execute('ping', []) as 'PONG';
  }

  async get(key: string): Promise<string | null> {
    return this.execute('get', [key]) as string | null;
  }

  /** Accepts Redis's `SET` options as ioredis passes them: `EX`/`PX` with a positive integer, `NX`/`XX`, `KEEPTTL` */
  async set(key: string, value: RedisArgument, ...options: RedisArgument[]): Promise<'OK' | null> {
    return this.execute('set', [key, value, ...options]) as 'OK' | null;
  }

  async getdel(key: string): Promise<string | null> {
    return this.execute('getdel', [key]) as string | null;
  }

  async del(...keys: string[]): Promise<number> {
    return this.execute('del', keys) as number;
  }

  async incr(key: string): Promise<number> {
    return this.execute('incr', [key]) as number;
  }

  async incrby(key: string, increment: number): Promise<number> {
    return this.execute('incrby', [key, increment]) as number;
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return this.execute('mget', keys) as (string | null)[];
  }

  async ttl(key: string): Promise<number> {
    return this.execute('ttl', [key]) as number;
  }

  async sadd(key: string, ...members: RedisArgument[]): Promise<number> {
    return this.execute('sadd', [key, ...members]) as number;
  }

  async srem(key: string, ...members: RedisArgument[]): Promise<number> {
    return this.execute('srem', [key, ...members]) as number;
  }

  async call(command: string, ...args: RedisArgument[]): Promise<unknown> {
    return this.execute(command, args);
  }

  multi(): InMemoryRedisTransaction {
    return new InMemoryRedisTransaction(this.findCommand);
  }
}

/**
 * `MULTI` … `EXEC`: queued commands run back to back with nothing interleaved, a command that fails at
 * runtime yields its error in place, and an unknown command aborts the whole transaction — as Redis does.
 */
export class InMemoryRedisTransaction {
  private readonly queued: [string, RedisArgument[]][] = [];

  constructor(private readonly findCommand: FindCommand) {}

  private queue(command: string, args: RedisArgument[]): this {
    this.queued.push([command, args]);
    return this;
  }

  incr(key: string): this {
    return this.queue('incr', [key]);
  }

  ttl(key: string): this {
    return this.queue('ttl', [key]);
  }

  call(command: string, ...args: RedisArgument[]): this {
    return this.queue(command, args);
  }

  async exec(): Promise<RedisTransactionResult> {
    const steps = this.queued.map(([command, args]) => ({ command, args: args.map(String), handler: this.findCommand(command) }));
    const unknown = steps.find(step => !step.handler);
    if (unknown) throw TestingErrorCode.REDIS_UNKNOWN_COMMAND.create({ command: unknown.command });

    return steps.map(({ args, handler }): [Error | null, unknown] => {
      try {
        return [null, handler?.(args)];
      } catch (error) {
        return [error as Error, null];
      }
    });
  }
}
