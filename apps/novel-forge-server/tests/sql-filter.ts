import { Column, is, SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

type Row = Record<string, unknown>;
type Predicate = (row: Row, excluded?: Row) => boolean;

const dialect = new PgDialect();
const COLUMN = String.raw`(?:"\w+"\.)?"(\w+)"`;
const PREDICATES: { pattern: RegExp; build: (match: RegExpExecArray, params: unknown[]) => Predicate }[] = [
  { pattern: /^(true|false)\b/, build: match => () => match[1] === 'true' },
  {
    pattern: new RegExp(`^${COLUMN} between \\$(\\d+) and \\$(\\d+)`),
    build: (match, params) => row => within(row, match[1], params[Number(match[2]) - 1], params[Number(match[3]) - 1]),
  },
  {
    pattern: new RegExp(`^${COLUMN} (not )?in \\(((?:\\$\\d+(?:, )?)+)\\)`),
    build: (match, params) => row => {
      const allowed = (match[3] as string).split(', ').map(ref => String(params[Number(ref.slice(1)) - 1]));
      const value = row[camel(match[1])];
      if (value === null || value === undefined) return false;
      return allowed.includes(String(value)) !== Boolean(match[2]);
    },
  },
  {
    pattern: new RegExp(`^${COLUMN} is (not )?distinct from ${COLUMN}`),
    build: match => row => (String(row[camel(match[1])] ?? null) !== String(row[camel(match[3])] ?? null)) !== Boolean(match[2]),
  },
  { pattern: new RegExp(`^${COLUMN} is (not )?null`), build: match => row => isNullish(row[camel(match[1])]) !== Boolean(match[2]) },
  { pattern: /^"\w+"\.xmin::text = \$(\d+)/, build: (match, params) => row => String(row['xmin']) === String(params[Number(match[1]) - 1]) },
  {
    pattern: new RegExp(`^${COLUMN} (not )?like \\$(\\d+)`),
    build: (match, params) => row => {
      const value = row[camel(match[1])];
      if (typeof value !== 'string') return false;
      return likePattern(String(params[Number(match[3]) - 1])).test(value) !== Boolean(match[2]);
    },
  },
  {
    pattern: new RegExp(`^${COLUMN} (=|<>|<=|>=|<|>) \\$(\\d+)`),
    build: (match, params) => row => compare(row[camel(match[1])], match[2] as string, params[Number(match[3]) - 1]),
  },
  {
    pattern: new RegExp(`^excluded\\.(\\w+) (=|<>|<=|>=|<|>) ${COLUMN}`),
    build: match => (row, excluded) => {
      if (!excluded) throw new Error('sql-filter: an `excluded.` comparison needs the conflicting row');
      return compare(excluded[camel(match[1])], match[2] as string, row[camel(match[3])]);
    },
  },
];

function camel(column: string | undefined): string {
  return (column ?? '').replace(/_(\w)/g, (_, letter: string) => letter.toUpperCase());
}

function likePattern(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/%/g, '.*').replace(/_/g, '.')}$`, 's');
}

function isNullish(value: unknown): boolean {
  return value === null || value === undefined;
}

function within(row: Row, column: string | undefined, low: unknown, high: unknown): boolean {
  const value = row[camel(column)];
  return !isNullish(value) && Number(value) >= Number(low) && Number(value) <= Number(high);
}

function compare(left: unknown, operator: string, right: unknown): boolean {
  if (isNullish(left)) return false;
  if (operator === '=') return String(left) === String(right);
  if (operator === '<>') return String(left) !== String(right);
  const [a, b] = [Number(left), Number(right)];
  if (operator === '<=') return a <= b;
  if (operator === '>=') return a >= b;
  if (operator === '<') return a < b;
  return a > b;
}

/** A recursive-descent reading of the `and`/`or` tree drizzle renders; anything it does not recognise throws rather than matching. */
class FilterParser {
  private rest: string;

  constructor(
    sql: string,
    private readonly params: unknown[],
  ) {
    this.rest = sql.trim();
  }

  parse(): Predicate {
    const predicate = this.either();
    if (this.rest !== '') throw new Error(`sql-filter: unsupported filter fragment "${this.rest}"`);
    return predicate;
  }

  private either(): Predicate {
    const terms = [this.both()];
    while (this.take(/^or\b/)) terms.push(this.both());
    return (row, excluded) => terms.some(term => term(row, excluded));
  }

  private both(): Predicate {
    const terms = [this.atom()];
    while (this.take(/^and\b/)) terms.push(this.atom());
    return (row, excluded) => terms.every(term => term(row, excluded));
  }

  private atom(): Predicate {
    if (this.take(/^\(/)) {
      const inner = this.either();
      if (!this.take(/^\)/)) throw new Error(`sql-filter: unbalanced parenthesis before "${this.rest}"`);
      return inner;
    }
    for (const { pattern, build } of PREDICATES) {
      const match = pattern.exec(this.rest);
      if (!match) continue;
      this.rest = this.rest.slice(match[0].length).trimStart();
      return build(match, this.params);
    }
    throw new Error(`sql-filter: unsupported filter fragment "${this.rest}"`);
  }

  private take(token: RegExp): boolean {
    const match = token.exec(this.rest);
    if (!match) return false;
    this.rest = this.rest.slice(match[0].length).trimStart();
    return true;
  }
}

/**
 * Evaluates a drizzle `where` against an in-memory row; a filter it cannot read fails the test instead of matching. An upsert's `setWhere`
 * passes the row it proposed as `excluded`.
 */
export function matchesWhere(row: Row, where: SQL | undefined, excluded?: Row): boolean {
  return compileWhere(where)(row, excluded);
}

/** `matchesWhere` read once, for filtering many rows by the same `where`. */
export function compileWhere(where: SQL | undefined): (row: Row, excluded?: Row) => boolean {
  if (where === undefined) return () => true;
  if (!is(where, SQL)) throw new Error('sql-filter: `where` must be an SQL expression');
  const { sql, params } = dialect.sqlToQuery(where);
  return new FilterParser(sql, params).parse();
}

type OrderTerm = SQL | Column;

function orderKey(term: OrderTerm): { key: string; sign: number } {
  if (is(term, Column)) return { key: camel(term.name), sign: 1 };
  if (!is(term, SQL)) throw new Error('sql-filter: `orderBy` must be a column or an asc/desc expression');
  const match = new RegExp(`^${COLUMN} (asc|desc)$`).exec(dialect.sqlToQuery(term).sql);
  if (!match) throw new Error(`sql-filter: unsupported orderBy "${dialect.sqlToQuery(term).sql}"`);
  return { key: camel(match[1]), sign: match[2] === 'desc' ? -1 : 1 };
}

/** Filters and sorts in-memory rows the way a relational `findMany`/`findFirst` query would. */
export function queryRows<T extends Row>(rows: readonly T[], query: { where?: SQL; orderBy?: OrderTerm | OrderTerm[] } = {}): T[] {
  const matches = compileWhere(query.where);
  const kept = rows.filter(row => matches(row));
  if (query.orderBy === undefined) return kept;
  const keys = (Array.isArray(query.orderBy) ? query.orderBy : [query.orderBy]).map(orderKey);
  return [...kept].sort((left, right) => {
    for (const { key, sign } of keys) {
      const difference = Number(left[key]) - Number(right[key]);
      if (difference !== 0) return sign * difference;
    }
    return 0;
  });
}
