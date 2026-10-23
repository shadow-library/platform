import { getTableName } from 'drizzle-orm';
import { type AnyPgColumn } from 'drizzle-orm/pg-core';

export type SensitivityClass = 'most-sensitive' | 'sensitive' | 'health' | 'financial';

export interface SensitiveColumn {
  table: string;
  column: string;
  classification: SensitivityClass;
}

const manifest: SensitiveColumn[] = [];

/** Records a column in the sensitivity manifest (telemetry canary test, AI no-verbatim-quote list, export assembler, log redaction); call after the owning `pgTable(...)`. */
export function sensitive<T extends AnyPgColumn>(column: T, classification: SensitivityClass): T {
  manifest.push({ table: getTableName(column.table), column: column.name, classification });
  return column;
}

export function getSensitivityManifest(): readonly SensitiveColumn[] {
  return manifest;
}
