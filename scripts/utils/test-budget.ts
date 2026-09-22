/**
 * Importing npm packages
 */
import fs from 'node:fs';

/**
 * Importing user defined packages
 */
import { formatDuration, log } from './logger.ts';

/**
 * Defining types
 */
export interface TestCaseTiming {
  /** Repo-relative test file, taken from the `<testcase>` element's own `file` attribute. */
  file: string;
  /** The `describe` chain bun records as `classname` — empty for a top-level `test()`. */
  classname: string;
  name: string;
  ms: number;
}

export interface TestBudgetReport {
  /** Total wall time bun reports on the root `<testsuites>` element. */
  wallMs: number;
  cases: TestCaseTiming[];
}

export interface TestBudgetOptions {
  /** Fails the step when true and any test exceeds `ciCapMs`. Otherwise over-budget tests only warn. */
  ci: boolean;
  /** Tests at or under this many milliseconds don't appear in the report. Default 10. */
  budgetMs?: number;
  /** Any test over this many milliseconds fails the step under `ci`. Default 50. */
  ciCapMs?: number;
}

/**
 * Declaring the constants
 */
export const DEFAULT_BUDGET_MS = 10;
export const DEFAULT_CI_CAP_MS = 50;

/** Named XML entities bun's junit reporter emits — the only ones a `<testcase>` attribute can contain. */
const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const TESTSUITES_TAG_PATTERN = /<testsuites\b([^>]*)>/;
const TESTCASE_TAG_PATTERN = /<testcase\b([^>]*)>/g;
const ATTRIBUTE_PATTERN = /(\w+)="([^"]*)"/g;

/**
 * Decodes `&amp; &lt; &gt; &quot; &apos;` in one pass, so a decoded `&amp;` is never re-scanned as the
 * start of another entity — the same guarantee a real XML parser gives, without pulling one in for five
 * well-known entities over an attribute value that can't legally contain anything else.
 */
function decodeXmlEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (_match, entity: string) => XML_ENTITIES[entity] as string);
}

/** An opening or self-closing tag never contains a literal `>` outside its attributes — they're escaped — so `[^>]*` safely bounds it. */
function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of raw.matchAll(ATTRIBUTE_PATTERN)) attributes[match[1] as string] = decodeXmlEntities(match[2] as string);
  return attributes;
}

/**
 * Parses the `<testsuites>`/`<testcase>` attributes bun's `--reporter=junit` writes — not a general XML
 * parser, just the handful of attributes this report carries, each a `time` in fractional seconds.
 * `classname` comes out of bun double-escaped (`A &amp;gt; B` for a chain that should read `A > B`) —
 * `name` and `file` don't have this problem, so only `classname` gets a second decode pass.
 */
export function parseJunitReport(xml: string): TestBudgetReport {
  const rootAttributes = parseAttributes(TESTSUITES_TAG_PATTERN.exec(xml)?.[1] ?? '');
  const cases = [...xml.matchAll(TESTCASE_TAG_PATTERN)].map(match => {
    const attributes = parseAttributes(match[1] as string);
    return { file: attributes.file ?? '', classname: decodeXmlEntities(attributes.classname ?? ''), name: attributes.name ?? '', ms: Number(attributes.time ?? '0') * 1000 };
  });

  return { wallMs: Number(rootAttributes.time ?? '0') * 1000, cases };
}

function formatOffender(offender: TestCaseTiming): string {
  const location = offender.classname ? `${offender.file} (${offender.classname})` : offender.file;
  return `  ${location} — ${offender.name} — ${offender.ms.toFixed(2)}ms`;
}

/**
 * Reads and reports the junit budget for one `bun test` run: every test over `budgetMs`, slowest first,
 * then a one-line summary. Under `ci`, a test over `ciCapMs` fails the step — the caller's own hang guard
 * is set well above `ciCapMs`, so this is what actually enforces the budget, with a clearer failure
 * message than a raw timeout would give.
 */
export function reportTestBudget(outfilePath: string, options: TestBudgetOptions): boolean {
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const ciCapMs = options.ciCapMs ?? DEFAULT_CI_CAP_MS;

  const report = parseJunitReport(fs.readFileSync(outfilePath, 'utf-8'));
  const offenders = report.cases.filter(testCase => testCase.ms > budgetMs).sort((a, b) => b.ms - a.ms);

  if (offenders.length > 0) {
    log.warn(`\n${offenders.length} test(s) over the ${budgetMs}ms budget, slowest first:`);
    offenders.forEach(offender => log.warn(formatOffender(offender)));
  }
  log.info(`tests: ${report.cases.length}, over budget: ${offenders.length}, wall: ${formatDuration(report.wallMs)}`);

  const ciOffenders = offenders.filter(offender => offender.ms > ciCapMs);
  if (!options.ci || ciOffenders.length === 0) return true;

  log.error(`\n${ciOffenders.length} test(s) over the ${ciCapMs}ms ci cap:`);
  ciOffenders.forEach(offender => log.error(formatOffender(offender)));
  return false;
}
