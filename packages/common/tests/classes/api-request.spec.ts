/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, Mock, mock } from 'bun:test';
import { request } from 'undici';

/**
 * Importing user defined packages
 */
import { APIRequest, AppError, ErrorCode } from '@shadow-library/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

mock.module('undici', () => ({ request: mock(() => Promise.resolve({ statusCode: 200, headers: {} })) }));

describe('APIRequest', () => {
  const mockRequest = request as Mock<any>;

  beforeEach(() => mock.restore());

  it('should create GET, POST, PUT, PATCH, DELETE instances', () => {
    expect(APIRequest.get('/test')).toBeInstanceOf(APIRequest);
    expect(APIRequest.post('/test')).toBeInstanceOf(APIRequest);
    expect(APIRequest.put('/test')).toBeInstanceOf(APIRequest);
    expect(APIRequest.patch('/test')).toBeInstanceOf(APIRequest);
    expect(APIRequest.delete('/test')).toBeInstanceOf(APIRequest);
  });

  it('should set headers, query, field, and body', async () => {
    const response = await APIRequest.post('/test').header('x-test', '1').query('sort', 'asc').body({ username: 'john-doe' }).field('name.first', 'John').field('name.last', 'Doe');
    expect(response).toStrictEqual({ statusCode: 200, headers: {}, data: null });
    expect(mockRequest).toHaveBeenCalledWith('/test', {
      method: 'POST',
      headers: { 'x-test': '1', 'content-type': 'application/json' },
      query: { sort: 'asc' },
      body: JSON.stringify({ username: 'john-doe', name: { first: 'John', last: 'Doe' } }),
    });
  });

  it('should accept an interface-typed body without casts', async () => {
    interface Payload {
      action: string;
      count: number;
    }
    const payload: Payload = { action: 'created', count: 1 };
    await APIRequest.post('/typed').body(payload);
    expect(mockRequest).toHaveBeenCalledWith('/typed', expect.objectContaining({ body: JSON.stringify(payload) }));
  });

  it('should throw AppError when the body is not JSON-serializable', async () => {
    await expect(
      APIRequest.post('/test')
        .body(() => 'not-json')
        .execute(),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('should suppress errors', async () => {
    mockRequest.mockResolvedValue({ statusCode: 400, headers: { 'content-type': 'application/json' }, body: { json: async () => ({ error: 'fail' }) } });
    const response = await APIRequest.get('/test').suppressErrors();
    expect(response).toStrictEqual({ statusCode: 400, headers: { 'content-type': 'application/json' }, data: { error: 'fail' } });
  });

  it('should throw API_REQUEST_FAILED on failure if throwErrorOnFailure is true', async () => {
    mockRequest.mockResolvedValue({ statusCode: 400, headers: { 'content-type': 'application/json' }, body: { json: async () => ({ error: 'fail' }) } });
    const failure = await APIRequest.get('/fail')
      .header('x', 'y')
      .body({})
      .execute()
      .catch((error: unknown) => error);
    expect(AppError.is(failure, ErrorCode.API_REQUEST_FAILED)).toBe(true);
    expect((failure as AppError).data).toStrictEqual({ status: 400, response: { error: 'fail' } });
  });

  it('should create a child class with setOptions', () => {
    const Parent = APIRequest.get('/parent');
    const Child = Parent.child();
    Child.setOptions({ throwErrorOnFailure: false });
    const childInstance = new Child();
    expect(childInstance).toBeInstanceOf(APIRequest);
  });

  describe('timeout', () => {
    const abortable = (signal: AbortSignal): Promise<never> => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));

    it('should reject a non-positive or non-finite timeout', () => {
      expect(() => APIRequest.get('/test').timeout(0)).toThrow(AppError);
      expect(() => APIRequest.get('/test').timeout(-100)).toThrow(AppError);
      expect(() => APIRequest.get('/test').timeout(NaN)).toThrow(AppError);
    });

    it('should pass an abort signal to undici when a timeout is set', async () => {
      mockRequest.mockResolvedValue({ statusCode: 200, headers: {} });
      await APIRequest.get('/test').timeout(1000);
      expect(mockRequest).toHaveBeenCalledWith('/test', { method: 'GET', signal: expect.any(AbortSignal) });
    });

    it('should not pass an abort signal when no timeout is set', async () => {
      mockRequest.mockResolvedValue({ statusCode: 200, headers: {} });
      await APIRequest.get('/test');
      expect(mockRequest).toHaveBeenCalledWith('/test', { method: 'GET' });
    });

    it('should throw API_REQUEST_TIMEOUT when the request exceeds the timeout', async () => {
      mockRequest.mockImplementation((_url: string, options: { signal: AbortSignal }) => abortable(options.signal));
      const failure = await APIRequest.get('/slow')
        .timeout(10)
        .execute()
        .catch((error: unknown) => error);
      expect(AppError.is(failure, ErrorCode.API_REQUEST_TIMEOUT)).toBe(true);
      expect((failure as AppError).status).toBe(504);
      expect((failure as AppError).message).toBe('API request timed out after 10ms');
      expect(((failure as AppError).cause as Error).name).toBe('TimeoutError');
    });

    it('should throw API_REQUEST_TIMEOUT when the body read exceeds the timeout', async () => {
      mockRequest.mockImplementation((_url: string, options: { signal: AbortSignal }) =>
        Promise.resolve({ statusCode: 200, headers: { 'content-type': 'application/json' }, body: { json: () => abortable(options.signal) } }),
      );
      const failure = await APIRequest.get('/slow-body')
        .timeout(10)
        .execute()
        .catch((error: unknown) => error);
      expect(AppError.is(failure, ErrorCode.API_REQUEST_TIMEOUT)).toBe(true);
    });

    it('should rethrow a non-timeout failure untouched', async () => {
      const networkError = new Error('connect ECONNREFUSED');
      mockRequest.mockRejectedValue(networkError);
      const failure = await APIRequest.get('/down')
        .timeout(1000)
        .execute()
        .catch((error: unknown) => error);
      expect(failure).toBe(networkError);
    });
  });

  describe('svc:// service resolution', () => {
    const SERVICE_ENV = ['SERVICE_URL_PULSE_SERVER', 'SERVICE_DISCOVERY_SCHEME'];
    beforeEach(() => {
      SERVICE_ENV.forEach(key => delete process.env[key]);
      mockRequest.mockResolvedValue({ statusCode: 200, headers: {} });
    });

    it('should resolve a svc:// url to in-cluster service DNS by default', async () => {
      await APIRequest.get('svc://pulse-server/api/v1/notifications');
      expect(mockRequest).toHaveBeenCalledWith('http://pulse-server/api/v1/notifications', expect.objectContaining({ method: 'GET' }));
    });

    it('should honour a SERVICE_URL_<NAME> override and its trailing slash', async () => {
      process.env['SERVICE_URL_PULSE_SERVER'] = 'https://localhost:3000/';
      await APIRequest.post('svc://pulse-server/api/v1/notifications');
      expect(mockRequest).toHaveBeenCalledWith('https://localhost:3000/api/v1/notifications', expect.objectContaining({ method: 'POST' }));
    });

    it('should apply the discovery scheme to a schemeless SERVICE_URL_<NAME> override', async () => {
      process.env['SERVICE_URL_PULSE_SERVER'] = 'localhost:3000';
      await APIRequest.get('svc://pulse-server/api/v1/notifications');
      expect(mockRequest).toHaveBeenCalledWith('http://localhost:3000/api/v1/notifications', expect.objectContaining({ method: 'GET' }));
    });

    it('should apply SERVICE_DISCOVERY_SCHEME to a schemeless override', async () => {
      process.env['SERVICE_DISCOVERY_SCHEME'] = 'https';
      process.env['SERVICE_URL_PULSE_SERVER'] = 'localhost:3000';
      await APIRequest.get('svc://pulse-server/health');
      expect(mockRequest).toHaveBeenCalledWith('https://localhost:3000/health', expect.objectContaining({ method: 'GET' }));
    });

    it('should apply SERVICE_DISCOVERY_SCHEME to the in-cluster default', async () => {
      process.env['SERVICE_DISCOVERY_SCHEME'] = 'https';
      await APIRequest.get('svc://pulse-server/health');
      expect(mockRequest).toHaveBeenCalledWith('https://pulse-server/health', expect.objectContaining({ method: 'GET' }));
    });

    it('should accept a dotted service host for a cross-namespace target', async () => {
      await APIRequest.get('svc://pulse-server.prod/health');
      expect(mockRequest).toHaveBeenCalledWith('http://pulse-server.prod/health', expect.objectContaining({ method: 'GET' }));
    });

    it('should leave an absolute url untouched', async () => {
      await APIRequest.get('https://api.pwnedpasswords.com/range/ABCDE');
      expect(mockRequest).toHaveBeenCalledWith('https://api.pwnedpasswords.com/range/ABCDE', expect.objectContaining({ method: 'GET' }));
    });

    it('should reject an invalid service name', async () => {
      await expect(APIRequest.get('svc://Bad_Name/x').execute()).rejects.toBeInstanceOf(AppError);
    });
  });
});
