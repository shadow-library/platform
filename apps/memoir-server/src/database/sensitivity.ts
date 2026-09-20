import { getTableName } from 'drizzle-orm';
import { type AnyPgColumn } from 'drizzle-orm/pg-core';

export type SensitivityClass = 'most-sensitive' | 'sensitive' | 'health' | 'financial';

export interface SensitiveColumn {
  table: string;
  column: string;
  classification: SensitivityClass;
}

const manifest: SensitiveColumn[] = [];

/**
 * Marks a schema column as carrying sensitive data (ARCHITECTURE §23) and records it in a
 * machine-readable manifest — consumed by the telemetry canary test, the AI post-filter's
 * no-verbatim-quote list, the export assembler, and log redaction (T-28). Call after the owning
 * `pgTable(...)` so the column carries its real name and table reference; returns the column
 * unchanged so it composes with `table.column` call sites.
 */
export function sensitive<T extends AnyPgColumn>(column: T, classification: SensitivityClass): T {
  manifest.push({ table: getTableName(column.table), column: column.name, classification });
  return column;
}

export function getSensitivityManifest(): readonly SensitiveColumn[] {
  return manifest;
}
