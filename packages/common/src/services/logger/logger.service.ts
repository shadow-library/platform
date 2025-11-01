/**
 * Importing npm packages
 */
import { hostname } from 'node:os';

import fastRedact from 'fast-redact';
import { Logform, createLogger, format as customFormat } from 'winston';
import Transport from 'winston-transport';

/**
 * Importing user defined packages
 */
import { InternalError } from '@lib/errors';

import { format as formats } from './formats';
import { CloudWatchTransport, ConsoleTransport, FileTransport } from './transports';
import { Config } from '../config.service';

/**
 * Defining types
 */

export type LogData = Record<string | number | symbol, unknown>;

export type redactFn = <T>(input: T) => string | T;

export type AttachableTransports = 'console:pretty' | 'console:json' | 'file:json' | 'cloudwatch:json';

export type ContextProvider = () => LogData;

interface ContextProviderConfig {
  namespace: string;
  provider: ContextProvider;
}

export interface Logger {
  verbose(message: string, ...meta: any[]): void;
  debug(message: string, ...meta: any[]): void;
  info(message: string, ...meta: any[]): void;
  http(message: string, ...meta: any[]): void;
  warn(message: string, ...meta: any[]): void;
  error(message: string, ...meta: any[]): void;
}

/**
 * Declaring the constants
 */
const noop = new Transport({ log: () => {} }); // eslint-disable-line @typescript-eslint/no-empty-function

class LoggerStatic {
  private readonly logger = createLogger({ level: Config.get('log.level') });
  private getLogMetadata: () => object = () => ({});
  private readonly contextProviders: ContextProviderConfig[] = [];

  private getLogContext(): LogData {
    const context: LogData = {};
    for (const { namespace, provider } of this.contextProviders) {
      context[namespace] ??= {};
      const contextData = provider();
      Object.assign(context[namespace] as LogData, contextData);
    }
    return context;
  }

  isDebugEnabled(): boolean {
    return this.logger.isDebugEnabled();
  }

  setDefaultMetadata(metadata: object): this {
    this.logger.defaultMeta = metadata;
    return this;
  }

  setLogMetadataProvider(getLogMetadata: () => object): this {
    this.getLogMetadata = getLogMetadata;
    return this;
  }

  addContextProvider(namespace: string, provider: ContextProvider): this {
    this.contextProviders.push({ namespace, provider });
    return this;
  }

  /** Creates a redactor to remove sensitive fields. This mutates the original value. If no censor is given, the field is removed */
  getRedactor(paths: string[], censor: string | ((value: any) => any) = 'xxxx'): redactFn {
    return fastRedact({ paths, serialize: false, censor });
  }

  /** Adds a transport to the logger */
  addTransport(transport: Transport): this {
    const index = this.logger.transports.findIndex(t => t === noop);
    if (index >= 0) this.logger.remove(noop);
    this.logger.add(transport);
    return this;
  }

  /* istanbul ignore next */
  attachTransport(type: AttachableTransports): this {
    let transport: Transport | null = null;
    const appName = Config.get('app.name');
    const metadataFormat = customFormat(info => Object.assign(info, this.getLogMetadata(), this.getLogContext()));
    const baseFormats = [formats.errors({ stack: true }), metadataFormat()];

    switch (type) {
      case 'console:pretty': {
        const format = formats.combine(...baseFormats, formats.colorize(), formats.brief());
        transport = new ConsoleTransport({ handleExceptions: true, handleRejections: true }).addFormat(format);
        break;
      }

      case 'console:json': {
        const format = formats.combine(...baseFormats, formats.json());
        transport = new ConsoleTransport({ handleExceptions: true, handleRejections: true }).addFormat(format);
        break;
      }

      case 'file:json': {
        const filename = appName;
        const dirname = Config.get('log.dir');
        const format = formats.combine(...baseFormats, formats.json());
        transport = new FileTransport({ dirname, filename, handleExceptions: true, handleRejections: true }).addFormat(format);
        break;
      }

      case 'cloudwatch:json': {
        const format = formats.combine(...baseFormats);
        const definedLogStreamName = Config.get('aws.cloudwatch.log-stream');
        const logStreamName = definedLogStreamName === appName ? hostname() : definedLogStreamName;
        transport = new CloudWatchTransport({ handleExceptions: true, handleRejections: true, logStreamName }).addFormat(format);
        break;
      }

      default: {
        throw new InternalError(`Unknown transport type '${type}'`);
      }
    }

    if (transport) this.addTransport(transport);
    return this;
  }

  /** Returns a child logger with the provided metadata */
  getLogger(namespace: string, label: string): Logger;
  getLogger(metadata: object): Logger;
  getLogger(metadata: string | object, label?: string): Logger {
    if (this.logger.transports.length === 0) this.addTransport(noop);
    return this.logger.child(typeof metadata === 'string' ? { namespace: metadata, label } : metadata);
  }

  /* istanbul ignore next */
  addDefaultTransports(format?: Logform.Format): this {
    const env = Config.get('app.env');
    const metadataFormat = customFormat(info => Object.assign(info, this.getLogMetadata()));
    const baseFormats = [formats.errors({ stack: true }), metadataFormat()];
    if (format) baseFormats.unshift(format);

    if (env === 'development') {
      const format = formats.combine(...baseFormats, formats.colorize(), formats.brief());
      const transport = new ConsoleTransport({ handleExceptions: true, handleRejections: true }).addFormat(format);
      this.addTransport(transport);
    }

    if (env === 'production') {
      const format = formats.combine(...baseFormats);
      const transport = new CloudWatchTransport({ handleExceptions: true, handleRejections: true }).addFormat(format);
      this.addTransport(transport);
    }

    const enableFileLog = Config.get('log.dir') !== 'false' && env === 'development';
    const isTestDebug = env === 'test' && !!process.env.TEST_DEBUG;
    if (enableFileLog || isTestDebug) {
      const dirname = Config.get('log.dir');
      const filename = Config.get('app.name');
      const format = formats.combine(...baseFormats, formats.json());
      const transport = new FileTransport({ dirname, filename, handleExceptions: true, handleRejections: true }).addFormat(format);
      this.addTransport(transport);
    }

    return this;
  }

  close(): void {
    this.logger.close();
  }
}

export const Logger = new LoggerStatic();
