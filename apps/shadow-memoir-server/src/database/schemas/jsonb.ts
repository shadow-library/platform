import { customType } from 'drizzle-orm/pg-core';

/**
 * Drop-in replacement for drizzle's `jsonb` for the bun-sql driver. Drizzle's built-in helper
 * JSON-stringifies values and bun-sql then encodes that string AGAIN, so every value lands in
 * Postgres as a jsonb string scalar — reads round-trip transparently, but in-database jsonb
 * operators (`||` merges, `->` paths, containment) all misbehave. Passing the raw value through
 * lets the driver serialize exactly once.
 */
export const jsonb = customType<{ data: unknown; driverData: unknown }>({
  dataType() {
    return 'jsonb';
  },
  toDriver(value: unknown): unknown {
    return value;
  },
  fromDriver(value: unknown): unknown {
    return value;
  },
});
