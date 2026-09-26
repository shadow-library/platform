import { describe, expect, it } from 'bun:test';
import { and, asc, between, desc, eq, gt, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from 'drizzle-orm';

import { schema } from '@server/database';

import { matchesWhere, queryRows } from './sql-filter';

const briefs = schema.briefs;
const rows = [
  { projectId: 7n, chapter: 1, volumeKey: 'volume_1' },
  { projectId: 7n, chapter: 2, volumeKey: null },
  { projectId: 7n, chapter: 3, volumeKey: 'volume_2' },
  { projectId: 8n, chapter: 4, volumeKey: 'volume_1' },
];
const chapters = (where: Parameters<typeof matchesWhere>[1]): number[] => rows.filter(row => matchesWhere(row, where)).map(row => row.chapter);

describe('matchesWhere', () => {
  it('should read comparisons, null checks and their and-combination', () => {
    expect(chapters(and(eq(briefs.projectId, 7n), lte(briefs.chapter, 2)))).toEqual([1, 2]);
    expect(chapters(and(eq(briefs.projectId, 7n), isNotNull(briefs.volumeKey)))).toEqual([1, 3]);
    expect(chapters(isNull(briefs.volumeKey))).toEqual([2]);
    expect(chapters(ne(briefs.volumeKey, 'volume_1'))).toEqual([3]);
  });

  it('should read or as or, nested inside and', () => {
    expect(chapters(and(eq(briefs.projectId, 7n), or(eq(briefs.chapter, 1), gt(briefs.chapter, 2))))).toEqual([1, 3]);
  });

  it('should read between and in lists, and match nothing for an empty list', () => {
    expect(chapters(between(briefs.chapter, 2, 3))).toEqual([2, 3]);
    expect(chapters(inArray(briefs.chapter, [1, 4]))).toEqual([1, 4]);
    expect(chapters(notInArray(briefs.chapter, [1, 4]))).toEqual([2, 3]);
    expect(chapters(inArray(briefs.chapter, []))).toEqual([]);
  });

  it('should refuse a fragment it cannot read rather than match it', () => {
    expect(() => chapters(eq(briefs.chapter, briefs.revision))).toThrow('unsupported filter fragment');
    expect(() => chapters(eq(sql`lower(${briefs.title})`, 'x'))).toThrow('unsupported filter fragment');
  });
});

describe('queryRows', () => {
  it('should order by an asc/desc expression or a bare column', () => {
    expect(queryRows(rows, { orderBy: desc(briefs.chapter) }).map(row => row.chapter)).toEqual([4, 3, 2, 1]);
    expect(queryRows(rows, { orderBy: [asc(briefs.projectId), desc(briefs.chapter)] }).map(row => row.chapter)).toEqual([3, 2, 1, 4]);
    expect(queryRows([...rows].reverse(), { orderBy: briefs.chapter }).map(row => row.chapter)).toEqual([1, 2, 3, 4]);
  });

  it('should refuse an order it cannot read', () => {
    expect(() => queryRows(rows, { orderBy: sql`random()` })).toThrow('unsupported orderBy');
  });
});
