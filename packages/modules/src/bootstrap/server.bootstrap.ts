/**
 * Importing npm packages
 */
import path from 'node:path';

import { ShadowFactory } from '@shadow-library/app';
import { Config, type Format, Logger } from '@shadow-library/common';
import { type Class } from 'type-fest';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/** `entrypointDir` must be the caller's own `import.meta.dirname`: resolved here it would point inside this package instead of the built service, and `gitCommit` would silently stay `-`. */
export async function bootstrapServer(module: Class<unknown>, entrypointDir: string, format?: Format): Promise<void> {
  const packageJsonFile = Bun.file(path.join(entrypointDir, 'package.json'));

  let gitCommit = '-';
  if (await packageJsonFile.exists()) {
    const packageJson = await packageJsonFile.json();
    if (packageJson.gitCommit) gitCommit = packageJson.gitCommit;
  }

  Logger.setDefaultMetadata({ gitCommit });
  if (Config.isProd()) Logger.attachTransport('console:json', format);
  else if (Config.isDev()) Logger.attachTransport('console:pretty', format).attachTransport('file:json', format);

  const app = await ShadowFactory.create(module);
  await app.start();
}
