import 'reflect-metadata';

import path from 'node:path';

import { ShadowFactory } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

import { AppModule } from './app.module';
import { manifestLogRedactionFormat } from './database/log-redaction';

const packageJsonPath = path.join(import.meta.dirname, 'package.json');
const packageJsonFile = Bun.file(packageJsonPath);

let gitCommit = '-';
if (await packageJsonFile.exists()) {
  const packageJson = await packageJsonFile.json();
  if (packageJson.gitCommit) gitCommit = packageJson.gitCommit;
}

Logger.setDefaultMetadata({ gitCommit });
const redaction = manifestLogRedactionFormat();
if (Config.isProd()) Logger.attachTransport('console:json', redaction);
else if (Config.isDev()) Logger.attachTransport('console:pretty', redaction).attachTransport('file:json', redaction);

ShadowFactory.create(AppModule).then(app => app.start());
