import { asRecord } from './upstream-payload.util';

const DEFINITION_KEYS = ['$defs', 'definitions'];

/** Every object's properties outside its `required`, each local `$ref` followed once: how a constrained decoder counts a schema's optional parameters */
export function optionalPropertyCount(schema: unknown): number {
  const root = asRecord(schema);
  const definitions = { ...asRecord(root?.['definitions']), ...asRecord(root?.['$defs']) };
  const followed = new Set<string>();
  let count = 0;
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    const record = asRecord(node);
    if (!record) return;
    const name = typeof record['$ref'] === 'string' && record['$ref'].startsWith('#/') ? record['$ref'].split('/').at(-1) : undefined;
    if (name !== undefined && !followed.has(name)) {
      followed.add(name);
      visit(definitions[name]);
    }
    const properties = asRecord(record['properties']);
    if (properties) {
      const required = new Set(Array.isArray(record['required']) ? record['required'] : []);
      count += Object.keys(properties).filter(key => !required.has(key)).length;
    }
    for (const [key, value] of Object.entries(record)) if (!DEFINITION_KEYS.includes(key)) visit(value);
  };
  visit(schema);
  return count;
}
