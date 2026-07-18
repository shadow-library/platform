/**
 * Importing npm packages
 */
import { describe, expect, it, mock } from 'bun:test';
import { Module, ShadowFactory } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { Cookie, FastifyModule, Get, HttpController } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/** Simulate `@fastify/cookie` not being installed: the lazy import inside the router rejects. */
mock.module('@fastify/cookie', () => {
  throw new Error("Cannot find package '@fastify/cookie'");
});

@HttpController('/secure')
class SecureController {
  @Get('/session')
  session(@Cookie() _cookies: Record<string, string>) {
    return {};
  }
}

@Module({ imports: [FastifyModule.forRoot({ controllers: [SecureController] })] })
class SecureModule {}

describe('@Cookie without @fastify/cookie', () => {
  it('should throw a clear error when the package is not installed', async () => {
    await expect(ShadowFactory.create(SecureModule).then(app => app.start())).rejects.toThrow(/@fastify\/cookie/);
  });
});
