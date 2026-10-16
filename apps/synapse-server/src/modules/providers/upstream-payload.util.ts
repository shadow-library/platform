/** Members only Synapse reads: dispatch writes its own `usage`, and neither the gateway block nor OpenRouter's vendor name reaches an app */
const UPSTREAM_ONLY_FIELDS = ['usage', 'gateway', 'provider'];

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function callerPayload(payload: Record<string, unknown>, responseModel?: string): Record<string, unknown> {
  const copy = { ...payload };
  for (const field of UPSTREAM_ONLY_FIELDS) delete copy[field];
  if (responseModel) copy['model'] = responseModel;
  return copy;
}
