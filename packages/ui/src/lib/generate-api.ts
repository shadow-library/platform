/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

interface OpenAPISpec {
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, SchemaOrRef>;
    requestBodies?: Record<string, RequestBodyObject | ReferenceObject>;
    parameters?: Record<string, ParameterObject | ReferenceObject>;
    responses?: Record<string, ResponseObject | ReferenceObject>;
  };
}

interface ReferenceObject {
  $ref: string;
}

interface SchemaObject {
  type?: string | string[];
  properties?: Record<string, SchemaOrRef>;
  required?: string[];
  items?: SchemaOrRef;
  enum?: (string | number | boolean | null)[];
  allOf?: SchemaOrRef[];
  oneOf?: SchemaOrRef[];
  anyOf?: SchemaOrRef[];
  additionalProperties?: boolean | SchemaOrRef;
  nullable?: boolean;
}

type SchemaOrRef = SchemaObject | ReferenceObject;

interface ParameterObject {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  schema?: SchemaOrRef;
}

interface RequestBodyObject {
  content?: Record<string, { schema?: SchemaOrRef }>;
  required?: boolean;
}

interface ResponseObject {
  content?: Record<string, { schema?: SchemaOrRef }>;
}

interface OperationObject {
  summary?: string;
  operationId?: string;
  parameters?: (ParameterObject | ReferenceObject)[];
  requestBody?: RequestBodyObject | ReferenceObject;
  responses?: Record<string, ResponseObject | ReferenceObject>;
}

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface PathItem extends Partial<Record<HttpMethod, OperationObject>> {
  parameters?: (ParameterObject | ReferenceObject)[];
}

interface GeneratedEndpoint {
  types: string[];
  func: string;
  hasBody: boolean;
}

/**
 * Declaring the constants
 */

const HTTP_METHODS: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];

function isRef(obj: unknown): obj is ReferenceObject {
  return typeof obj === 'object' && obj !== null && '$ref' in obj;
}

function resolveRefName(ref: string): string {
  return ref.split('/').pop() as string;
}

