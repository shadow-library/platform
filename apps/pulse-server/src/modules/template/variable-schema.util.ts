/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { type Template } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/** Representative values used to exercise a template at publish time — proves the content renders before it goes live. */
const TYPE_SAMPLE: Record<Template.VariableDefinition['type'], unknown> = { string: 'sample', number: 42, boolean: true };
/** Neutral defaults injected for declared-but-absent optionals so a live strict render never fails on a legitimately-omitted variable. */
const TYPE_FALLBACK: Record<Template.VariableDefinition['type'], unknown> = { string: '', number: 0, boolean: false };

/** Builds a fully-populated dataset from the declared schema, preferring each variable's documented example. */
export function buildSampleData(schema: Template.VariableSchema): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [name, definition] of Object.entries(schema.variables)) data[name] = definition.example ?? TYPE_SAMPLE[definition.type];
  return data;
}

/**
 * Validates a send payload against the template's variable contract: every required variable must be present, and
 * declared optionals that are absent are pre-filled so the sandboxed strict render only ever fails on an *undeclared*
 * reference (a template defect caught at publish, never at send). Throws {@link AppErrorCode.NTF_004} on a breach.
 */
export function resolvePayload(schema: Template.VariableSchema, payload: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const data: Record<string, unknown> = { ...(payload ?? {}) };
  const missing: string[] = [];
  for (const [name, definition] of Object.entries(schema.variables)) {
    const present = data[name] !== undefined && data[name] !== null;
    if (present) continue;
    if (definition.required) missing.push(name);
    else data[name] = TYPE_FALLBACK[definition.type];
  }
  if (missing.length > 0) throw AppErrorCode.NTF_004.create({ missing: missing.join(', ') });
  return data;
}

/** Extracts the offending variable name from a LiquidJS strict-variable render error, walking the cause chain the engine wraps. */
export function parseUndefinedVariable(error: unknown): string | null {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth++) {
    if (!(current instanceof Error)) {
      messages.push(String(current));
      break;
    }
    messages.push(current.message);
    current = current.cause;
  }
  const match = messages.join(' ').match(/undefined variable:?\s*([A-Za-z_][\w.]*)/i);
  return match?.[1] ?? null;
}
