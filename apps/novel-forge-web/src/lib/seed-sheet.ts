import { type FieldProvenanceResponse, type SeedFieldsResponse } from './apis/api-types.gen';

export type SheetFieldKey = keyof SeedFieldsResponse;
export type SheetStage = 'blank' | 'started' | 'settled';
type SourceIntent = 'success' | 'info' | 'accent';
export type ReadinessIntent = 'success' | 'warning' | 'danger';

export interface SheetField {
  key: SheetFieldKey;
  label: string;
}

export const SHEET_FIELDS: readonly SheetField[] = [
  { key: 'workingTitle', label: 'Working title' },
  { key: 'genre', label: 'Genre' },
  { key: 'premise', label: 'Premise' },
  { key: 'hook', label: 'Hook' },
  { key: 'castShape', label: 'Cast shape' },
  { key: 'protagonistDrive', label: 'What they want' },
  { key: 'stakes', label: 'Stakes' },
  { key: 'progressionSystem', label: 'Progression' },
  { key: 'voice', label: 'Voice' },
  { key: 'themes', label: 'Themes' },
  { key: 'serializationNotes', label: 'Serialization' },
];

export const SOURCE_INTENT: Record<FieldProvenanceResponse['source'], SourceIntent> = { author: 'success', studio: 'info', crossed: 'accent' };

const SOURCE_LABEL: Record<FieldProvenanceResponse['source'], string> = { author: 'yours', studio: 'studio', crossed: 'crossed' };

const READINESS_INTENT: Record<SheetStage, ReadinessIntent> = { blank: 'danger', started: 'warning', settled: 'success' };

export function fieldValue(fields: SeedFieldsResponse, key: SheetFieldKey): string | undefined {
  const value = fields[key];
  if (Array.isArray(value)) return value.length > 0 ? value.join(' · ') : undefined;
  return value?.trim() || undefined;
}

export function provenanceText(provenance: FieldProvenanceResponse): string {
  const source = SOURCE_LABEL[provenance.source];
  return provenance.turnOrdinal === null ? source : `${source} · turn ${provenance.turnOrdinal}`;
}

export interface SheetReadiness {
  stage: SheetStage;
  settled: number;
  total: number;
  /** Labels of the fields still unset, in sheet order. */
  missing: readonly string[];
}

export function sheetReadiness(fields: SeedFieldsResponse): SheetReadiness {
  const missing = SHEET_FIELDS.filter(field => fieldValue(fields, field.key) === undefined).map(field => field.label);
  const total = SHEET_FIELDS.length;
  const settled = total - missing.length;
  const stage: SheetStage = settled === 0 ? 'blank' : missing.length === 0 ? 'settled' : 'started';
  return { stage, settled, total, missing };
}

export function readinessIntent(readiness: SheetReadiness): ReadinessIntent {
  return READINESS_INTENT[readiness.stage];
}

export function settledSummary(readiness: SheetReadiness): string {
  return `${readiness.settled} of ${readiness.total} settled`;
}

export function readinessHeadline(readiness: SheetReadiness): string {
  if (readiness.stage === 'blank') return 'Nothing settled yet';
  if (readiness.stage === 'settled') return 'Every field settled';
  return settledSummary(readiness);
}

/** Names the first two gaps and counts the rest, so a barely-started seed says what to answer next instead of listing eleven labels. */
export function missingSummary(missing: readonly string[]): string | undefined {
  const [first, second, ...rest] = missing;
  if (first === undefined) return undefined;
  if (second === undefined) return `${first} still to settle.`;
  if (rest.length === 0) return `${first} and ${second} still to settle.`;
  return `${first}, ${second} and ${rest.length} more still to settle.`;
}
