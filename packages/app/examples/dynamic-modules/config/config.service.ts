/**
 * Importing npm packages
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { Inject, Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { type ConfigModuleOptions } from './config.module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class ConfigService {
  private readonly envConfig: Record<string, string>;

  constructor(@Inject('CONFIG_OPTIONS') options: ConfigModuleOptions) {
    const filePath = 'development.env';
    const envFile = path.resolve(__dirname, '../', options.folder, filePath);
    this.envConfig = fs
      .readFileSync(envFile, { encoding: 'utf-8' })
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && line.indexOf('=') !== -1 && !line.startsWith('#'))
      .reduce(
        (acc, line) => {
          const [key, ...value] = line.split('=') as [string, string[]];
          acc[key.trim()] = value.join('=').trim();
          return acc;
        },
        {} as Record<string, string>,
      );
  }

  get(key: string): string {
    return this.envConfig[key] || '';
  }
}
