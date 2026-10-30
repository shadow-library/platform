export interface ServiceErrorBody {
  code?: string;
  message?: string;
}

export type ServiceResponse<T> = { ok: true; status: number; headers: Headers; data: T } | { ok: false; status: number; headers: Headers; error: ServiceErrorBody };

export interface CallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

type JsonContent<R> = R extends { content: { 'application/json': infer T } } ? T : undefined;

/** The JSON body an operation answers with on `status`; `undefined` for a bodiless answer such as a 204. */
export type ResponseBody<Operation, Status extends number> = Operation extends { responses: infer Responses }
  ? Status extends keyof Responses
    ? JsonContent<Responses[Status]>
    : undefined
  : never;

export type RequestBody<Operation> = Operation extends { requestBody?: { content: { 'application/json': infer T } } } ? T : never;
