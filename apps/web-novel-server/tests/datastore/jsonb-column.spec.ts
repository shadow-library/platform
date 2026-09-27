import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { pgTable, serial } from 'drizzle-orm/pg-core';

import { jsonb } from '@modules/datastore/schemas/jsonb';

describe('jsonb column', () => {
  const documents = pgTable('documents', { id: serial('id').primaryKey(), body: jsonb('body') });
  const db = drizzle.mock();

  it('should bind an object as JSON text cast through text to jsonb', () => {
    const query = db
      .insert(documents)
      .values({ body: { steps: [1, { done: true }] } })
      .toSQL();
    expect(query.sql).toContain('$1::text::jsonb');
    expect(query.params).toEqual(['{"steps":[1,{"done":true}]}']);
  });

  it('should bind arrays and scalars as their JSON text', () => {
    const query = db
      .insert(documents)
      .values([{ body: ['a'] }, { body: 'plain' }, { body: 5 }, { body: false }])
      .toSQL();
    expect(query.params).toEqual(['["a"]', '"plain"', '5', 'false']);
  });

  it('should bind null as a bare null parameter', () => {
    const query = db.insert(documents).values({ body: null }).toSQL();
    expect(query.params).toEqual([null]);
  });

  it('should cast the bound JSON text in an update and a comparison', () => {
    const query = db
      .update(documents)
      .set({ body: { a: 1 } })
      .where(eq(documents.body, [2]))
      .toSQL();
    expect(query.sql).toBe('update "documents" set "body" = $1::text::jsonb where "documents"."body" = $2::text::jsonb');
    expect(query.params).toEqual(['{"a":1}', '[2]']);
  });

  it('should pass a value the driver already parsed through unchanged, a string scalar included', () => {
    const parsed = { a: [1] };
    expect(documents.body.mapFromDriverValue(parsed)).toBe(parsed);
    expect(documents.body.mapFromDriverValue('{"a":1}')).toBe('{"a":1}');
  });
});
