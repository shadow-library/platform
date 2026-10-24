import { CHANGE_LABELS, type CostBasis, type UsageChange, type UsageRowView } from './usage-report';
import { USAGE_GROUP_LABELS, type UsageGroup } from './usage-search';

export type CsvCell = string | number | null;

/** Excel opens a CSV as the system code page unless it starts with a UTF-8 byte-order mark, which garbles names like "Novel Forge · Chat". */
export const CSV_BOM = '\uFEFF';

const NEEDS_QUOTES = /[",\r\n]/;
/** Spreadsheets run a cell that starts with one of these as a formula, so text from the ledger must never start a cell with one. */
const FORMULA_START = /^[=+\-@\t\r]/;
const SIGNIFICANT_DIGITS = 12;

const GROUP_SLUGS: Readonly<Record<UsageGroup, string>> = { app: 'app', task: 'feature', alias: 'model-name', model: 'model', provider: 'provider' };

function textField(value: string): string {
  const guarded = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

function numberField(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toPrecision(SIGNIFICANT_DIGITS))) : '';
}

/** Numbers stay bare so a negative change still reads as a number; only text is guarded against formulas. */
export function csvField(cell: CsvCell): string {
  if (cell === null) return '';
  return typeof cell === 'number' ? numberField(cell) : textField(cell);
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return [header, ...rows].map(row => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

const COMPARISON_LABELS: Readonly<Record<UsageChange['kind'], string>> = { delta: 'Compared', new: 'New this period', unavailable: 'No comparison' };

function changeCell(change: UsageChange): CsvCell {
  return change.kind === 'unavailable' ? null : change.usd;
}

export function usageCsv(rows: readonly UsageRowView[], group: UsageGroup, basis: CostBasis): string {
  const header = [
    `${USAGE_GROUP_LABELS[group]} key`,
    USAGE_GROUP_LABELS[group],
    'Billed spend (USD)',
    'API-price cost (USD)',
    `${CHANGE_LABELS[basis]} (USD)`,
    'Previous period',
    'Calls',
    'Avg API-price cost per call (USD)',
    'Input tokens',
    'Cached input tokens',
    'Output tokens',
    'Reasoning tokens',
  ];
  const body = rows.map(row => [
    row.key,
    row.name,
    row.billedCostUsd,
    row.listCostUsd,
    changeCell(row.change),
    COMPARISON_LABELS[row.change.kind],
    row.calls,
    row.averageListCost,
    row.inputTokens,
    row.cachedInputTokens,
    row.outputTokens,
    row.reasoningTokens,
  ]);
  return toCsv(header, body);
}

export function usageCsvFilename(firstDay: string, lastDay: string, group: UsageGroup): string {
  return `synapse-usage-${firstDay}_${lastDay}-by-${GROUP_SLUGS[group]}.csv`;
}
