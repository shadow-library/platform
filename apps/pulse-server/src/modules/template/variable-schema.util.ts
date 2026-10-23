import { AppErrorCode } from '@server/classes';
import { type Template } from '@server/database';

const TYPE_SAMPLE: Record<Template.VariableDefinition['type'], unknown> = { string: 'sample', number: 42, boolean: true };
const TYPE_FALLBACK: Record<Template.VariableDefinition['type'], unknown> = { string: '', number: 0, boolean: false };

export function buildSampleData(schema: Template.VariableSchema): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [name, definition] of Object.entries(schema.variables)) data[name] = definition.example ?? TYPE_SAMPLE[definition.type];
  return data;
}

/** Absent optionals are pre-filled so the strict render only fails on an undeclared reference, which publish already catches. */
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
