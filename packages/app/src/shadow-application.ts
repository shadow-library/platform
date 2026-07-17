/**
 * Importing npm packages
 */
import { AppError, Logger } from '@shadow-library/common';
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from './constants';
import { InstanceWrapper, ModuleRef, ModuleRegistry } from './injector';
import { Provider, ProviderToken, TokenValue } from './interfaces';

/**
 * Defining types
 */

export interface ShadowApplicationOptions {
  enableShutdownHooks?: false | NodeJS.Signals[];

  /**
   * Providers that replace existing providers by token, wherever they are declared.
   * Intended for tests: swap a real provider for a fake without editing module metadata.
   */
  overrides?: Provider[];
}

/**
 * Declaring the constants
 */
const DEFAULT_OPTIONS: ShadowApplicationOptions = { enableShutdownHooks: ['SIGINT', 'SIGTERM'] };

export class ShadowApplication {
  private readonly logger = Logger.getLogger(NAMESPACE, 'ShadowApplication');

  private readonly main: Class<unknown>;
  private readonly registry: ModuleRegistry;
  private readonly options: ShadowApplicationOptions;

  constructor(module: Class<unknown>, options: ShadowApplicationOptions = {}) {
    this.main = module;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.registry = new ModuleRegistry(module, this.options.overrides);
  }

  private enableGracefulShutdown(): void {
    const signals = this.options.enableShutdownHooks;
    if (!signals || signals.length === 0) return;

    this.logger.debug(`Graceful shutdown enabled for signals: ${signals.join(', ')}`);
    let receivedSignal = false;
    for (const signal of signals) {
      const cleanup = async () => {
        if (receivedSignal) return;
        receivedSignal = true;

        this.logger.debug(`Received ${signal}, shutting down application`);
        await this.stop();
        this.logger.info('Application stopped');
        Logger.close();
        signals.forEach(sig => process.removeListener(sig, cleanup));
        process.kill(process.pid, signal);
      };

      process.on(signal, cleanup);
    }
  }

  isInitiated(): boolean {
    const main = this.registry.get(this.main);
    return main.isInitiated();
  }

  async init(): Promise<this> {
    if (this.isInitiated()) return this;
    await this.registry.init();
    return this;
  }

  async start(): Promise<this> {
    if (!this.isInitiated()) await this.init();
    this.logger.debug('Starting application');
    const modules = this.registry.get();
    const start = modules.map(module => module.start());
    await Promise.all(start);
    this.logger.info('Application started');
    this.enableGracefulShutdown();
    return this;
  }

  async stop(): Promise<this> {
    if (!this.isInitiated()) return this;
    this.logger.debug('Stopping application');
    await this.registry.terminate();
    this.logger.info('Application stopped');
    return this;
  }

  select(module: Class<any>): ModuleRef {
    const mod = this.registry.get(module);
    const moduleRef = mod['getInternalProvider'](ModuleRef) as InstanceWrapper;
    return moduleRef.getInstance();
  }

  get<Token extends ProviderToken>(token: Token): TokenValue<Token> {
    if (!this.isInitiated()) throw AppError.internal(`Application not yet initialized`);
    const modules = this.registry.get();
    for (const module of modules) {
      const wrapper = module.getProvider(token, true);
      if (wrapper) return wrapper.getInstance() as TokenValue<Token>;
    }

    const providerName = typeof token === 'function' ? token.name : token.toString();
    throw AppError.internal(`Provider '${providerName}' not found or exported`);
  }
}
