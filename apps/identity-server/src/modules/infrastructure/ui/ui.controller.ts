/**
 * Importing npm packages
 */
import fs from 'fs';
import path from 'path';

import { Config } from '@shadow-library/common';
import { Get, Header, HttpController, Res } from '@shadow-library/fastify';
import { type FastifyReply } from 'fastify';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Every interactive page serves the same SPA shell; the client router renders by pathname.
 * Auth pages must never be cached — a shared machine replaying a cached login page with stale
 * state is a support ticket at best.
 */
const PAGE_PATHS = ['/login', '/register', '/recover', '/consent', '/account', '/error'] as const;

@HttpController()
export class UiController {
  private readonly publicDir = Config.get('ui.public-dir');
  private shell: string | null = null;

  /** Lazily caches the built shell; a missing build answers 404 rather than crashing the API. */
  private loadShell(): string | null {
    if (this.shell) return this.shell;
    const shellPath = path.join(this.publicDir, 'index.html');
    if (!fs.existsSync(shellPath)) return null;
    this.shell = fs.readFileSync(shellPath, 'utf-8');
    return this.shell;
  }

  private servePage(reply: FastifyReply): void {
    const shell = this.loadShell();
    if (!shell) {
      reply.status(404).send({ code: 'UI_NOT_BUILT', type: 'NOT_FOUND', message: 'The web client has not been built' });
      return;
    }
    reply.type('text/html; charset=utf-8').send(shell);
  }

  @Get(PAGE_PATHS[0])
  @Header('cache-control', 'no-store')
  login(@Res() reply: FastifyReply): void {
    this.servePage(reply);
  }

  @Get(PAGE_PATHS[1])
  @Header('cache-control', 'no-store')
  register(@Res() reply: FastifyReply): void {
    this.servePage(reply);
  }

  @Get(PAGE_PATHS[2])
  @Header('cache-control', 'no-store')
  recover(@Res() reply: FastifyReply): void {
    this.servePage(reply);
  }

  @Get(PAGE_PATHS[3])
  @Header('cache-control', 'no-store')
  consent(@Res() reply: FastifyReply): void {
    this.servePage(reply);
  }

  @Get(PAGE_PATHS[4])
  @Header('cache-control', 'no-store')
  account(@Res() reply: FastifyReply): void {
    this.servePage(reply);
  }

  @Get(PAGE_PATHS[5])
  @Header('cache-control', 'no-store')
  error(@Res() reply: FastifyReply): void {
    this.servePage(reply);
  }

  @Get('/')
  @Header('cache-control', 'no-store')
  root(@Res() reply: FastifyReply): void {
    this.servePage(reply);
  }
}
