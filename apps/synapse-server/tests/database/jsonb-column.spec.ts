import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { catalogVersions } from '@server/database/schemas';

describe('catalog_versions.document', () => {
  const db = drizzle.mock();

  it('should bind the document as JSON text cast through text to jsonb, so it is never stored as a JSON string scalar', () => {
    const query = db
      .insert(catalogVersions)
      .values({ version: 1, document: { tasks: { 'novel-forge.chat': { routes: [{ model: 'm' }] } } } })
      .toSQL();
    expect(query.sql).toContain('::text::jsonb');
    expect(query.params).toContain('{"tasks":{"novel-forge.chat":{"routes":[{"model":"m"}]}}}');
  });

  it('should cast the bound JSON text in an update and a comparison', () => {
    const query = db
      .update(catalogVersions)
      .set({ document: { a: 1 } })
      .where(eq(catalogVersions.document, [2]))
      .toSQL();
    expect(query.sql).toBe('update "catalog_versions" set "document" = $1::text::jsonb where "catalog_versions"."document" = $2::text::jsonb');
    expect(query.params).toEqual(['{"a":1}', '[2]']);
  });

  it('should pass a document the driver already parsed through unchanged', () => {
    const parsed = { providers: {} };
    expect(catalogVersions.document.mapFromDriverValue(parsed)).toBe(parsed);
  });
});
