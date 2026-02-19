/**
 * Importing npm packages
 */
import fs from 'node:fs';
import path from 'node:path';

import { FSWatcher, watch } from 'chokidar';

/**
 * Importing user defined packages
 */
import { InternalError, NeverError } from '@lib/errors';
import { Utils } from '@lib/internal.utils';
import { tryCatch } from '@lib/shorthands';
import { utils } from '@lib/utils';

import { type Logger } from './logger';

/**
 * Defining types
 */

export interface ConfigOptions<T = any> {
  envKey?: string;
  isProdRequired?: boolean;
  validateType?: 'number' | 'boolean' | 'integer';
  validator?: (value: string) => boolean;
  isArray?: boolean;
  defaultValue?: string;
  allowedValues?: string[];
  transform?: (value: string) => T;
  reloadable?: boolean;
}

export type ConfigChangeCallback<Configs> = (key: keyof Configs, newValue: any) => void;

export type NodeEnv = 'development' | 'production' | 'test';

export type LogLevel = 'silly' | 'debug' | 'http' | 'info' | 'warn' | 'error';

export type Runtime = 'node' | 'edge' | 'deno' | 'browser' | 'bun' | 'unknown';

type ExtractPrefixes<T extends string> = T extends `${infer Prefix}.${infer Rest}` ? Prefix | `${Prefix}.${ExtractPrefixes<Rest>}` : never;

export type ConfigKey<Configs> = (keyof Configs & string) | ExtractPrefixes<keyof Configs & string>;

export interface ConfigRecords {
  /** Application configs */
  'app.env': NodeEnv;
  'app.name': string;

  /** Log configs */
  'log.level': LogLevel;
  'log.dir': string;
  'log.buffer.size': number;

  /** AWS configs */
  'aws.region': string;
  'aws.cloudwatch.log-group': string;
  'aws.cloudwatch.log-stream': string;
  'aws.cloudwatch.upload-rate': number;
}

/**
 * Declaring the constants
 */
const INTEGER_REGEX = /^-?\d+$/;
const NUMBER_REGEX = /^-?\d+(\.\d+)?$/;
const BOOLEAN_CONFIG_OPTIONS: Partial<ConfigOptions> = { allowedValues: ['true', 'false'], transform: val => val === 'true' };
const NUMBER_CONFIG_OPTIONS: Partial<ConfigOptions> = { validator: val => NUMBER_REGEX.test(val), transform: val => Number(val) };
const INTEGER_CONFIG_OPTIONS: Partial<ConfigOptions> = { validator: val => INTEGER_REGEX.test(val), transform: val => Number(val) };

export class ConfigService<Configs extends ConfigRecords = ConfigRecords> {
  private readonly cache = new Map<keyof Configs, any>();
  private readonly loadedOptions = new Map<keyof Configs, Readonly<ConfigOptions>>();

  private readonly envFilePaths: string[] = [];
  private readonly subscribers = new Map<string, Set<ConfigChangeCallback<Configs>>>();

  private logger: Logger;
  private envVars: Record<string, string | undefined> = {};
  private fsWatcher: FSWatcher | null = null;

  constructor(configs?: Partial<Configs>) {
    /** Load from env files specified in ENV_FILES (comma separated) */
    const envFiles = utils.string.parseCsv(process.env.ENV_FILES ?? '');
    if (envFiles.length > 0) {
      const filePaths = envFiles.map(p => path.resolve(p));
      this.envFilePaths = filePaths;
      const envVars = this.loadEnvFiles(filePaths);
      Object.assign(this.envVars, envVars);
    }

    const defaultAppName = 'shadow-app';
    const appEnvs = ['development', 'production', 'test'];
    const logLevels = ['silly', 'debug', 'http', 'info', 'warn', 'error'];

    this.load('app.env', { envKey: 'NODE_ENV', allowedValues: appEnvs, defaultValue: 'development' });
    this.load('app.name', { defaultValue: defaultAppName });

    this.load('log.level', { allowedValues: logLevels, defaultValue: this.isDev() ? 'debug' : 'info' });
    this.load('log.dir', { defaultValue: 'logs' });
    this.load('log.buffer.size', { defaultValue: '10000', validateType: 'number' });

    this.load('aws.region', { defaultValue: 'ap-south-1' });
    this.load('aws.cloudwatch.log-group', { defaultValue: defaultAppName });
    this.load('aws.cloudwatch.log-stream', { defaultValue: defaultAppName });
    this.load('aws.cloudwatch.upload-rate', { defaultValue: '2000', validateType: 'number' });

    if (configs && Object.keys(configs).length > 0) {
      for (const key in configs) this.cache.set(key, configs[key]);
    }
  }