function resolveRef<T>(ref: string, spec: OpenAPISpec): T {
  const segments = ref.replace(/^#\//, '').split('/');
  let current: unknown = spec;
  for (const segment of segments) current = (current as Record<string, unknown>)[segment];
  return current as T;
}

function toCamelCase(str: string): string {
  return str
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word, i) => (i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join('');
}

function toPascalCase(str: string): string {
  return str
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function schemaToTs(schema: SchemaOrRef, spec: OpenAPISpec): string {
  if (isRef(schema)) return resolveRefName(schema.$ref);

  if (schema.allOf) {
    const types = schema.allOf.map((s) => schemaToTs(s, spec));
    return types.length === 1 ? (types[0] as string) : types.join(' & ');
  }

  if (schema.oneOf) {
    const types = schema.oneOf.map((s) => schemaToTs(s, spec));
    return types.length === 1 ? (types[0] as string) : types.join(' | ');
  }

  if (schema.anyOf) {
    const types = schema.anyOf.map((s) => schemaToTs(s, spec));
    return types.length === 1 ? (types[0] as string) : types.join(' | ');
  }

  if (schema.enum) {
    return schema.enum.map((v) => (typeof v === 'string' ? `'${v}'` : String(v))).join(' | ');
  }

  let type = schema.type;
  let nullable = schema.nullable === true;
  if (Array.isArray(type)) {
    nullable = nullable || type.includes('null');
    type = type.find((t) => t !== 'null');
  }

  let result: string;
  switch (type) {
    case 'string': {
      result = 'string';
      break;
    }

    case 'integer':
    case 'number': {
      result = 'number';
      break;
    }

    case 'boolean': {
      result = 'boolean';
      break;
    }

    case 'array': {
      result = schema.items ? `Array<${schemaToTs(schema.items, spec)}>` : 'Array<unknown>';
      break;
    }

    case 'object': {
      if (schema.properties) {
        const req = new Set(schema.required ?? []);
        const props = Object.entries(schema.properties).map(([key, val]) => `  ${key}${req.has(key) ? '' : '?'}: ${schemaToTs(val, spec)};`);
        if (schema.additionalProperties) {
          const vt = typeof schema.additionalProperties === 'boolean' ? 'unknown' : schemaToTs(schema.additionalProperties, spec);
          props.push(`  [key: string]: ${vt};`);
        }
        result = `{\n${props.join('\n')}\n}`;
      } else if (schema.additionalProperties) {
        const vt = typeof schema.additionalProperties === 'boolean' ? 'unknown' : schemaToTs(schema.additionalProperties, spec);
        result = `Record<string, ${vt}>`;
      } else result = 'Record<string, unknown>';
      break;
    }

    default: {
      result = 'unknown';
    }
  }

  return nullable ? `${result} | null` : result;
}

function collectTypes(spec: OpenAPISpec): string {
  const schemas = spec.components?.schemas;
  if (!schemas) return '';

  const lines: string[] = [];

  for (const [name, schema] of Object.entries(schemas)) {
    if (isRef(schema)) {
      lines.push(`export type ${name} = ${resolveRefName(schema.$ref)};`);
      lines.push('');
      continue;
    }

    if (schema.type === 'object' && schema.properties && !schema.allOf && !schema.oneOf && !schema.anyOf) {
      const req = new Set(schema.required ?? []);
      const props = Object.entries(schema.properties).map(([key, val]) => `  ${key}${req.has(key) ? '' : '?'}: ${schemaToTs(val, spec)};`);
      if (schema.additionalProperties) {
        const vt = typeof schema.additionalProperties === 'boolean' ? 'unknown' : schemaToTs(schema.additionalProperties, spec);
        props.push(`  [key: string]: ${vt};`);
      }
      lines.push(`export interface ${name} {\n${props.join('\n')}\n}`);
    } else lines.push(`export type ${name} = ${schemaToTs(schema, spec)};`);
    lines.push('');
  }

  return lines.join('\n');
}

function resolveParameter(param: ParameterObject | ReferenceObject, spec: OpenAPISpec): ParameterObject {
  return isRef(param) ? resolveRef<ParameterObject>(param.$ref, spec) : param;
}

function generateEndpoint(
  path: string,
  method: HttpMethod,
  operation: OperationObject,
  pathLevelParams: (ParameterObject | ReferenceObject)[],
  spec: OpenAPISpec,
): GeneratedEndpoint {
  const types: string[] = [];
  let hasBody = false;

  // Function name
  const summary = operation.summary ?? operation.operationId ?? `${method} ${path}`;
  const funcName = toCamelCase(summary);
  const pascalName = toPascalCase(summary);

  // Merge parameters (operation-level overrides path-level for same name+in)
  const allParams = [...pathLevelParams, ...(operation.parameters ?? [])].map((p) => resolveParameter(p, spec));
  const paramMap = new Map<string, ParameterObject>();
  for (const param of allParams) paramMap.set(`${param.in}:${param.name}`, param);
  const params = Array.from(paramMap.values());

  // Path params sorted by URL appearance
  const pathParams = params.filter((p) => p.in === 'path');
  const pathParamOrder = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  pathParams.sort((a, b) => pathParamOrder.indexOf(a.name) - pathParamOrder.indexOf(b.name));

  // Query params
  const queryParams = params.filter((p) => p.in === 'query');
  let queryTypeName: string | undefined;
  if (queryParams.length > 0) {
    queryTypeName = `${pascalName}Query`;
    const props = queryParams.map((p) => {
      const originalType = p.schema ? schemaToTs(p.schema, spec) : 'unknown';
      const tsType = originalType === 'string' ? 'string | undefined' : `string | ${originalType} | undefined`;
      return `  ${p.name}?: ${tsType};`;
    });
    types.push(`export interface ${queryTypeName} extends QueryParams {\n${props.join('\n')}\n}`);
  }

  // Request body
  let bodyTypeName: string | undefined;
  if (operation.requestBody) {
    const reqBody = isRef(operation.requestBody) ? resolveRef<RequestBodyObject>(operation.requestBody.$ref, spec) : operation.requestBody;
    const jsonSchema = reqBody.content?.['application/json']?.schema;
    if (jsonSchema) {
      hasBody = true;
      if (isRef(jsonSchema)) bodyTypeName = resolveRefName(jsonSchema.$ref);
      else {
        bodyTypeName = `${pascalName}Body`;
        if (jsonSchema.type === 'object' && jsonSchema.properties && !jsonSchema.allOf && !jsonSchema.oneOf && !jsonSchema.anyOf) {
          const req = new Set(jsonSchema.required ?? []);
          const props = Object.entries(jsonSchema.properties).map(([key, val]) => `  ${key}${req.has(key) ? '' : '?'}: ${schemaToTs(val, spec)};`);
          types.push(`export interface ${bodyTypeName} {\n${props.join('\n')}\n}`);
        } else types.push(`export type ${bodyTypeName} = ${schemaToTs(jsonSchema, spec)};`);
      }
    }
  }

  // Response type
  let returnType = 'unknown';
  if (operation.responses) {
    const successCode = ['200', '201', '204'].find((c) => operation.responses?.[c]);
    if (successCode === '204') returnType = 'void';
    else if (successCode) {
      const resp = operation.responses[successCode] as ResponseObject | ReferenceObject;
      const resolved = isRef(resp) ? resolveRef<ResponseObject>(resp.$ref, spec) : resp;
      const jsonSchema = resolved.content?.['application/json']?.schema;
      if (jsonSchema) {
        if (isRef(jsonSchema)) returnType = resolveRefName(jsonSchema.$ref);
        else types.push(`export type ${pascalName}Response = ${schemaToTs(jsonSchema, spec)};`);
      }
    }
  }

  // Build function arguments
  const args: string[] = [];
  for (const p of pathParams) args.push(`${p.name}: string`);
  if (queryTypeName) args.push(`query: ${queryTypeName}`);
  if (bodyTypeName) args.push(`body: ${bodyTypeName}`);

  // Build URL string
  const urlPath = path.replace(/\{(\w+)\}/g, (_, name) => `\${${name}}`);
  const urlStr = urlPath !== path ? `\`${urlPath}\`` : `'${path}'`;

  // Build method chain
  let chain = `APIRequest.${method}(${urlStr})`;
  if (queryTypeName) chain += '.query(query)';
  if (bodyTypeName) chain += '.body(body)';
  chain += `.execute<${returnType}>()`;

  const func = `export async function ${funcName}(${args.join(', ')}): Promise<${returnType}> {\n  return ${chain};\n}`;

  return { types, func, hasBody };
}

export async function generateApi(url: string): Promise<string> {
  const response = await fetch(url);
  const spec: OpenAPISpec = await response.json();

  const allTypes: string[] = [];
  const allFuncs: string[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const pathLevelParams = pathItem.parameters ?? [];
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      const endpoint = generateEndpoint(path, method, operation, pathLevelParams, spec);
      allTypes.push(...endpoint.types);
      allFuncs.push(endpoint.func);
    }
  }

  const lines: string[] = [
    '/* eslint-disable */',
    '',
    '/** Auto-generated file — do not edit manually */',
    '',
    'import { APIRequest, type QueryParams } from "@shadow-library/ui";',
    '',
  ];
  const schemaTypes = collectTypes(spec);
  if (schemaTypes.trim()) lines.push(schemaTypes);

  if (allTypes.length > 0) {
    lines.push(allTypes.join('\n\n'));
    lines.push('');
  }

  if (allFuncs.length > 0) {
    lines.push(allFuncs.join('\n\n'));
    lines.push('');
  }

  return lines.join('\n');
}
