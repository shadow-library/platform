/**
 * Importing packages with side effects
 */
import 'reflect-metadata';

/**
 * Importing npm packages
 */
import path from 'node:path';

import { ShadowFactory } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppModule } from './app.module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const packageJsonPath = path.join(import.meta.dirname, 'package.json');
const packageJsonFile = Bun.file(packageJsonPath);

let gitCommit = '-';
if (await packageJsonFile.exists()) {
  const packageJson = await packageJsonFile.json();
  if (packageJson.gitCommit) gitCommit = packageJson.gitCommit;
}

Logger.setDefaultMetadata({ gitCommit });
if (Config.isProd()) Logger.attachTransport('console:json');
else if (Config.isDev()) Logger.attachTransport('console:pretty').attachTransport('file:json');

ShadowFactory.create(AppModule).then(app => app.start());
