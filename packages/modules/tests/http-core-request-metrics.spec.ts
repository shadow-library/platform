import { channel } from 'node:diagnostics_channel';

import { beforeAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { Dispatcher, Module, ShadowFactory } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { setConfig } from '@shadow-library/common/testing';
import { EventStream, FastifyModule, FastifyRouter, Get, HttpController, type HttpResponse, HttpStatus, Query, Res } from '@shadow-library/fastify';

import { DatabaseModule, DatabaseService, type PostgresClient } from '@shadow-library/modules/database';
import { HttpCoreModule } from '@shadow-library/modules/http-core';

import { QUERY_CHANNEL } from '../src/internal.utils';

type Thresholds = Partial<Record<'http-core.slow-request-threshold' | 'http-core.request-query-threshold', number>>;

class DriverQuery extends Promise<unknown> {}

const queryChannel = channel(QUERY_CHANNEL);

async function bootApp(thresholds: Thresholds) {
  const unsafe = mock<(query: string, params?: unknown[]) => DriverQuery>(() => new DriverQuery(resolve => resolve([])));
  const client = { execute: mock(), $client: { unsafe } } as unknown as PostgresClient;
  const DbModule = DatabaseModule.forRoot({ postgres: { factory: () => client } });

  @HttpController('/api')
  class ItemController {
    constructor(private readonly db: DatabaseService) {}

    @Get('/items/:id')
    @HttpStatus(200)
    async getItem(@Query() query: Record<string, string>) {
      const driver = (this.db.getPostgresClient() as unknown as { $client: { unsafe: typeof unsafe } }).$client;
      for (let index = 0; index < Number(query.queries ?? 0); index++) await driver.unsafe('select * from items where id = $1', ['item-secret']);
      return { status: 'ok' };
    }

    @Get('/events')
    openEvents(@Res() reply: HttpResponse): void {
      EventStream.open(reply, { heartbeatMs: 0, maxLifetimeMs: 1 });
    }
  }

  const warn = mock();
  const getLogger = Logger.getLogger.bind(Logger);
  const withWarn = (logger: Logger) => new Proxy(logger, { get: (target, key) => (key === 'warn' ? warn : Reflect.get(target, key)) });
  const spy = spyOn(Logger, 'getLogger').mockImplementation(((namespace: string, label: string) =>
    label === 'HttpCoreModule' ? withWarn(getLogger(namespace, label)) : getLogger(namespace, label)) as typeof Logger.getLogger);
  const restoreConfig = setConfig(thresholds);
  try {
    @Module({ imports: [FastifyModule.forRoot({ imports: [HttpCoreModule.forRoot(), DbModule], controllers: [ItemController] })] })
    class MetricsAppModule {}
    const app = await ShadowFactory.create(MetricsAppModule);
    const router = app.get(Dispatcher) as FastifyRouter;
    await router.getInstance().ready();
    return { warn, router };
  } finally {
    restoreConfig();
    spy.mockRestore();
  }
}

describe('HttpCore request metrics', () => {
  describe('query-heavy requests', () => {
    let app: Awaited<ReturnType<typeof bootApp>>;

    beforeAll(async () => {
      app = await bootApp({ 'http-core.slow-request-threshold': 60_000, 'http-core.request-query-threshold': 2 });
    });

    beforeEach(() => app.warn.mockClear());

    it('should log one line with the route pattern, status and query totals when a request exceeds the query threshold', async () => {
      const response = await app.router.mockRequest().get('/api/items/42?queries=3&token=abc');

      expect(response.statusCode).toBe(200);
      expect(app.warn).toHaveBeenCalledTimes(1);
      const [message, metrics] = app.warn.mock.calls[0] as [string, Record<string, unknown>];
      expect(message).toStartWith('Query-heavy request GET /api/items/:id -> 200');
      expect(metrics).toEqual({ method: 'GET', route: '/api/items/:id', status: 200, durationMs: expect.any(Number), queryCount: 3, queryDurationMs: expect.any(Number) });
    });

    it('should never log the raw URL or the bound query values', async () => {
      await app.router.mockRequest().get('/api/items/42?queries=3&token=abc');

      const logged = JSON.stringify(app.warn.mock.calls);
      expect(logged).not.toContain('/api/items/42');
      expect(logged).not.toContain('token=abc');
      expect(logged).not.toContain('item-secret');
    });

    it('should log nothing for a fast request at the query threshold', async () => {
      await app.router.mockRequest().get('/api/items/42?queries=2');

      expect(app.warn).not.toHaveBeenCalled();
    });

    it('should count only the queries of its own request', async () => {
      await Promise.all([app.router.mockRequest().get('/api/items/1?queries=2'), app.router.mockRequest().get('/api/items/2?queries=2')]);

      expect(app.warn).not.toHaveBeenCalled();
    });

    it('should ignore a query run outside any request, as a job or worker does', () => {
      expect(() => queryChannel.publish(12.5)).not.toThrow();
      expect(app.warn).not.toHaveBeenCalled();
    });
  });

  describe('slow requests', () => {
    let app: Awaited<ReturnType<typeof bootApp>>;

    beforeAll(async () => {
      app = await bootApp({ 'http-core.slow-request-threshold': 0.000_001, 'http-core.request-query-threshold': 0 });
    });

    it('should log a request over the duration threshold even when it runs no query', async () => {
      await app.router.mockRequest().get('/api/items/42');

      expect(app.warn).toHaveBeenCalledTimes(1);
      expect(app.warn.mock.calls[0]?.[0]).toStartWith('Slow request GET /api/items/:id -> 200 took');
      expect(app.warn.mock.calls[0]?.[1]).toMatchObject({ queryCount: 0, queryDurationMs: 0 });
    });

    it('should not report an event stream, whose request lasts as long as the stream', async () => {
      app.warn.mockClear();

      const response = await app.router.mockRequest().get('/api/events');

      expect(response.headers['content-type']).toStartWith('text/event-stream');
      expect(app.warn).not.toHaveBeenCalled();
    });
  });

  describe.each([0, -1])('when both thresholds are %d', threshold => {
    let app: Awaited<ReturnType<typeof bootApp>>;

    beforeAll(async () => {
      app = await bootApp({ 'http-core.slow-request-threshold': threshold, 'http-core.request-query-threshold': threshold });
    });

    it('should log nothing for a query-heavy request', async () => {
      await app.router.mockRequest().get('/api/items/42?queries=60');

      expect(app.warn).not.toHaveBeenCalled();
    });
  });
});
