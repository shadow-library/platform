import { sql } from 'drizzle-orm';
import { customType } from 'drizzle-orm/pg-core';

/** `::text::jsonb` pins the parameter type, so Postgres parses the JSON exactly once with or without prepared statements. */
export const jsonb = customType<{ data: unknown; driverData: unknown }>({
  dataType() {
    return 'jsonb';
  },
  toDriver(value: unknown) {
    return sql`${JSON.stringify(value)}::text::jsonb`;
  },
  fromDriver(value: unknown): unknown {
    return value;
  },
});
