/**
 * Importing npm packages
 */
import { Server, createServer } from 'node:http';

import { Injectable, OnApplicationReady, OnApplicationStop } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { DEFAULT_CONFIGS, LOGGER_NAMESPACE } from '../http-core.constants';

/**
 * Defining types
 */

type HealthServer = Server | Bun.Server<unknown> | null;

/**
 * Declaring the constants
 */

@Injectable()
export class HealthService implements OnApplicationReady, OnApplicationStop {
  private readonly logger = Logger.getLogger(LOGGER_NAMESPACE, 'HealthService');

  private isReady = false;
  private server: HealthServer = null;

  constructor() {
    const isHealthEnabled = Config.register('health.enabled', DEFAULT_CONFIGS['health.enabled']);
    if (isHealthEnabled) {
      const hostname = Config.register('health.host', DEFAULT_CONFIGS['health.host']);
      const port = Config.register('health.port', DEFAULT_CONFIGS['health.port']);
      this.server = this.createServer(hostname, port);
      this.server?.unref();
      this.logger.info('Health server started', { hostname, port });
    }
  }

  private createServer(hostname: string, port: number): HealthServer {
    switch (Config.getRuntime()) {
      case 'node': {
        const server = createServer((req, res) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.statusCode = 405;
            return res.end();
          }

          if (req.url === '/health/live') {
            res.statusCode = 200;
            return req.method === 'HEAD' ? res.end() : res.end('ok');
          }

          if (req.url === '/health/ready') {
            res.statusCode = this.isReady ? 200 : 503;
            return req.method === 'HEAD' ? res.end() : res.end(this.isReady ? 'ok' : 'not ready');
          }

          res.statusCode = 404;
          return res.end();
        });

        server.listen(port, hostname);
        return server;
      }

      case 'bun': {
        return Bun.serve({
          hostname,
          port,
          fetch: (req: Request) => {
            const url = new URL(req.url);
            if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405 });
            if (url.pathname === '/health/live') return new Response(req.method === 'HEAD' ? null : 'ok', { status: 200 });
            if (url.pathname === '/health/ready') return new Response(req.method === 'HEAD' ? null : this.isReady ? 'ok' : 'not ready', { status: this.isReady ? 200 : 503 });
            return new Response(null, { status: 404 });
          },
        });
      }

      default: {
        this.logger.error(`Health server is not supported in ${Config.getRuntime()} runtime`);
        return null;
      }
    }
  }

  onApplicationReady(): void {
    this.isReady = true;
  }

  onApplicationStop(): void {
    this.isReady = false;
  }
}
