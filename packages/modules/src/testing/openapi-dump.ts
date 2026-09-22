/**
 * Importing npm packages
 */
import { writeFile } from 'node:fs/promises';

import { Dispatcher, type Provider, ShadowApplication } from '@shadow-library/app';
import { type ConfigValues } from '@shadow-library/common/testing';
import { type FastifyRouter } from '@shadow-library/fastify';
import { type Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { TestingErrorCode } from './testing.errors';

/**
 * Defining types
 */

export interface OpenApiDumpOptions {
  /** Where the document is written; a dump entry passes its first command-line argument through */
  outputPath: string | undefined;

  /** Every provider whose construction or lifecycle hooks would reach a database, a network or the disk */
  overrides?: Provider[];
}

/**
 * Declaring the constants
 */
const OPENAPI_DOCUMENT_ROUTE = '/dev/api-docs/openapi.json';

/**
 * Set before the dump entry imports its `AppModule`, because the Fastify and http-core modules read the
 * environment while their decorators run. http-core serves the document only in development, the
 * health server would otherwise bind a port, and the stage is pinned so a shell's `APP_STAGE` cannot
 * add or remove stage-gated routes.
 */
export const OPENAPI_DUMP_CONFIG = {
  'app.env': 'development',
  'app.stage': 'prod',
  'http-core.openapi.enabled': true,
  'health.enabled': false,
} as const satisfies ConfigValues;

/**
 * Initialises `module` without starting it — nothing binds a port — and writes the OpenAPI document its
 * routes produce, fetched through Fastify's in-process injection. The caller owns process exit, since a
 * provider left out of `overrides` can hold the event loop open after the application stops.
 */
export async function dumpOpenApiDocument(module: Class<unknown>, options: OpenApiDumpOptions): Promise<void> {
  const { outputPath, overrides } = options;
  if (!outputPath) throw TestingErrorCode.OPENAPI_OUTPUT_MISSING.create();

  const app = new ShadowApplication(module, { enableShutdownHooks: false, overrides });
  await app.init();
  try {
    const router = app.get(Dispatcher) as FastifyRouter;
    const response = await router.mockRequest().get(OPENAPI_DOCUMENT_ROUTE);
    if (response.statusCode !== 200) throw TestingErrorCode.OPENAPI_UNAVAILABLE.create({ route: OPENAPI_DOCUMENT_ROUTE, status: response.statusCode });
    await writeFile(outputPath, response.payload);
  } finally {
    await app.stop();
  }
}
