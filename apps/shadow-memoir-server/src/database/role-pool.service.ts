import { SQL } from 'bun';
import { type BunSQLDatabase, drizzle } from 'drizzle-orm/bun-sql';
import { Injectable, OnModuleDestroy } from '@shadow-library/app';
import { AppError, Config } from '@shadow-library/common';

import * as schema from './schemas';

export type MemoirRole = 'memoir_ai' | 'memoir_billing';

type RoleDatabase = BunSQLDatabase<typeof schema>;

declare module '@shadow-library/common' {
  interface ConfigRecords {
    'database.postgres.ai-url'?: string;
    'database.postgres.billing-url'?: string;
  }
}

Config.load('database.postgres.ai-url');
Config.load('database.postgres.billing-url');

const CONFIG_KEY: Record<MemoirRole, 'database.postgres.ai-url' | 'database.postgres.billing-url'> = {
  memoir_ai: 'database.postgres.ai-url',
  memoir_billing: 'database.postgres.billing-url',
};

/**
 * Dedicated per-role connection pools (ARCHITECTURE §5.4): the AI batch module and the billing webhook
 * module each read/write through a separate physical connection pool bound to their own least-privilege
 * Postgres role, rather than the API path's default `memoir_api` pool. One `BunSQLDatabase` client per
 * role, created lazily on first request and cached so a module's repeated `getPool(role)` calls share
 * one underlying connection pool. In-process today (ARCHITECTURE §29); the worker split later moves the
 * `memoir_ai` pool into its own Deployment without changing this contract, since callers already resolve
 * their pool by role rather than by holding a shared client.
 */
@Injectable()
export class RolePoolService implements OnModuleDestroy {
  private readonly pools = new Map<MemoirRole, RoleDatabase>();

  getPool(role: MemoirRole): RoleDatabase {
    const existing = this.pools.get(role);
    if (existing) return existing;

    const url = Config.get(CONFIG_KEY[role]);
    if (!url) throw AppError.internal(`No connection string configured for role '${role}' (${CONFIG_KEY[role]})`);

    const client = new SQL(url);
    const pool = drizzle({ client, schema });
    this.pools.set(role, pool);
    return pool;
  }

  async onModuleDestroy(): Promise<void> {
    for (const pool of this.pools.values()) await (pool as unknown as { $client: SQL }).$client.close();
    this.pools.clear();
  }
}
