import { sql } from 'drizzle-orm';
import { customType } from 'drizzle-orm/pg-core';

/** `::text::jsonb` makes Postgres parse the JSON once with or without prepared statements; audit rows stay double-encoded as recorded evidence, so reads unwrap them. */
export const jsonb = customType<{ data: unknown; driverData: unknown }>({
  dataType() {
    return 'jsonb';
  },
  toDriver(value: unknown) {
    return sql`${JSON.stringify(value)}::text::jsonb`;
  },
  fromDriver(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null ? parsed : value;
    } catch {
      return value;
    }
  },
});
