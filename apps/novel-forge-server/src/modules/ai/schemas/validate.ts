/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { ClassSchema, type SchemaClass } from '@shadow-library/class-schema';
import Ajv, { type ValidateFunction } from 'ajv';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface SchemaIssue {
  path: (string | number)[];
  message: string;
}

export type SchemaParseResult<T> = { success: true; data: T } | { success: false; issues: SchemaIssue[] };

/**
 * Declaring the constants
 */

const ajv = new Ajv({ allErrors: true, strict: true });
const compiledCache = new Map<string, ValidateFunction>();

// class-schema names primitive-item definitions with bare ids ('String', 'Integer', ...) while every
// class-backed definition is id'd as `class-schema:Name-N`. AJV treats the latter as a URI with scheme
// `class-schema:`, so a `$ref: 'String'` inside it resolves relative to that scheme (→ `class-schema:String`,
// which was never registered) instead of the literal 'String' key. Inlining these primitive refs as plain
// `{ type: ... }` sidesteps the mismatch entirely — used for array-of-primitive fields like `[String]`.
const PRIMITIVE_REF_TYPES: Record<string, string> = { String: 'string', Number: 'number', Boolean: 'boolean', Integer: 'integer', Object: 'object', Array: 'array' };

function inlinePrimitiveRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(inlinePrimitiveRefs);
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const ref = obj['$ref'];
    if (typeof ref === 'string' && PRIMITIVE_REF_TYPES[ref]) {
      const rest = { ...obj };
      delete rest['$ref'];
      return { ...rest, type: PRIMITIVE_REF_TYPES[ref] };
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) result[key] = inlinePrimitiveRefs(value);
    return result;
  }
  return node;
}

// Mirrors @shadow-library/fastify's own compileSchema: register every nested `definitions` entry
// under its own $id, then the root schema under its own $id, so $ref resolution works across calls.
function compile(Class: SchemaClass): ValidateFunction {
  const rawSchema = ClassSchema.generate(Class);
  const schema = inlinePrimitiveRefs(rawSchema) as typeof rawSchema;
  const cached = compiledCache.get(schema.$id);
  if (cached) return cached;

  const { definitions, ...root } = schema;
  for (const def of Object.values(definitions ?? {})) {
    if (def.$id && !PRIMITIVE_REF_TYPES[def.$id] && !ajv.getSchema(def.$id)) ajv.addSchema(def, def.$id);
  }
  if (!ajv.getSchema(schema.$id)) ajv.addSchema(root, schema.$id);

  const validateFn = ajv.getSchema(schema.$id);
  if (!validateFn) throw new Error(`[validateSchema] failed to compile schema '${schema.$id}'`);
  compiledCache.set(schema.$id, validateFn);
  return validateFn;
}

// class-schema replacement for zod's `.safeParse()` — validates `data` against the JSON Schema
// generated from a @Schema()-decorated class (or `[Class]` for a top-level array).
export function parseSchema<T>(Class: SchemaClass, data: unknown): SchemaParseResult<T> {
  const validateFn = compile(Class);
  const valid = validateFn(data);
  if (valid) return { success: true, data: data as T };

  const issues: SchemaIssue[] = (validateFn.errors ?? []).map(err => ({
    path: err.instancePath.split('/').filter(Boolean),
    message: `${err.instancePath || '(root)'} ${err.message ?? 'is invalid'}`.trim(),
  }));
  return { success: false, issues };
}

export function renderSchemaIssues(issues: SchemaIssue[]): string {
  return issues.map(i => `- ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
}

// Validation-only keywords that constrain values but not structure. llama.cpp's schema→grammar
// converter (used by Ollama structured outputs) either ignores or chokes on these, so they are
// stripped — the router's own AJV pass still enforces them after generation.
const CONSTRAINT_KEYWORDS = new Set(['minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems', 'pattern', 'format', 'description', 'default', '$schema']);

// Produce a self-contained JSON Schema (every `$ref` dereferenced, ids/definitions/constraint keywords
// stripped) suitable for Ollama's structured-output `format`. Grammar-constrained decoding needs the
// whole schema inline, and the `class-schema:` `$id` scheme confuses the converter, so we flatten it.
export function toJsonSchemaFormat(Class: SchemaClass): Record<string, unknown> {
  const raw = inlinePrimitiveRefs(ClassSchema.generate(Class)) as Record<string, unknown>;
  const definitions = (raw['definitions'] ?? {}) as Record<string, Record<string, unknown>>;

  function deref(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(deref);
    if (!node || typeof node !== 'object') return node;
    const obj = node as Record<string, unknown>;
    const ref = obj['$ref'];
    if (typeof ref === 'string' && definitions[ref]) return deref(definitions[ref]);
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === '$id' || key === 'definitions' || CONSTRAINT_KEYWORDS.has(key)) continue;
      out[key] = deref(value);
    }
    return out;
  }

  return deref(raw) as Record<string, unknown>;
}
