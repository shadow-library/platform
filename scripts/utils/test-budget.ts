import fs from 'node:fs';

import { formatDuration, log } from './logger.ts';

export interface TestCaseTiming {
  file: string;
  classname: string;
  name: string;
  ms: number;
}

export interface TestBudgetReport {
  wallMs: number;
  cases: TestCaseTiming[];
}

export interface TestBudgetOptions {
  /** Fails the step on a test over `ciCapMs` instead of only warning. */
  ci: boolean;
  /** Tests at or under this many milliseconds are omitted from the report. Default 10. */
  budgetMs?: number;
  /** A test over this many milliseconds fails the step under `ci`. Default 50. */
  ciCapMs?: number;
}

export const DEFAULT_BUDGET_MS = 10;
export const DEFAULT_CI_CAP_MS = 50;

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const TESTSUITES_TAG_PATTERN = /<testsuites\b([^>]*)>/;
const TESTCASE_TAG_PATTERN = /<testcase\b([^>]*)>/g;
const ATTRIBUTE_PATTERN = /(\w+)="([^"]*)"/g;

// One pass, so a decoded `&amp;` is never re-scanned as the start of another entity.
function decodeXmlEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (_match, entity: string) => XML_ENTITIES[entity] as string);
}

function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of raw.matchAll(ATTRIBUTE_PATTERN)) attributes[match[1] as string] = decodeXmlEntities(match[2] as string);
  return attributes;
}

// bun's junit reporter double-escapes `classname` (`A &amp;gt; B`), so only it gets a second decode pass.
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

// verify.ts's bun `--timeout` is only a hang guard set above `ciCapMs`; this is what enforces the cap.
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
