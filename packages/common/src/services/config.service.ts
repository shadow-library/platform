/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { Utils } from '../internal.utils';

/**
 * Defining types
 */

export interface ConfigOptions<T = any> {
  envKey?: string;
  isProdRequired?: boolean;
  validateType?: 'number' | 'boolean';
  validator?: (value: string) => boolean;
  isArray?: boolean;
  defaultValue?: string;
  allowedValues?: string[];
  transform?: (value: string) => T;
}

export type NodeEnv = 'development' | 'production' | 'test';

export type LogLevel = 'silly' | 'debug' | 'http' | 'info' | 'warn' | 'error';

export type Runtime = 'node' | 'edge' | 'deno' | 'browser' | 'bun' | 'unknown';

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

export class ConfigService<Configs extends ConfigRecords = ConfigRecords> {
  private readonly cache = new Map<keyof Configs, any>();

  constructor(configs?: Partial<Configs>) {
    if (configs && Object.keys(configs).length > 0) {
      for (const key in configs) this.cache.set(key, configs[key]);
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
  }

  load(name: keyof Configs, opts: ConfigOptions = {}): this {
    if (this.cache.has(name)) return this;
    if (opts.validateType === 'boolean') opts = { ...opts, allowedValues: ['true', 'false'], transform: val => val === 'true' };
    if (opts.validateType === 'number') opts = { ...opts, validator: val => !isNaN(Number(val)), transform: val => Number(val) };

    const envKey = opts.envKey ?? (name as string).toUpperCase().replace(/[.-]/g, '_');
    let value = process.env[envKey]?.trim();
    if (!value) {
      if (this.isProd() && opts.isProdRequired) Utils.exit(`Environment Variable '${envKey}' not set`);
      else if (opts.defaultValue !== undefined) value = opts.defaultValue;
      else return this;
    }
    const values = opts.isArray ? value.split(',').filter(val => val !== '') : [value];

    /** Allowed values validation */
    if (opts.allowedValues) {
      for (const val of values) {
        if (!opts.allowedValues.includes(val)) {
          const allowedValues = opts.allowedValues.map(v => `'${v}'`).join(', ');
          Utils.exit(`Environment Variable '${envKey}' has invalid value '${val}', must be one of [${allowedValues}]`);
        }
      }
    }

    /** Custom validation */
    if (opts.validator) {
      for (const val of values) {
        if (!opts.validator(val)) Utils.exit(`Environment Variable '${envKey}' has invalid value '${val}', validation failed`);
      }
    }

    const transformedValues = values.map(val => (opts.transform ? opts.transform(val) : val));
    this.cache.set(name, opts.isArray ? transformedValues : transformedValues[0]);
    return this;
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