  private log(level: Exclude<LogLevel, 'silly'>, message: string) {
    if (this.logger) this.logger[level](message);
    else console.log(`{"level":"${level}","timestamp": "${new Date().toISOString()}","label": "ConfigService","message": "${message}"}`); // eslint-disable-line no-console
  }

  private parseEnvFile(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      if (!key) continue;

      const rawValue = trimmed.slice(eqIndex + 1).trim();
      const hasQuotes = utils.string.startsAndEndsWith(rawValue, '"') || utils.string.startsAndEndsWith(rawValue, "'");
      result[key] = hasQuotes ? rawValue.slice(1, -1) : rawValue;
    }
    return result;
  }

  private loadEnvFiles(files: string[]): Record<string, string> {
    const envs: Record<string, string> = {};
    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const envVars = this.parseEnvFile(content);
        Object.assign(envs, envVars);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.log('error', `Failed to load env file at path '${filePath}'. Error: ${errorMessage}`);
      }
    }
    return envs;
  }

  private toEnvKey(name: keyof Configs): string {
    const loadOpts = this.loadedOptions.get(name);
    if (!loadOpts) throw new NeverError(`Config key '${name.toString()}' not loaded yet`);
    if (loadOpts.envKey) return loadOpts.envKey;

    if (typeof name !== 'string') throw new NeverError('Config key must be a string if envKey is not provided');
    return name.toUpperCase().replace(/[.-]/g, '_');
  }

  private resolveConfigValue(name: keyof Configs): unknown {
    const opts = this.loadedOptions.get(name);
    if (!opts) throw new NeverError(`Config key '${name.toString()}' not loaded yet`);

    const envKey = this.toEnvKey(name);
    let value = this.envVars[envKey]?.trim();
    const processEnvValue = process.env[envKey]?.trim();
    if (processEnvValue) value = processEnvValue;
    if (!value) {
      if (this.isProd() && opts.isProdRequired) throw new InternalError(`Environment Variable '${envKey}' not set`);
      else if (opts.defaultValue !== undefined) value = opts.defaultValue;
      else return;
    }
    const values = opts.isArray ? value.split(',').filter(val => val !== '') : [value];

    /** Allowed values validation */
    if (opts.allowedValues) {
      for (const val of values) {
        if (!opts.allowedValues.includes(val)) {
          const allowedValues = opts.allowedValues.map(v => `'${v}'`).join(', ');
          throw new InternalError(`Environment Variable '${envKey}' has invalid value '${val}', must be one of [${allowedValues}]`);
        }
      }
    }

    /** Custom validation */
    if (opts.validator) {
      for (const val of values) {
        if (!opts.validator(val)) throw new InternalError(`Environment Variable '${envKey}' has invalid value '${val}', validation failed`);
      }
    }

    const transformedValues = values.map(val => (opts.transform ? opts.transform(val) : val));
    return opts.isArray ? transformedValues : transformedValues[0];
  }

  load(name: keyof Configs, opts: ConfigOptions = {}): this {
    if (opts.validateType === 'boolean') Object.assign(opts, BOOLEAN_CONFIG_OPTIONS);
    else if (opts.validateType === 'number') Object.assign(opts, NUMBER_CONFIG_OPTIONS);
    else if (opts.validateType === 'integer') Object.assign(opts, INTEGER_CONFIG_OPTIONS);

    /**
     * Prevent loading the same config key multiple times as it can lead to unexpected behavior, especially with hot reloading
     * Allowing multiple loads in test environment to facilitate testing with different config values within the same test suite
     */
    if (!this.isTest() && this.loadedOptions.has(name)) throw new InternalError(`Config key '${name.toString()}' is already loaded`);
    this.loadedOptions.set(name, Object.freeze(opts));

    const result = tryCatch(() => this.resolveConfigValue(name));
    if (!result.success) Utils.exit(result.error.message);
    if (result.data !== undefined) this.cache.set(name, result.data);

    return this;
  }

  private reload(): void {
    this.log('debug', 'Reloading config due to env file change');
    const newEnvVars = this.loadEnvFiles(this.envFilePaths);
    for (const [name, opts] of this.loadedOptions.entries()) {
      if (!opts.reloadable) continue;

      /** Check if relevant env var has changed, if not skip processing this config */
      const envKey = this.toEnvKey(name);
      const oldEnvValue = this.envVars[envKey];
      const newEnvValue = newEnvVars[envKey];
      if (oldEnvValue === newEnvValue) continue;

      this.envVars[envKey] = newEnvValue;
      const result = tryCatch(() => this.resolveConfigValue(name));
      if (!result.success) {
        this.envVars[envKey] = oldEnvValue;
        this.log('error', `Failed to reload config key '${name.toString()}': ${result.error.message}`);
        continue;
      }

      const oldValue = this.cache.get(name);
      const newValue = result.data;
      if (oldValue !== newValue) {
        this.cache.set(name, newValue);
        this.log('info', `Config key '${name.toString()}' reloaded with new value`);
        this.notifySubscribers(name.toString(), newValue);
      }
    }
  }

  enableHotReloading(): void {
    if (this.envFilePaths.length === 0 || this.fsWatcher) return;

    this.fsWatcher = watch(this.envFilePaths, {
      depth: 0,
      usePolling: true,
      interval: 1000,
      ignoreInitial: true,
      ignored: filePath => !this.envFilePaths.includes(path.resolve(filePath)),
    });

    this.fsWatcher.on('change', () => this.reload());
    this.log('info', `Hot reloading enabled for env files: ${this.envFilePaths.join(', ')}`);
  }

  disableHotReloading(): void {
    if (!this.fsWatcher) return;
    this.fsWatcher.close();
    this.fsWatcher = null;
    this.log('info', 'Hot reloading disabled');
  }

  subscribe(key: ConfigKey<ConfigRecords>, callback: ConfigChangeCallback<Configs>): () => void {
    if (!this.subscribers.has(key)) this.subscribers.set(key, new Set());
    this.subscribers.get(key)?.add(callback);

    return () => {
      const callbacks = this.subscribers.get(key);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) this.subscribers.delete(key);
      }
    };
  }

  private notifySubscribers(key: string, newValue: any): void {
    for (const [subKey, callbacks] of this.subscribers) {
      const isMatch = subKey === key || key.startsWith(subKey + '.');
      if (!isMatch) continue;
      for (const callback of callbacks) tryCatch(() => callback(key as keyof Configs, newValue));
    }
  }

  isProd(): boolean {
    return this.cache.get('app.env') === 'production';
  }

  isDev(): boolean {
    return this.cache.get('app.env') === 'development';
  }

  isTest(): boolean {
    return this.cache.get('app.env') === 'test';
  }

  get<T extends keyof Configs>(key: T): Configs[T] {
    return this.cache.get(key);
  }

  getOrThrow<T extends keyof Configs>(key: T): Exclude<Configs[T], null> {
    const value = this.cache.get(key);
    if (value == null) throw new Error(`Expected config value for '${key.toString()}' to be set`);
    return value;
  }

  getRuntime(): Runtime {
    const globalRef = global as any;
    if (typeof globalRef.Deno !== 'undefined' && typeof globalRef.Deno.version !== 'undefined') return 'deno';
    if (typeof globalRef.Bun !== 'undefined' && typeof globalRef.Bun.version !== 'undefined') return 'bun';
    if (typeof globalRef.process !== 'undefined' && globalRef.process.versions != null) {
      if (globalRef.process.versions.node != null) return 'node';
      if (globalRef.process.versions.edge != null) return 'edge';
    }
    if (typeof globalRef.window !== 'undefined' && typeof globalRef.document !== 'undefined') return 'browser';
    return 'unknown';
  }
}

const globalRef = global as any;
export const Config: ConfigService = globalRef.configService || (globalRef.configService = new ConfigService());
